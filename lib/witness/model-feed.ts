import { events, Viewer } from "@photo-sphere-viewer/core";
import {
  MODEL_FEED_HEIGHT,
  MODEL_FEED_WIDTH,
  VAN_GUIDE,
  projectGuide,
  type ProjectedGuide,
  type ViewPose,
} from "./geometry";
import {
  createModelFrameSnapshot,
  type GuidePrimitive,
  type ModelFrameSnapshot,
  type ProjectedFrameObject,
} from "./model-frame";
import { occlusionMasksForObject, projectOcclusionMask } from "./occlusion";
import { projectSceneObject } from "./scene-projection";
import type { SceneExport } from "./scene";

// The hidden renderer is deliberately separate from the product UI. X2 receives only the
// fixed landscape composite canvas, while the other two canvases make the exact clean input
// and matching mask inspectable without connecting to Reactor.
const FRAME_RATE = 24;
const GUIDE_GREY = "rgb(128, 128, 128)";

export type ModelSceneFrame = Readonly<{
  scene: SceneExport;
  sceneRevision: string;
  stepId: string;
  animationTimeMs: number;
}>;

export type ModelFeedInspection = Readonly<{
  background: HTMLCanvasElement;
  composite: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  frame: ModelFrameSnapshot | null;
}>;

export type ModelFeed = {
  track: MediaStreamTrack;
  setPose(pose: ViewPose): void;
  setMirrored(mirrored: boolean): void;
  setSceneFrame(frame: ModelSceneFrame): void;
  sphericalPoint(x: number, y: number): { yaw: number; pitch: number };
  currentGuide(): ProjectedGuide | null;
  currentMask(): HTMLCanvasElement;
  inspection(): ModelFeedInspection;
  dispose(): void;
};

function canvas() {
  const result = document.createElement("canvas");
  result.width = MODEL_FEED_WIDTH;
  result.height = MODEL_FEED_HEIGHT;
  return result;
}

function tracePrimitive(context: CanvasRenderingContext2D, primitive: GuidePrimitive) {
  context.beginPath();
  if (primitive.shape === "ellipse") {
    context.ellipse(
      primitive.centre.x,
      primitive.centre.y,
      primitive.radiusX,
      primitive.radiusY,
      0,
      0,
      Math.PI * 2,
    );
    return;
  }
  primitive.points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
}

function fillPrimitives(context: CanvasRenderingContext2D, primitives: readonly GuidePrimitive[]) {
  for (const primitive of primitives) {
    tracePrimitive(context, primitive);
    context.fill();
  }
}

function erasePolygon(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]) {
  if (points.length < 3) return;
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.fill();
  context.restore();
}

export async function createModelFeed(panoramaUrl: string, initialPose: ViewPose): Promise<ModelFeed> {
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
  if (!source) {
    viewer.destroy();
    wrapper.remove();
    throw new Error("The model feed viewer has no canvas.");
  }

  const background = canvas();
  const composite = canvas();
  const mask = canvas();
  const objectGuide = canvas();
  const objectMask = canvas();
  const backgroundContext = background.getContext("2d");
  const compositeContext = composite.getContext("2d");
  const maskContext = mask.getContext("2d");
  const objectGuideContext = objectGuide.getContext("2d");
  const objectMaskContext = objectMask.getContext("2d");
  if (!backgroundContext || !compositeContext || !maskContext || !objectGuideContext || !objectMaskContext) {
    viewer.destroy();
    wrapper.remove();
    throw new Error("Unable to create the model feed canvases.");
  }

  let sceneFrame: ModelSceneFrame | null = null;
  let frame: ModelFrameSnapshot | null = null;
  let frameSequence = 0;
  let mirrored = false;
  let legacyGuide: ProjectedGuide | null = null;
  let poseDirty = false;

  const draw = () => {
    backgroundContext.drawImage(source, 0, 0, MODEL_FEED_WIDTH, MODEL_FEED_HEIGHT);
    compositeContext.drawImage(background, 0, 0);
    maskContext.clearRect(0, 0, MODEL_FEED_WIDTH, MODEL_FEED_HEIGHT);
    legacyGuide = projectGuide(viewer, VAN_GUIDE, { mirrored });
    if (!sceneFrame) return;

    const projectedObjects: ProjectedFrameObject[] = [];
    for (const object of sceneFrame.scene.objects) {
      const projection = projectSceneObject(viewer, object);
      if (!projection || projection.bounds.width <= 0 || projection.bounds.height <= 0) continue;
      const occlusionPolygons = occlusionMasksForObject(sceneFrame.scene.occlusionMasks, object.id)
        .map((occluder) => projectOcclusionMask(viewer, occluder)?.points)
        .filter((points): points is { x: number; y: number }[] => Boolean(points));
      projectedObjects.push({
        id: object.id,
        kind: object.kind,
        bounds: projection.bounds,
        facing: Math.sin(object.yawRad) < 0 ? "left" : "right",
        occlusionPolygons,
      });
    }

    frameSequence += 1;
    frame = createModelFrameSnapshot({
      frameId: `${sceneFrame.stepId}:${frameSequence}`,
      sceneRevision: sceneFrame.sceneRevision,
      calibrationRevision: sceneFrame.scene.panorama.calibration?.revision ?? "uncalibrated",
      animationTimeMs: sceneFrame.animationTimeMs,
      capturedAtMs: performance.now(),
      pose: { ...viewer.getPosition(), zoom: viewer.getZoomLevel() },
      verticalFovDeg: viewer.state.vFov,
      widthPx: MODEL_FEED_WIDTH,
      heightPx: MODEL_FEED_HEIGHT,
      objects: projectedObjects,
    });

    for (const frameObject of frame.objects) {
      objectGuideContext.clearRect(0, 0, MODEL_FEED_WIDTH, MODEL_FEED_HEIGHT);
      objectMaskContext.clearRect(0, 0, MODEL_FEED_WIDTH, MODEL_FEED_HEIGHT);
      objectGuideContext.fillStyle = GUIDE_GREY;
      objectMaskContext.fillStyle = "white";
      fillPrimitives(objectGuideContext, frameObject.guide);
      fillPrimitives(objectMaskContext, frameObject.mask);

      for (const polygon of frameObject.occlusionPolygons) {
        erasePolygon(objectGuideContext, polygon);
        erasePolygon(objectMaskContext, polygon);
      }

      compositeContext.drawImage(objectGuide, 0, 0);
      maskContext.drawImage(objectMask, 0, 0);
    }
  };

  draw();
  const handleRender = () => {
    poseDirty = false;
    draw();
  };
  viewer.addEventListener(events.RenderEvent.type, handleRender);
  const track = composite.captureStream(FRAME_RATE).getVideoTracks()[0];
  track.contentHint = "detail";
  const timer = window.setInterval(() => {
    if (!poseDirty) draw();
  }, 1000 / FRAME_RATE);

  return {
    track,
    setPose(pose) {
      const current = viewer.getPosition();
      const unchanged =
        Math.abs(current.yaw - pose.yaw) < 1e-7 &&
        Math.abs(current.pitch - pose.pitch) < 1e-7 &&
        Math.abs(viewer.getZoomLevel() - pose.zoom) < 1e-7;
      if (unchanged) {
        poseDirty = false;
        draw();
        return;
      }
      poseDirty = true;
      viewer.rotate({ yaw: pose.yaw, pitch: pose.pitch });
      viewer.zoom(pose.zoom);
    },
    setMirrored(next) {
      mirrored = next;
    },
    setSceneFrame(next) {
      sceneFrame = next;
    },
    sphericalPoint: (x, y) => viewer.dataHelper.viewerCoordsToSphericalCoords({ x, y }),
    currentGuide: () => legacyGuide,
    currentMask: () => mask,
    inspection: () => ({ background, composite, mask, frame }),
    dispose() {
      window.clearInterval(timer);
      viewer.removeEventListener(events.RenderEvent.type, handleRender);
      track.stop();
      viewer.destroy();
      wrapper.remove();
    },
  };
}
