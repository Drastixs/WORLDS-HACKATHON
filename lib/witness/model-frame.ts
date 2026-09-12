import type { ViewPose } from "./geometry.ts";
import type { SceneObject } from "./scene.ts";

export type FrameBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type GuidePrimitive =
  | Readonly<{
      shape: "polygon";
      role: string;
      points: readonly Readonly<{ x: number; y: number }>[];
    }>
  | Readonly<{
      shape: "ellipse";
      role: string;
      centre: Readonly<{ x: number; y: number }>;
      radiusX: number;
      radiusY: number;
    }>;

export type ProjectedFrameObject = Readonly<{
  id: string;
  kind: SceneObject["kind"];
  bounds: FrameBounds;
  facing: "left" | "right";
  occlusionPolygons: readonly (readonly Readonly<{ x: number; y: number }>[])[];
}>;

export type SceneFrameInput = Readonly<{
  frameId: string;
  sceneRevision: string;
  calibrationRevision: string;
  animationTimeMs: number;
  capturedAtMs: number;
  pose: Readonly<ViewPose>;
  verticalFovDeg: number;
  widthPx: number;
  heightPx: number;
  objects: readonly ProjectedFrameObject[];
}>;

export type ModelFrameMetadata = Readonly<{
  frameId: string;
  sceneRevision: string;
  calibrationRevision: string;
  animationTimeMs: number;
  capturedAtMs: number;
  pose: Readonly<ViewPose>;
  verticalFovDeg: number;
  widthPx: number;
  heightPx: number;
}>;

export type ModelFrameObject = Readonly<{
  id: string;
  kind: SceneObject["kind"];
  bounds: FrameBounds;
  facing: "left" | "right";
  occlusionPolygons: readonly (readonly Readonly<{ x: number; y: number }>[])[];
  guide: readonly GuidePrimitive[];
  mask: readonly GuidePrimitive[];
}>;

export type ModelFrameSnapshot = Readonly<{
  metadata: ModelFrameMetadata;
  objects: readonly ModelFrameObject[];
}>;

const point = (bounds: FrameBounds, x: number, y: number) => ({
  x: bounds.x + bounds.width * x,
  y: bounds.y + bounds.height * y,
});

function polygon(bounds: FrameBounds, role: string, coordinates: readonly (readonly [number, number])[]) {
  return {
    shape: "polygon" as const,
    role,
    points: coordinates.map(([x, y]) => point(bounds, x, y)),
  };
}

function ellipse(
  bounds: FrameBounds,
  role: string,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
) {
  return {
    shape: "ellipse" as const,
    role,
    centre: point(bounds, x, y),
    radiusX: bounds.width * radiusX,
    radiusY: bounds.height * radiusY,
  };
}

/**
 * Produces simple silhouettes which remain recognisable after X2 sees them.
 * Coordinates are derived only from projected bounds, so guides and masks share
 * exactly the same perspective and contain no labels or authoring arrows.
 */
export function guidePrimitivesForObject(
  kind: SceneObject["kind"],
  bounds: FrameBounds,
  facing: "left" | "right" = "right",
): GuidePrimitive[] {
  if (kind === "vehicle") {
    const flip = (x: number) => facing === "left" ? 1 - x : x;
    return [
      polygon(bounds, "vehicle-body", [[flip(0.03), 0.38], [flip(0.9), 0.38], [flip(0.98), 0.55], [flip(0.98), 0.82], [flip(0.03), 0.82]]),
      polygon(bounds, "vehicle-cabin", [[flip(0.14), 0.38], [flip(0.25), 0.13], [flip(0.72), 0.13], [flip(0.9), 0.38]]),
      ellipse(bounds, "vehicle-wheel", flip(0.24), 0.82, 0.105, 0.14),
      ellipse(bounds, "vehicle-wheel", flip(0.76), 0.82, 0.105, 0.14),
    ];
  }

  if (kind === "person") {
    return [
      ellipse(bounds, "person-head", 0.5, 0.13, 0.15, 0.11),
      polygon(bounds, "person-torso", [[0.3, 0.25], [0.7, 0.25], [0.64, 0.62], [0.36, 0.62]]),
      polygon(bounds, "person-left-leg", [[0.36, 0.58], [0.5, 0.58], [0.46, 0.98], [0.27, 0.98]]),
      polygon(bounds, "person-right-leg", [[0.5, 0.58], [0.64, 0.58], [0.73, 0.98], [0.54, 0.98]]),
    ];
  }

  return [
    ellipse(bounds, "animal-body", 0.48, 0.55, 0.4, 0.28),
    ellipse(bounds, "animal-head", 0.84, 0.42, 0.14, 0.17),
    polygon(bounds, "animal-legs", [[0.2, 0.68], [0.72, 0.68], [0.76, 0.98], [0.64, 0.98], [0.58, 0.72], [0.36, 0.72], [0.32, 0.98], [0.2, 0.98]]),
  ];
}

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
}

function validateInput(input: SceneFrameInput) {
  if (!input.frameId.trim()) throw new Error("frameId is required.");
  if (!input.sceneRevision.trim()) throw new Error("sceneRevision is required.");
  if (!input.calibrationRevision.trim()) throw new Error("calibrationRevision is required.");
  for (const [name, value] of Object.entries({
    animationTimeMs: input.animationTimeMs,
    capturedAtMs: input.capturedAtMs,
    verticalFovDeg: input.verticalFovDeg,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    yaw: input.pose.yaw,
    pitch: input.pose.pitch,
    zoom: input.pose.zoom,
  })) requireFinite(value, name);
  if (input.animationTimeMs < 0) throw new Error("animationTimeMs cannot be negative.");
  if (input.widthPx <= 0 || input.heightPx <= 0) throw new Error("Frame dimensions must be positive.");
  if (input.verticalFovDeg <= 0 || input.verticalFovDeg >= 180) {
    throw new Error("verticalFovDeg must be between 0 and 180 degrees.");
  }
  const ids = new Set<string>();
  for (const object of input.objects) {
    if (!object.id.trim() || ids.has(object.id)) throw new Error(`Invalid or duplicate frame object ID: ${object.id}.`);
    ids.add(object.id);
    for (const [name, value] of Object.entries(object.bounds)) requireFinite(value, `${object.id}.bounds.${name}`);
    if (object.bounds.width <= 0 || object.bounds.height <= 0) {
      throw new Error(`${object.id} projected bounds must be positive.`);
    }
    if (object.facing !== "left" && object.facing !== "right") {
      throw new Error(`${object.id} needs a facing direction.`);
    }
    for (const polygon of object.occlusionPolygons) {
      if (polygon.length < 3) throw new Error(`${object.id} has an invalid occlusion polygon.`);
      for (const vertex of polygon) {
        requireFinite(vertex.x, `${object.id}.occlusion.x`);
        requireFinite(vertex.y, `${object.id}.occlusion.y`);
      }
    }
  }
}

function clonePrimitive(primitive: GuidePrimitive): GuidePrimitive {
  if (primitive.shape === "ellipse") {
    return { ...primitive, centre: { ...primitive.centre } };
  }
  return { ...primitive, points: primitive.points.map((value) => ({ ...value })) };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function createModelFrameSnapshot(input: SceneFrameInput): ModelFrameSnapshot {
  validateInput(input);
  const metadata: ModelFrameMetadata = {
    frameId: input.frameId,
    sceneRevision: input.sceneRevision,
    calibrationRevision: input.calibrationRevision,
    animationTimeMs: input.animationTimeMs,
    capturedAtMs: input.capturedAtMs,
    pose: { ...input.pose },
    verticalFovDeg: input.verticalFovDeg,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
  };
  const objects = input.objects.map((object): ModelFrameObject => {
    const bounds = { ...object.bounds };
    const guide = guidePrimitivesForObject(object.kind, bounds, object.facing);
    return {
      id: object.id,
      kind: object.kind,
      bounds,
      facing: object.facing,
      occlusionPolygons: object.occlusionPolygons.map((polygon) =>
        polygon.map((vertex) => ({ ...vertex })),
      ),
      guide,
      mask: guide.map(clonePrimitive),
    };
  });
  return deepFreeze({ metadata, objects });
}
