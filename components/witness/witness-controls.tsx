"use client";

import { useState } from "react";
import { useWitnessX2 } from "../../lib/witness/x2";

const STATUS_LABELS = {
  idle: "Not started",
  connecting: "Starting",
  generating: "Live",
  error: "Needs attention",
} as const;

export function WitnessControls({
  debug,
  onDebugChange,
}: {
  debug: boolean;
  onDebugChange: (visible: boolean) => void;
}) {
  const x2 = useWitnessX2();
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
          onClick={() => onDebugChange(!debug)}
        >
          <span>Debug</span>
          <span className="witness-controls__switch" aria-hidden="true" />
        </button>

        {x2.error ? <p className="witness-controls__error" role="alert">{x2.error}</p> : null}
      </aside>
    </>
  );
}
