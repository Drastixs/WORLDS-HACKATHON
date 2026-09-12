import { events, Viewer } from "@photo-sphere-viewer/core";
import {
  MODEL_FEED_HEIGHT,
  MODEL_FEED_WIDTH,
  VAN_GUIDE,
  projectGuide,
  type ProjectedGuide,
  type ViewPose,
} from "./geometry";

// What X2 sees: a second, hidden Photo Sphere Viewer at a fixed 1472 × 832, set to the
// phone's settled pose and zoom, with the grey van-shaped guide painted on — and nothing else
// (no UI, no debug bounds). Fixed and landscape because the phone's view is portrait and X2
// fixes its output shape from the first frames of a session. Using the same viewer library
// as the phone keeps the two projections identical.

const FRAME_RATE = 24;
const GUIDE_GREY = "rgb(128, 128, 128)";
const WHEEL_GREY = "rgb(60, 60, 60)";

export type ModelFeed = {
  track: MediaStreamTrack;
  setPose(pose: ViewPose): void;
  setMirrored(mirrored: boolean): void;
  // The guide as last painted, in feed pixels.
  currentGuide(): ProjectedGuide | null;
  dispose(): void;
};

export async function createModelFeed(panoramaUrl: string, initialPose: ViewPose): Promise<ModelFeed> {
  // A zero-size clipping wrapper, so the 1472-px viewer can never widen the phone's page.
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  Object.assign(wrapper.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "0",
    height: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
  });
  const container = document.createElement("div");
  Object.assign(container.style, { width: `${MODEL_FEED_WIDTH}px`, height: `${MODEL_FEED_HEIGHT}px` });
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  const viewer = new Viewer({
    container,
    panorama: panoramaUrl,
    navbar: false,
    keyboard: false,
    mousemove: false,
    mousewheel: false,
    defaultYaw: initialPose.yaw,
    defaultPitch: initialPose.pitch,
    defaultZoomLvl: initialPose.zoom,
    // Keep the last frame so it can be copied into the feed at any time.
    rendererParameters: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      viewer.addEventListener(events.ReadyEvent.type, () => resolve(), { once: true });
      viewer.addEventListener(events.PanoramaErrorEvent.type, () =>
        reject(new Error("The photosphere could not be loaded for the model feed.")),
      );
    });
  } catch (error) {
    viewer.destroy();
    wrapper.remove();
    throw error;
  }

  const source = container.querySelector("canvas");
  if (!source) throw new Error("The model feed viewer has no canvas.");

  const feedCanvas = document.createElement("canvas");
  feedCanvas.width = MODEL_FEED_WIDTH;
  feedCanvas.height = MODEL_FEED_HEIGHT;
  const context = feedCanvas.getContext("2d");
  if (!context) throw new Error("Unable to create the model feed canvas.");

  let mirrored = false;
  let guide: ProjectedGuide | null = null;

  const draw = () => {
    context.drawImage(source, 0, 0, MODEL_FEED_WIDTH, MODEL_FEED_HEIGHT);
    guide = projectGuide(viewer, VAN_GUIDE, { mirrored });
    if (!guide) return;
    context.fillStyle = GUIDE_GREY;
    context.beginPath();
    guide.outline.forEach((point, index) =>
      index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
    );
    context.closePath();
    context.fill();
    context.fillStyle = WHEEL_GREY;
    for (const wheel of guide.wheels) {
      context.beginPath();
      context.arc(wheel.x, wheel.y, wheel.r, 0, Math.PI * 2);
      context.fill();
    }
  };

  draw();
  const track = feedCanvas.captureStream(FRAME_RATE).getVideoTracks()[0];
  // Hold resolution and let the frame rate adapt instead.
  track.contentHint = "detail";
  // The capturer only emits when the canvas repaints.
  const timer = window.setInterval(draw, 1000 / FRAME_RATE);

  return {
    track,
    setPose(pose) {
      viewer.rotate({ yaw: pose.yaw, pitch: pose.pitch });
      viewer.zoom(pose.zoom);
    },
    setMirrored(next) {
      mirrored = next;
    },
    currentGuide: () => guide,
    dispose() {
      window.clearInterval(timer);
      track.stop();
      viewer.destroy();
      wrapper.remove();
    },
  };
}
