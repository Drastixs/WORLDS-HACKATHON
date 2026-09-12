"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  MODEL_FEED_HEIGHT,
  MODEL_FEED_WIDTH,
  poseDistance,
  posesMatch,
  type ViewPose,
} from "../../lib/witness/geometry";
import { useWitnessX2 } from "../../lib/witness/x2";

export const SETTLE_MS = 600;
export const SETTLE_MOVEMENT = (0.5 * Math.PI) / 180;
export const VIEW_TOLERANCE = (3 * Math.PI) / 180;
export const REVEAL_DELAY_MS = 2_500;
export const MASK_MARGIN_CSS_PX = 14;
export const MASK_BLUR_CSS_PX = 6;

function copyPose(pose: ViewPose): ViewPose {
  return { yaw: pose.yaw, pitch: pose.pitch, zoom: pose.zoom };
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

export function X2Overlay({ poseRef }: { poseRef: MutableRefObject<ViewPose> }) {
  const x2 = useWitnessX2();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const compositeRef = useRef<HTMLCanvasElement | null>(null);
  const settleAnchorRef = useRef<ViewPose | null>(null);
  const stableSinceRef = useRef(0);
  const lastRequestedRef = useRef<ViewPose | null>(null);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = x2.outputTrack ? new MediaStream([x2.outputTrack]) : null;
    if (x2.outputTrack) void video.play().catch(() => undefined);

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [x2.outputTrack]);

  useEffect(() => {
    const composite = document.createElement("canvas");
    compositeRef.current = composite;
    let animationFrame = 0;

    const showUpdating = (visible: boolean) => {
      if (updatingRef.current === visible) return;
      updatingRef.current = visible;
      setUpdating(visible);
    };

    const clear = (canvas: HTMLCanvasElement) => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };

    const render = (now: number) => {
      animationFrame = window.requestAnimationFrame(render);

      const currentPose = poseRef.current;
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
      const video = videoRef.current;
      if (!canvas) return;
      const { width, height, dpr } = sizeCanvas(canvas);
      const readyToReveal =
        x2.status === "generating" &&
        Boolean(x2.outputTrack) &&
        Boolean(x2.settledPose) &&
        video !== null &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        posesMatch(currentPose, x2.settledPose!, VIEW_TOLERANCE) &&
        now - x2.settledAt > REVEAL_DELAY_MS;

      if (!readyToReveal) {
        clear(canvas);
        showUpdating(x2.status === "connecting" || x2.status === "generating");
        return;
      }

      const guide = x2.feedGuide();
      if (!guide) {
        clear(canvas);
        // The current settled view simply does not contain the van. There is
        // nothing stale to wait for, so do not leave the progress pill stuck.
        showUpdating(false);
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
      compositeContext.drawImage(video, dx, 0, frameWidth, height);
      compositeContext.restore();

      overlayContext.clearRect(0, 0, width, height);
      overlayContext.drawImage(composite, 0, 0);
      showUpdating(false);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      compositeRef.current = null;
    };
  }, [poseRef, x2]);

  return (
    <>
      <canvas ref={canvasRef} className="x2-overlay" aria-hidden="true" />
      <video ref={videoRef} className="x2-overlay__video" muted playsInline autoPlay />
      {updating ? (
        <div className="reconstruction-status" role="status">
          <span aria-hidden="true" />
          Updating reconstruction
        </div>
      ) : null}
    </>
  );
}
