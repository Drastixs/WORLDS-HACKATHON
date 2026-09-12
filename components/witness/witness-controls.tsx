"use client";

import { useSyncExternalStore } from "react";
import { useWitnessX2 } from "../../lib/witness/x2";
import {
  getReconstructionMode,
  subscribeReconstructionMode,
} from "./loop-cache";

const STATUS_LABELS = {
  idle: "Not started",
  connecting: "Starting",
  generating: "Live",
  error: "Needs attention",
} as const;

export function WitnessControls({
  debug,
  corrected,
  onDebugChange,
}: {
  debug: boolean;
  corrected: boolean;
  onDebugChange: (visible: boolean) => void;
}) {
  const x2 = useWitnessX2();
  const reconstructionMode = useSyncExternalStore(
    subscribeReconstructionMode,
    getReconstructionMode,
    getReconstructionMode,
  );

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

        <div className="witness-controls__correction" data-applied={corrected}>
          <span>The van was dark, facing the other way</span>
          <small>{corrected ? "Correction applied" : "Waiting for statement"}</small>
        </div>

        <button
          className="witness-controls__debug"
          type="button"
          aria-pressed={debug}
          onClick={() => onDebugChange(!debug)}
        >
          <span>Debug</span>
          {debug ? <small className="witness-controls__mode">{reconstructionMode}</small> : null}
          <span className="witness-controls__switch" aria-hidden="true" />
        </button>

        {x2.error ? <p className="witness-controls__error" role="alert">{x2.error}</p> : null}
      </aside>
    </>
  );
}
