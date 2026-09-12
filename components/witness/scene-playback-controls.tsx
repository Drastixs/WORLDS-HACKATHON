function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  return `00:${seconds.toString().padStart(2, "0")}`;
}

export function ScenePlaybackControls({
  stepIndex,
  totalSteps,
  label,
  elapsedMs,
  durationMs,
  progress,
  isFinalStep,
  onNext,
  onRestart,
}: {
  stepIndex: number;
  totalSteps: number;
  label: string;
  elapsedMs: number;
  durationMs: number;
  progress: number;
  isFinalStep: boolean;
  onNext: () => void;
  onRestart: () => void;
}) {
  return (
    <section className="scene-playback" aria-label="Statement playback">
      <div className="scene-playback__heading">
        <span>Statement {stepIndex + 1} of {totalSteps}</span>
        <strong>{label}</strong>
      </div>
      <div
        className="scene-playback__timeline"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={Math.round(elapsedMs % durationMs)}
      >
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="scene-playback__footer">
        <span>{formatTime(elapsedMs % durationMs)} / {formatTime(durationMs)}</span>
        <div>
          <button type="button" onClick={onRestart}>Restart</button>
          <button type="button" onClick={onNext} disabled={isFinalStep}>
            {isFinalStep ? "Final step" : "Next"}
          </button>
        </div>
      </div>
    </section>
  );
}
