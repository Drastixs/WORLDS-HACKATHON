import type { Viewer } from "@photo-sphere-viewer/core";
import type { OcclusionMask, TexturePoint } from "./scene.ts";

export type ProjectedOcclusionMask = {
  id: string;
  points: { x: number; y: number }[];
};

const MAX_VISIBLE_ANGLE = Math.PI / 2;

function direction(yaw: number, pitch: number) {
  return [-Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
}

function angularDistance(a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }) {
  const first = direction(a.yaw, a.pitch);
  const second = direction(b.yaw, b.pitch);
  const dot = first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

export function densifyTexturePolygon(polygon: TexturePoint[], maxSegmentPx = 48) {
  if (maxSegmentPx <= 0) throw new Error("maxSegmentPx must be positive.");
  const points: TexturePoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const length = Math.hypot(end.textureX - start.textureX, end.textureY - start.textureY);
    const segments = Math.max(1, Math.ceil(length / maxSegmentPx));
    for (let part = 0; part < segments; part += 1) {
      const amount = part / segments;
      points.push({
        textureX: start.textureX + (end.textureX - start.textureX) * amount,
        textureY: start.textureY + (end.textureY - start.textureY) * amount,
      });
    }
  }
  return points;
}

export function texturePointInPolygon(point: TexturePoint, polygon: TexturePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (
      (a.textureY > point.textureY) !== (b.textureY > point.textureY) &&
      point.textureX <
        ((b.textureX - a.textureX) * (point.textureY - a.textureY)) /
          (b.textureY - a.textureY) +
          a.textureX
    ) inside = !inside;
  }
  return inside;
}

export function occlusionMasksForObject(masks: OcclusionMask[] | undefined, objectId: string) {
  return (masks ?? []).filter((mask) => mask.occludesObjectIds.includes(objectId));
}

export function projectOcclusionMask(
  viewer: Viewer,
  mask: OcclusionMask,
): ProjectedOcclusionMask | null {
  const centre = viewer.getPosition();
  const projected = densifyTexturePolygon(mask.texturePolygon).map((point) => {
    const spherical = viewer.dataHelper.textureCoordsToSphericalCoords(point);
    if (angularDistance(spherical, centre) > MAX_VISIBLE_ANGLE) return null;
    return viewer.dataHelper.sphericalCoordsToViewerCoords(spherical);
  });
  if (projected.some((point) => point === null)) return null;
  return { id: mask.id, points: projected as { x: number; y: number }[] };
}
