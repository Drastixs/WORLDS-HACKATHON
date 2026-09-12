"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ProjectedGuide, ViewPose } from "../../lib/witness/geometry";
import {
  MODEL_FEED_HEIGHT,
  MODEL_FEED_WIDTH,
  poseDistance,
  posesMatch,
} from "../../lib/witness/geometry";
import { useWitnessX2 } from "../../lib/witness/x2";
import {
  loopCacheKey,
  setReconstructionMode,
  witnessLoopCache,
  type LoopCacheEntry,
} from "./loop-cache";

export const SETTLE_MS = 600;
export const SETTLE_MOVEMENT = (0.5 * Math.PI) / 180;
export const VIEW_TOLERANCE = (3 * Math.PI) / 180;
export const REVEAL_DELAY_MS = 2_500;
export const RECORD_WARMUP_MS = 500;
export const LOOP_MS = 4_000;
// X2 keeps showing the old appearance for a while after a correction; recording before it has
// changed would cache the old van under the new variant and replay it indefinitely.
export const APPEARANCE_SETTLE_MS = 6_000;
export const MASK_MARGIN_CSS_PX = 14;
export const MASK_BLUR_CSS_PX = 6;

function copyPose(pose: ViewPose): ViewPose {
  return { yaw: pose.yaw, pitch: pose.pitch, zoom: pose.zoom };
}

function copyGuide(guide: ProjectedGuide): ProjectedGuide {
  return {
    outline: guide.outline.map((point) => ({ ...point })),
    wheels: guide.wheels.map((wheel) => ({ ...wheel })),
    bounds: { ...guide.bounds },
  };
}

function recordingMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

export function X2Overlay({
  poseRef,
  sceneRevision = "v1",
}: {
  poseRef: MutableRefObject<ViewPose>;
  sceneRevision?: string;
}) {
  const x2 = useWitnessX2();
  const x2Ref = useRef(x2);
  x2Ref.current = x2;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const replayVideoRef = useRef<HTMLVideoElement>(null);
  const compositeRef = useRef<HTMLCanvasElement | null>(null);
  const settleAnchorRef = useRef<ViewPose | null>(null);
  const stableSinceRef = useRef(0);
  const lastRequestedRef = useRef<ViewPose | null>(null);
  const replayEntryRef = useRef<LoopCacheEntry | null>(null);
  const recordingUnsupportedRef = useRef(false);
  const recordRetryAtRef = useRef(0);
  const variantChangedAtRef = useRef(0);
  const lastVariantRef = useRef(x2.variant);
  const [replayEntry, setReplayEntry] = useState<LoopCacheEntry | null>(null);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);

  useEffect(() => {
    if (lastVariantRef.current === x2.variant) return;
    lastVariantRef.current = x2.variant;
    variantChangedAtRef.current = performance.now();
  }, [x2.variant]);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;

    video.srcObject = x2.outputTrack ? new MediaStream([x2.outputTrack]) : null;
    if (x2.outputTrack) void video.play().catch(() => undefined);

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [x2.outputTrack]);

  useEffect(() => {
    const video = replayVideoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (!replayEntry) return;

    video.src = replayEntry.blobUrl;
    video.currentTime = 0;
    void video.play().catch(() => undefined);

    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [replayEntry]);

  useEffect(() => {
    const composite = document.createElement("canvas");
    compositeRef.current = composite;
    let animationFrame = 0;
    let active = true;
    let recording:
      | {
          recorder: MediaRecorder;
          stopTimer: number;
          discarded: boolean;
          pose: ViewPose;
          variant: "white" | "navy";
          settledAt: number;
          track: MediaStreamTrack;
        }
      | undefined;

    const showUpdating = (visible: boolean) => {
      if (updatingRef.current === visible) return;
      updatingRef.current = visible;
      setUpdating(visible);
    };

    const clear = (canvas: HTMLCanvasElement) => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };

    const selectReplay = (pose: ViewPose) => {
      const entry = witnessLoopCache.find(pose, x2.variant, sceneRevision, posesMatch) ?? null;
      if (
        entry?.key !== replayEntryRef.current?.key ||
        entry?.blobUrl !== replayEntryRef.current?.blobUrl
      ) {
        replayEntryRef.current = entry;
        setReplayEntry(entry);
      }
      return entry;
    };

    const startRecording = (now: number, guide: ProjectedGuide) => {
      if (
        recording ||
        recordingUnsupportedRef.current ||
        now < recordRetryAtRef.current ||
        now < x2.settledAt + REVEAL_DELAY_MS + RECORD_WARMUP_MS ||
        now < variantChangedAtRef.current + APPEARANCE_SETTLE_MS ||
        !x2.outputTrack ||
        !x2.settledPose
      ) {
        return;
      }

      const pose = copyPose(x2.settledPose);
      if (witnessLoopCache.find(pose, x2.variant, sceneRevision, posesMatch)) return;
      const mimeType = recordingMimeType();
      if (!mimeType) {
        recordingUnsupportedRef.current = true;
        return;
      }

      const settledAt = x2.settledAt;
      const variant = x2.variant;
      const track = x2.outputTrack;
      const guideSnapshot = copyGuide(guide);
      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(new MediaStream([track]), { mimeType });
      } catch {
        recordRetryAtRef.current = now + LOOP_MS;
        return;
      }

      const session = {
        recorder,
        stopTimer: 0,
        discarded: false,
        pose,
        variant,
        settledAt,
        track,
      };
      recording = session;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener("error", () => {
        session.discarded = true;
        recordRetryAtRef.current = performance.now() + LOOP_MS;
      });
      recorder.addEventListener("stop", () => {
        window.clearTimeout(session.stopTimer);
        if (recording === session) recording = undefined;

        const latest = x2Ref.current;
        const remainsCurrent =
          active &&
          !session.discarded &&
          chunks.length > 0 &&
          latest.outputTrack === track &&
          latest.variant === variant &&
          latest.settledAt === settledAt &&
          latest.settledPose !== null &&
          posesMatch(latest.settledPose, pose) &&
          posesMatch(poseRef.current, pose);
        if (!remainsCurrent) {
          recordRetryAtRef.current = performance.now() + RECORD_WARMUP_MS;
          return;
        }

        const blobUrl = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
        witnessLoopCache.put({
          key: loopCacheKey(pose, variant, sceneRevision),
          blobUrl,
          guide: guideSnapshot,
          pose,
          variant,
          sceneRevision,
          durationMs: LOOP_MS,
          createdAt: Date.now(),
        });
      });

      try {
        recorder.start(250);
        session.stopTimer = window.setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, LOOP_MS);
      } catch {
        recording = undefined;
        recordRetryAtRef.current = now + LOOP_MS;
      }
    };

    const render = (now: number) => {
      animationFrame = window.requestAnimationFrame(render);

      const currentPose = poseRef.current;
      const latestX2 = x2Ref.current;
      if (
        recording &&
        (poseDistance(currentPose, recording.pose) >= SETTLE_MOVEMENT ||
          Math.abs(currentPose.zoom - recording.pose.zoom) >= 0.5 ||
          latestX2.variant !== recording.variant ||
          latestX2.settledAt !== recording.settledAt ||
          latestX2.outputTrack !== recording.track)
      ) {
        recording.discarded = true;
      }
      const anchor = settleAnchorRef.current;
      if (!anchor || poseDistance(currentPose, anchor) >= SETTLE_MOVEMENT) {
        settleAnchorRef.current = copyPose(currentPose);
        stableSinceRef.current = now;
      } else if (now - stableSinceRef.current >= SETTLE_MS) {
        const differsFromSettled = !x2.settledPose || !posesMatch(currentPose, x2.settledPose);
        const differsFromRequest =
          !lastRequestedRef.current || !posesMatch(currentPose, lastRequestedRef.current);
        if (differsFromSettled && differsFromRequest) {
          const settledPose = copyPose(currentPose);
          lastRequestedRef.current = settledPose;
          x2.setPose(settledPose);
        }
      }

      const canvas = canvasRef.current;
      const liveVideo = liveVideoRef.current;
      const replayVideo = replayVideoRef.current;
      if (!canvas) return;
      const { width, height, dpr } = sizeCanvas(canvas);
      const cached = selectReplay(currentPose);
      const cachedReady =
        cached !== null &&
        replayEntryRef.current?.key === cached.key &&
        replayVideo !== null &&
        replayVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        posesMatch(currentPose, cached.pose);
      const liveReady =
        x2.status === "generating" &&
        Boolean(x2.outputTrack) &&
        Boolean(x2.settledPose) &&
        liveVideo !== null &&
        liveVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        posesMatch(currentPose, x2.settledPose!, VIEW_TOLERANCE) &&
        now - x2.settledAt > REVEAL_DELAY_MS;

      let source: HTMLVideoElement;
      let guide: ProjectedGuide | null;
      let fromCache = false;
      if (cachedReady) {
        source = replayVideo!;
        guide = cached!.guide;
        fromCache = true;
      } else if (liveReady) {
        source = liveVideo!;
        guide = x2.feedGuide();
      } else {
        clear(canvas);
        showUpdating(x2.status === "connecting" || x2.status === "generating");
        setReconstructionMode("updating");
        return;
      }

      if (!guide) {
        clear(canvas);
        showUpdating(false);
        setReconstructionMode("live");
        return;
      }

      if (composite.width !== width || composite.height !== height) {
        composite.width = width;
        composite.height = height;
      }
      const compositeContext = composite.getContext("2d");
      const overlayContext = canvas.getContext("2d");
      if (!compositeContext || !overlayContext) {
        clear(canvas);
        showUpdating(false);
        setReconstructionMode("updating");
        return;
      }

      const scale = height / MODEL_FEED_HEIGHT;
      const frameWidth = MODEL_FEED_WIDTH * scale;
      const dx = (width - frameWidth) / 2;
      const mapX = (x: number) => x * scale + dx;
      const mapY = (y: number) => y * scale;

      compositeContext.clearRect(0, 0, width, height);
      compositeContext.save();
      compositeContext.filter = `blur(${MASK_BLUR_CSS_PX * dpr}px)`;
      compositeContext.fillStyle = "white";
      compositeContext.strokeStyle = "white";
      compositeContext.lineJoin = "round";
      compositeContext.lineCap = "round";
      compositeContext.lineWidth = MASK_MARGIN_CSS_PX * dpr * 2;
      compositeContext.beginPath();
      guide.outline.forEach((point, index) => {
        const x = mapX(point.x);
        const y = mapY(point.y);
        if (index === 0) compositeContext.moveTo(x, y);
        else compositeContext.lineTo(x, y);
      });
      compositeContext.closePath();
      for (const wheel of guide.wheels) {
        compositeContext.moveTo(mapX(wheel.x) + wheel.r * scale, mapY(wheel.y));
        compositeContext.arc(mapX(wheel.x), mapY(wheel.y), wheel.r * scale, 0, Math.PI * 2);
      }
      compositeContext.fill();
      compositeContext.stroke();
      compositeContext.restore();

      compositeContext.save();
      compositeContext.globalCompositeOperation = "source-in";
      compositeContext.drawImage(source, dx, 0, frameWidth, height);
      compositeContext.restore();

      overlayContext.clearRect(0, 0, width, height);
      overlayContext.drawImage(composite, 0, 0);
      showUpdating(false);
      setReconstructionMode(fromCache ? "cached" : "live");
      if (!fromCache) startRecording(now, guide);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
      if (recording) {
        recording.discarded = true;
        window.clearTimeout(recording.stopTimer);
        if (recording.recorder.state !== "inactive") recording.recorder.stop();
        recording = undefined;
      }
      compositeRef.current = null;
      setReconstructionMode("updating");
    };
  }, [poseRef, sceneRevision, x2]);

  return (
    <>
      <canvas ref={canvasRef} className="x2-overlay" aria-hidden="true" />
      <video ref={liveVideoRef} className="x2-overlay__video" muted playsInline autoPlay />
      <video
        ref={replayVideoRef}
        className="x2-overlay__video"
        muted
        playsInline
        autoPlay
        loop
      />
      {updating ? (
        <div className="reconstruction-status" role="status">
          <span aria-hidden="true" />
          Updating reconstruction
        </div>
      ) : null}
    </>
  );
}
