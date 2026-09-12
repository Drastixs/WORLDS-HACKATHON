"use client";

import type { Viewer } from "@photo-sphere-viewer/core";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { VAN_GUIDE, projectGuide } from "../../lib/witness/geometry";
import { useWitnessX2 } from "../../lib/witness/x2";

const STATUS_LABELS = {
  idle: "Not started",
  connecting: "Starting",
  generating: "Live",
  error: "Needs attention",
} as const;

function DebugGuide({
  viewerRef,
  mirrored,
}: {
  viewerRef: MutableRefObject<Viewer | null>;
  mirrored: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationFrame = 0;
    const render = () => {
      animationFrame = window.requestAnimationFrame(render);
      const canvas = canvasRef.current;
      const viewer = viewerRef.current;
      if (!canvas || !viewer) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const guide = projectGuide(viewer, VAN_GUIDE, { mirrored });
      if (!guide) return;

      context.strokeStyle = "rgba(255, 236, 151, 0.48)";
      context.lineWidth = 1.25;
      context.setLineDash([5, 5]);
      context.beginPath();
      guide.outline.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      for (const wheel of guide.wheels) {
        context.moveTo(wheel.x + wheel.r, wheel.y);
        context.arc(wheel.x, wheel.y, wheel.r, 0, Math.PI * 2);
      }
      context.stroke();
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [mirrored, viewerRef]);

  return <canvas ref={canvasRef} className="witness-debug-guide" aria-hidden="true" />;
}

export function WitnessControls({ viewerRef }: { viewerRef: MutableRefObject<Viewer | null> }) {
  const x2 = useWitnessX2();
  const [debug, setDebug] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const toggleVariant = async () => {
    setCorrecting(true);
    try {
      await x2.setVariant(x2.variant === "white" ? "navy" : "white");
    } finally {
      setCorrecting(false);
    }
  };

  return (
    <>
      {debug ? <DebugGuide viewerRef={viewerRef} mirrored={x2.variant === "navy"} /> : null}

      <aside className="witness-controls" aria-label="Reconstruction controls">
        <div className="witness-controls__status" aria-live="polite">
          <span className={`witness-controls__dot witness-controls__dot--${x2.status}`} />
          <span>Status</span>
          <strong>{STATUS_LABELS[x2.status]}</strong>
        </div>

        {x2.status === "idle" || x2.status === "error" ? (
          <button className="witness-controls__primary" type="button" onClick={() => void x2.start()}>
            Start reconstruction
          </button>
        ) : null}

        <button
          className="witness-controls__correction"
          type="button"
          aria-pressed={x2.variant === "navy"}
          disabled={correcting || x2.status === "connecting"}
          onClick={() => void toggleVariant()}
        >
          <span>The van was dark, facing the other way</span>
          <small>{x2.variant === "navy" ? "Correction applied" : "White van · original"}</small>
        </button>

        <button
          className="witness-controls__debug"
          type="button"
          aria-pressed={debug}
          onClick={() => setDebug((visible) => !visible)}
        >
          <span>Debug</span>
          <span className="witness-controls__switch" aria-hidden="true" />
        </button>

        {x2.error ? <p className="witness-controls__error" role="alert">{x2.error}</p> : null}
      </aside>
    </>
  );
}
