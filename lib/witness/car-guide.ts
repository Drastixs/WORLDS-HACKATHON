import type { ProjectedCuboid } from "./scene-projection";

// Local width is the vehicle's length in the authored scene. The +width face
// [1,2,6,5] points inward at yaw=-PI/2, matching this car's approaching path.
export const CAR_FRONT_FACE = [1, 2, 6, 5];
export const CAR_REAR_FACE = [0, 3, 7, 4];
export function carGuideCoordinates(projection: ProjectedCuboid, width = 1344, height = 768) {
  const b = projection.bounds;
  if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) throw new Error("Car guide has invalid bounds");
  const scale = Math.min(width * .76 / b.width, height * .76 / b.height);
  const bounds = { x: (width - b.width * scale) / 2, y: (height - b.height * scale) / 2, width: b.width * scale, height: b.height * scale };
  const vertices = projection.vertices.map(p => ({ x: bounds.x + (p.x - b.x) * scale, y: bounds.y + (p.y - b.y) * scale }));
  return { bounds, vertices };
}
