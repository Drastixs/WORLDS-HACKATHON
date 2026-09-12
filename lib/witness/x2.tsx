"use client";

import { X2Provider, useX2, useX2Message, useX2Track, type FileRef } from "@reactor-models/x2";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { VanVariant, WitnessX2, WitnessX2Status } from "./contract";
import type { ViewPose } from "./geometry";
import { createModelFeed, type ModelFeed, type ModelSceneFrame } from "./model-feed";
import { vanPrompt } from "./prompts";

const PANORAMA_URL = "/bastille-court-photosphere.jpg";
// X2 follows the reference image over the prompt, so each appearance uses a matching reference.
const VAN_REFERENCE_URLS: Record<VanVariant, string> = {
  white: "/witness/van-reference.jpg",
  navy: "/witness/van-reference-navy.jpg",
};
// Until the phone reports a settled pose: straight ahead at the phone viewer's zoom.
const DEFAULT_POSE: ViewPose = { yaw: 0, pitch: 0, zoom: 45 };
const READY_TIMEOUT_MS = 120_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

// A session can only be operated by the token that created it, so the token is cached in
// memory for its lifetime (never in the HTTP cache) and parallel requests share one mint.
let cachedToken: { jwt: string; expiresAtMs: number } | null = null;
let inflightToken: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS) return cachedToken.jwt;
  if (inflightToken) return inflightToken;
  inflightToken = (async () => {
    try {
      const response = await fetch("/api/reactor/token", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as {
        jwt?: string;
        expires_at?: number;
        error?: string;
      };
      if (!response.ok || !body.jwt || !body.expires_at) {
        throw new Error(body.error ?? `Token request failed (${response.status}).`);
      }
      cachedToken = { jwt: body.jwt, expiresAtMs: body.expires_at * 1000 };
      return body.jwt;
    } finally {
      inflightToken = null;
    }
  })();
  return inflightToken;
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|capacity|RATE_LIMITED/i.test(message)) {
    return "Reactor has no free capacity right now. Try again in a moment.";
  }
  return message;
}

function isFeedCancellation(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

const WitnessX2Context = createContext<WitnessX2 | null>(null);

function WitnessX2Session({ children }: { children: ReactNode }) {
  const x2 = useX2();
  const outputTrack = useX2Track("main_video");
  const [status, setStatus] = useState<WitnessX2Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariantState] = useState<VanVariant>("white");
  const [settled, setSettled] = useState<{ pose: ViewPose | null; at: number }>({ pose: null, at: 0 });

  const feed = useRef<ModelFeed | null>(null);
  const feedPromise = useRef<Promise<ModelFeed> | null>(null);
  const feedEpoch = useRef(0);
  const sessionEpoch = useRef(0);
  const startTask = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const sceneFrameRef = useRef<ModelSceneFrame | null>(null);
  const sceneRevisionRef = useRef<string | null>(null);
  const connectionStatus = useRef(x2.status);
  const variantRef = useRef<VanVariant>("white");
  const poseRef = useRef<ViewPose | null>(null);
  const statusRef = useRef<WitnessX2Status>("idle");
  // Uploads belong to one session; cleared whenever a new one starts or stops.
  const references = useRef<Partial<Record<VanVariant, FileRef>>>({});

  useEffect(() => {
    connectionStatus.current = x2.status;
    // A session that drops while generating (moderation, capacity, network) is an error.
    if (x2.status === "disconnected" && statusRef.current === "generating") {
      statusRef.current = "error";
      setStatus("error");
      setError("The reconstruction session ended. Start it again.");
    }
  }, [x2.status]);

  useX2Message((message) => {
    const { type, data } = message as { type: string; data?: { command?: string; reason?: string } };
    if (type === "command_error") setError(`${data?.command ?? "command"}: ${data?.reason ?? "rejected"}`);
  });

  const update = useCallback((next: WitnessX2Status) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const referenceFor = useCallback(
    async (next: VanVariant) => {
      const uploaded = references.current[next];
      if (uploaded) return uploaded;
      const image = await (await fetch(VAN_REFERENCE_URLS[next])).blob();
      const fileRef = await x2.uploadFile(image);
      references.current[next] = fileRef;
      return fileRef;
    },
    [x2],
  );

  const ensureFeed = useCallback(async () => {
    if (feed.current) return feed.current;
    if (feedPromise.current) return feedPromise.current;
    const epoch = feedEpoch.current;
    const pending = (async () => {
      const created = await createModelFeed(PANORAMA_URL, poseRef.current ?? DEFAULT_POSE);
      if (epoch !== feedEpoch.current) {
        created.dispose();
        throw new DOMException("Model feed creation was cancelled.", "AbortError");
      }
      feed.current = created;
      if (sceneFrameRef.current) created.setSceneFrame(sceneFrameRef.current);
      if (poseRef.current) created.setPose(poseRef.current);
      created.setMirrored(variantRef.current === "navy");
      return created;
    })();
    feedPromise.current = pending;
    try {
      return await pending;
    } finally {
      if (feedPromise.current === pending) feedPromise.current = null;
    }
  }, []);

  const prepareFeed = useCallback(async () => {
    try {
      await ensureFeed();
    } catch (caught) {
      if (isFeedCancellation(caught)) {
        if (mountedRef.current) update("idle");
        return;
      }
      setError(describeError(caught));
    }
  }, [ensureFeed]);

  const start = useCallback(() => {
    if (statusRef.current === "connecting" || statusRef.current === "generating") return Promise.resolve();
    const epoch = ++sessionEpoch.current;
    const assertCurrent = () => {
      if (epoch !== sessionEpoch.current || !mountedRef.current) {
        throw new DOMException("Reconstruction start was cancelled.", "AbortError");
      }
    };
    setError(null);
    references.current = {};
    update("connecting");
    const pending = (async () => {
      try {
        const currentFeed = await ensureFeed();
        assertCurrent();
        if (poseRef.current) currentFeed.setPose(poseRef.current);
        currentFeed.setMirrored(variantRef.current === "navy");

        if (connectionStatus.current === "disconnected") {
          await x2.connect();
          assertCurrent();
        }
        const deadline = performance.now() + READY_TIMEOUT_MS;
        while (connectionStatus.current !== "ready") {
          assertCurrent();
          if (performance.now() > deadline) throw new Error("The X2 session did not become ready in time.");
          await new Promise((resolve) => window.setTimeout(resolve, 150));
        }
        assertCurrent();

        await x2.publish("source", currentFeed.track);
        assertCurrent();
        const uploadedReference = await referenceFor(variantRef.current);
        assertCurrent();
        await x2.setReferenceImage({ reference_image: uploadedReference });
        assertCurrent();
        // Generation starts on its own once a prompt is set and source frames are arriving.
        await x2.setPrompt({ prompt: vanPrompt(variantRef.current) });
        assertCurrent();
        setSettled((current) => ({ pose: current.pose ?? DEFAULT_POSE, at: performance.now() }));
        update("generating");
      } catch (caught) {
        if (isFeedCancellation(caught) || epoch !== sessionEpoch.current || !mountedRef.current) return;
        update("error");
        setError(describeError(caught));
      }
    })();
    startTask.current = pending;
    void pending.finally(() => {
      if (startTask.current === pending) startTask.current = null;
    });
    return pending;
  }, [ensureFeed, referenceFor, update, x2]);

  const setPose = useCallback((pose: ViewPose) => {
    poseRef.current = pose;
    feed.current?.setPose(pose);
    setSettled({ pose, at: performance.now() });
  }, []);

  const setSceneFrame = useCallback((next: ModelSceneFrame) => {
    const revisionChanged = sceneRevisionRef.current !== null && sceneRevisionRef.current !== next.sceneRevision;
    sceneRevisionRef.current = next.sceneRevision;
    sceneFrameRef.current = next;
    feed.current?.setSceneFrame(next);
    if (revisionChanged) setSettled((current) => ({ pose: current.pose, at: performance.now() }));
  }, []);

  const setVariant = useCallback(
    async (next: VanVariant) => {
      if (variantRef.current === next) return;
      variantRef.current = next;
      setVariantState(next);
      feed.current?.setMirrored(next === "navy");
      // The feed changed, so X2's output is stale until it catches up.
      setSettled((current) => ({ pose: current.pose, at: performance.now() }));
      if (statusRef.current !== "generating") return;
      try {
        // Prompt first, so the restart that a reference swap triggers already carries it.
        await x2.setPrompt({ prompt: vanPrompt(next) });
        await x2.setReferenceImage({ reference_image: await referenceFor(next) });
      } catch (caught) {
        update("error");
        setError(describeError(caught));
      }
    },
    [referenceFor, update, x2],
  );

  const stop = useCallback(async () => {
    sessionEpoch.current += 1;
    feedEpoch.current += 1;
    feedPromise.current = null;
    await startTask.current?.catch(() => undefined);
    try {
      await x2.unpublish("source");
    } catch {
      // Already gone.
    }
    await x2.disconnect().catch(() => undefined);
    feed.current?.dispose();
    feed.current = null;
    references.current = {};
    update("idle");
  }, [update, x2]);

  const feedGuide = useCallback(() => feed.current?.currentGuide() ?? null, []);
  const feedMask = useCallback(() => feed.current?.currentMask() ?? null, []);
  const inspectFeed = useCallback(() => feed.current?.inspection() ?? null, []);

  useEffect(() => () => {
    mountedRef.current = false;
    sessionEpoch.current += 1;
    feedEpoch.current += 1;
    feedPromise.current = null;
    feed.current?.dispose();
    feed.current = null;
  }, []);

  const value = useMemo<WitnessX2>(
    () => ({
      status,
      error,
      outputTrack,
      variant,
      settledPose: settled.pose,
      settledAt: settled.at,
      feedGuide,
      feedMask,
      prepareFeed,
      setSceneFrame,
      inspectFeed,
      start,
      setPose,
      setVariant,
      stop,
    }),
    [error, feedGuide, feedMask, inspectFeed, outputTrack, prepareFeed, setPose, setSceneFrame, setVariant, settled, start, status, stop, variant],
  );

  return <WitnessX2Context.Provider value={value}>{children}</WitnessX2Context.Provider>;
}

export function WitnessX2Provider({ children }: { children: ReactNode }) {
  return (
    <X2Provider jwtToken={fetchToken}>
      <WitnessX2Session>{children}</WitnessX2Session>
    </X2Provider>
  );
}

export function useWitnessX2(): WitnessX2 {
  const value = useContext(WitnessX2Context);
  if (!value) throw new Error("useWitnessX2 must be used inside <WitnessX2Provider>.");
  return value;
}
