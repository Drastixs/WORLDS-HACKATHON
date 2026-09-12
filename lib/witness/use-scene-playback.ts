"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CORRECTION_STEP_ID, VAN_CORRECTION, VAN_OBJECT_ID } from "./demo-script";
import {
  advancePlayback,
  correctPlaybackObject,
  createPlayback,
  evaluatePlayback,
  restartPlayback,
  type PlaybackScript,
} from "./scene-playback";

export function useScenePlayback(script: PlaybackScript) {
  const [state, setState] = useState(() => createPlayback(script));
  const [elapsedMs, setElapsedMs] = useState(0);
  const epochRef = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = (now: number) => {
      epochRef.current ??= now;
      setElapsedMs(now - epochRef.current);
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const resetClock = useCallback(() => {
    epochRef.current = performance.now();
    setElapsedMs(0);
  }, []);

  const next = useCallback(() => {
    setState((current) => {
      const advanced = advancePlayback(current);
      if (advanced === current) return current;
      const nextStep = advanced.script.steps[advanced.stepIndex];
      return nextStep.id === CORRECTION_STEP_ID
        ? correctPlaybackObject(advanced, VAN_OBJECT_ID, VAN_CORRECTION)
        : advanced;
    });
    resetClock();
  }, [resetClock]);

  const restart = useCallback(() => {
    setState((current) => restartPlayback(current));
    resetClock();
  }, [resetClock]);

  const evaluated = useMemo(() => evaluatePlayback(state, elapsedMs), [elapsedMs, state]);
  const corrected = evaluated.scene.objects.find((object) => object.id === VAN_OBJECT_ID)
    ?.appearance?.color === "navy";

  return {
    ...evaluated,
    elapsedMs,
    corrected,
    isFinalStep: state.stepIndex === state.script.steps.length - 1,
    totalSteps: state.script.steps.length,
    next,
    restart,
  };
}
