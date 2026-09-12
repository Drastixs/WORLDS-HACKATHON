"use client";

import { useEffect, useRef, useState } from "react";
import { MODEL_FEED_HEIGHT, MODEL_FEED_WIDTH } from "../../lib/witness/geometry";
import type { ModelFrameMetadata } from "../../lib/witness/model-frame";
import { useWitnessX2 } from "../../lib/witness/x2";

const PANELS = [
  { key: "background", label: "Clean background" },
  { key: "composite", label: "Model input" },
  { key: "mask", label: "Object mask" },
] as const;

export function ModelFeedInspector({ visible }: { visible: boolean }) {
  const x2 = useWitnessX2();
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [metadata, setMetadata] = useState<ModelFrameMetadata | null>(null);

  useEffect(() => {
    if (!visible) return;
    void x2.prepareFeed();
    let animationFrame = 0;
    let lastMetadataUpdate = 0;

    const render = (now: number) => {
      animationFrame = window.requestAnimationFrame(render);
      const inspection = x2.inspectFeed();
      if (!inspection) return;
      PANELS.forEach((panel, index) => {
        const target = canvasRefs.current[index];
        if (!target) return;
        target.getContext("2d")?.drawImage(inspection[panel.key], 0, 0);
      });
      if (inspection.frame && now - lastMetadataUpdate >= 200) {
        lastMetadataUpdate = now;
        setMetadata(inspection.frame.metadata);
      }
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [visible, x2.inspectFeed, x2.prepareFeed]);

  if (!visible) return null;

  return (
    <aside className="model-feed-inspector" aria-label="Model feed inspection">
      <header>
        <strong>Stage 4 model feed</strong>
        <span>{MODEL_FEED_WIDTH} × {MODEL_FEED_HEIGHT} · landscape</span>
      </header>
      <div className="model-feed-inspector__panels">
        {PANELS.map((panel, index) => (
          <figure key={panel.key}>
            <canvas
              ref={(node) => { canvasRefs.current[index] = node; }}
              width={MODEL_FEED_WIDTH}
              height={MODEL_FEED_HEIGHT}
            />
            <figcaption>{panel.label}</figcaption>
          </figure>
        ))}
      </div>
      {metadata ? (
        <dl className="model-feed-inspector__metadata">
          <div><dt>Scene</dt><dd>{metadata.sceneRevision}</dd></div>
          <div><dt>Frame</dt><dd>{metadata.frameId} · {Math.round(metadata.animationTimeMs)} ms</dd></div>
          <div><dt>Calibration</dt><dd>{metadata.calibrationRevision}</dd></div>
          <div>
            <dt>Camera</dt>
            <dd>{metadata.pose.yaw.toFixed(3)} yaw · {metadata.pose.pitch.toFixed(3)} pitch · {metadata.pose.zoom.toFixed(1)} zoom · {metadata.verticalFovDeg.toFixed(1)}° vFOV</dd>
          </div>
        </dl>
      ) : <p className="model-feed-inspector__metadata">Preparing synchronized frames…</p>}
    </aside>
  );
}
