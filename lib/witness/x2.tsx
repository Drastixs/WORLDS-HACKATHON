"use client";

import { X2Provider, useX2, useX2Message, useX2Track } from "@reactor-models/x2";
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
import { createModelFeed, type ModelFeed } from "./model-feed";
import { vanPrompt } from "./prompts";

const PANORAMA_URL = "/bastille-court-photosphere.jpg";
const VAN_REFERENCE_URL = "/witness/van-reference.jpg";
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

const WitnessX2Context = createContext<WitnessX2 | null>(null);

function WitnessX2Session({ children }: { children: ReactNode }) {
  const x2 = useX2();
  const outputTrack = useX2Track("main_video");
  const [status, setStatus] = useState<WitnessX2Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariantState] = useState<VanVariant>("white");
  const [settled, setSettled] = useState<{ pose: ViewPose | null; at: number }>({ pose: null, at: 0 });

  const feed = useRef<ModelFeed | null>(null);
  const connectionStatus = useRef(x2.status);
  const variantRef = useRef<VanVariant>("white");
  const poseRef = useRef<ViewPose | null>(null);
  const statusRef = useRef<WitnessX2Status>("idle");

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

  const start = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "generating") return;
    setError(null);
    update("connecting");
    try {
      feed.current ??= await createModelFeed(PANORAMA_URL, poseRef.current ?? DEFAULT_POSE);
      if (poseRef.current) feed.current.setPose(poseRef.current);
      feed.current.setMirrored(variantRef.current === "navy");

      if (connectionStatus.current === "disconnected") await x2.connect();
      const deadline = performance.now() + READY_TIMEOUT_MS;
      while (connectionStatus.current !== "ready") {
        if (performance.now() > deadline) throw new Error("The X2 session did not become ready in time.");
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }

      await x2.publish("source", feed.current.track);
      const reference = await (await fetch(VAN_REFERENCE_URL)).blob();
      await x2.setReferenceImage({ reference_image: await x2.uploadFile(reference) });
      // Generation starts on its own once a prompt is set and source frames are arriving.
      await x2.setPrompt({ prompt: vanPrompt(variantRef.current) });
      setSettled((current) => ({ pose: current.pose ?? DEFAULT_POSE, at: performance.now() }));
      update("generating");
    } catch (caught) {
      update("error");
      setError(describeError(caught));
    }
  }, [update, x2]);

  const setPose = useCallback((pose: ViewPose) => {
    poseRef.current = pose;
    feed.current?.setPose(pose);
    setSettled({ pose, at: performance.now() });
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
        await x2.setPrompt({ prompt: vanPrompt(next) });
      } catch (caught) {
        update("error");
        setError(describeError(caught));
      }
    },
    [update, x2],
  );

  const stop = useCallback(async () => {
    try {
      await x2.unpublish("source");
    } catch {
      // Already gone.
    }
    await x2.disconnect().catch(() => undefined);
    feed.current?.dispose();
    feed.current = null;
    update("idle");
  }, [update, x2]);

  const feedGuide = useCallback(() => feed.current?.currentGuide() ?? null, []);

  useEffect(() => () => feed.current?.dispose(), []);

  const value = useMemo<WitnessX2>(
    () => ({
      status,
      error,
      outputTrack,
      variant,
      settledPose: settled.pose,
      settledAt: settled.at,
      feedGuide,
      start,
      setPose,
      setVariant,
      stop,
    }),
    [error, feedGuide, outputTrack, setPose, setVariant, settled, start, status, stop, variant],
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
