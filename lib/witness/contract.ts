// The contract between the X2 session (Zeus: lib/witness/x2.tsx) and the viewer-side
// compositor (Prometheus-w: components/witness/*). Change it only by agreement.

import type { ProjectedGuide, ViewPose } from "./geometry";

// The story's one correction: the van was not white, it was dark and faced the other way.
export type VanVariant = "white" | "navy";

export type WitnessX2Status = "idle" | "connecting" | "generating" | "error";

export interface WitnessX2 {
  status: WitnessX2Status;
  error: string | null;
  // X2's `main_video` track: the model feed re-rendered, 1472 × 832 (MODEL_FEED_* in
  // geometry.ts), for `settledPose`. Undefined until X2 sends it.
  outputTrack: MediaStreamTrack | undefined;
  variant: VanVariant;
  // The view the model feed currently shows (a Photo Sphere Viewer pose including zoom), and
  // when the feed last changed (performance.now(); a pose or variant change). X2's output
  // lags the feed, so only trust the output a while after this.
  settledPose: ViewPose | null;
  settledAt: number;
  // The van guide in X2-output pixels (1472 × 832) for the settled pose and current variant,
  // projected by the feed's own viewer: the compositing mask. Null until the feed is ready
  // or when the van is off-screen. Cheap; call it every frame.
  feedGuide(): ProjectedGuide | null;
  // Connect, publish the model feed, set the van reference image and the prompt.
  start(): Promise<void>;
  // Call once the phone's view has settled (use currentPose(viewer) from geometry.ts).
  setPose(pose: ViewPose): void;
  // The correction: swaps the prompt and mirrors the guide (the van faces the other way).
  setVariant(variant: VanVariant): Promise<void>;
  stop(): Promise<void>;
}

// Mapping an X2 frame onto the phone: both viewers share the pose and zoom, so they share
// the vertical field of view. scale = displayHeight / 832; frameWidth = 1472 × scale;
// dx = (displayWidth − frameWidth) / 2; a frame pixel (x, y) lands at (x × scale + dx, y × scale).

// Provided by lib/witness/x2.tsx:
//   <WitnessX2Provider>{children}</WitnessX2Provider>
//   useWitnessX2(): WitnessX2
