import type { Viewer } from "@photo-sphere-viewer/core";
import type { SceneObject } from "./scene";

type Vector3 = { x: number; y: number; z: number };
export type ProjectedCuboid = {
  vertices: { x: number; y: number }[];
  bounds: { x: number; y: number; width: number; height: number };
};

export const CUBOID_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
] as const;

export const CUBOID_FACES = [
  [0, 1, 2, 3],
  [1, 5, 6, 2],
  [3, 2, 6, 7],
] as const;

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: Vector3, amount: number): Vector3 {
  return { x: v.x * amount, y: v.y * amount, z: v.z * amount };
}

function direction(yaw: number, pitch: number): Vector3 {
  return {
    x: -Math.cos(pitch) * Math.sin(yaw),
    y: Math.sin(pitch),
    z: Math.cos(pitch) * Math.cos(yaw),
  };
}

function spherical(vector: Vector3) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return {
    yaw: Math.atan2(-vector.x, vector.z),
    pitch: Math.asin(vector.y / length),
  };
}

function angularDistance(a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }) {
  const first = direction(a.yaw, a.pitch);
  const second = direction(b.yaw, b.pitch);
  const dot = first.x * second.x + first.y * second.y + first.z * second.z;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

export function projectSceneObject(viewer: Viewer, object: SceneObject): ProjectedCuboid | null {
  const anchor = viewer.dataHelper.textureCoordsToSphericalCoords(object.anchor);
  if (angularDistance(anchor, viewer.getPosition()) > Math.PI / 2) return null;

  const ray = direction(anchor.yaw, anchor.pitch);
  const groundContact = scale(ray, object.anchor.depthM);
  const radialLength = Math.hypot(ray.x, ray.z) || 1;
  const radial = { x: ray.x / radialLength, y: 0, z: ray.z / radialLength };
  const tangent = { x: radial.z, y: 0, z: -radial.x };
  const cos = Math.cos(object.yawRad);
  const sin = Math.sin(object.yawRad);
  const widthAxis = add(scale(tangent, cos), scale(radial, sin));
  const depthAxis = add(scale(radial, cos), scale(tangent, -sin));
  const { width, height, depth } = object.dimensionsM;

  const vertices: Vector3[] = [];
  for (const y of [0, height]) {
    for (const d of [-depth / 2, depth / 2]) {
      for (const w of [-width / 2, width / 2]) {
        vertices.push(add(add(add(groundContact, scale(widthAxis, w)), scale(depthAxis, d)), { x: 0, y, z: 0 }));
      }
    }
  }

  // Reorder to four matching corners on the lower and upper faces.
  const ordered = [vertices[0], vertices[1], vertices[3], vertices[2], vertices[4], vertices[5], vertices[7], vertices[6]];
  const projected = ordered.map((vertex) => viewer.dataHelper.sphericalCoordsToViewerCoords(spherical(vertex)));
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    vertices: projected,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}
