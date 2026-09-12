import type { Viewer } from "@photo-sphere-viewer/core";
import { createSpriteGenerator, type SpriteClip } from "./h3-sprite";
import { CUBOID_EDGES, projectSceneObject } from "./scene-projection";
import type { SceneExport, SceneObject } from "./scene";
import { CAR_FRONT_FACE, CAR_REAR_FACE, carGuideCoordinates } from "./car-guide";
import { WITNESS_DEMO_SCRIPT } from "./demo-script";

let cached: SpriteClip | undefined;
export const cachedCarClip = () => cached;
export async function generateCarClip(signal: AbortSignal, progress: (text: string) => void, context?: { viewer: Viewer; scene: SceneExport; object: SceneObject }) {
  if (!context) throw new Error("Car generation needs the visible debug geometry");
  const { viewer, object } = context;
  const projection = projectSceneObject(viewer, object);
  if (!projection) throw new Error("Look towards the car's debug box, then generate the car");
  const guide = carGuideCoordinates(projection);
  const round = (value: number) => Math.round(value * 100) / 100;
  const points = (vertices: { x: number; y: number }[]) => vertices.map((p, id) => ({ id, x: round(p.x), y: round(p.y) }));
  const path = WITNESS_DEMO_SCRIPT.steps.find(s => s.id === "car-passes")!.paths[0].keyframes;
  const data = {
    coordinateSystem: "Pixels from top-left, x right, y down. Input/reference canvas 1344x768.",
    objectId: object.id, dimensionsMetres: object.dimensionsM, yawRadians: object.yawRad,
    camera: { ...viewer.getPosition(), zoom: viewer.getZoomLevel(), verticalFovDegrees: viewer.state.vFov },
    viewport: viewer.getSize(), debugCornersPx: points(projection.vertices),
    referenceCornersPx: points(guide.vertices),
    frontFace: CAR_FRONT_FACE, rearFace: CAR_REAR_FACE,
    groundCorners: [0, 1, 2, 3], roofCorners: [4, 5, 6, 7],
    path: path.map(k => ({ atMs: k.atMs, anchor: k.anchor, yawRadians: k.yawRad })),
    movement: "Car approaches the camera along the authored path. Its positive local width axis is the front. Do not infer facing from screen-left motion alone.",
  };
  const prompt = `Picture 1 is the EXACT projected 3D bounding cuboid of ONE dark charcoal hatchback at the current scene camera. Render a car aligned with this cuboid, not a generic side-view sprite.
GEOMETRY: ${JSON.stringify(data)}
The RED face is the FRONT: headlights, grille and front bumper belong on this plane. The BLUE face is the REAR: rear window, tail lamps and rear bumper belong there. Grey faces show the body and roof. Honour the projected corner perspective and foreshortening. When the front plane faces the camera, show a front view with a narrow visible side; do not replace it with a broad side profile. The wheelbase runs from the red plane to the blue plane. Roof and body edges converge along the same directions as the cuboid edges. Tyre contact points lie on the lower plane. Fill this exact volume without stretching the car or moving it outside the reference bounds. Replace all coloured guide faces and edges with the realistic car, leaving no guide visible.
For five seconds, wheels rotate as if driving forward. Keep body position, scale and orientation locked to this reference; the app supplies translation along the listed path. No camera movement, rotation, zoom, cuts or extra subjects. The full background and floor stay pure chroma green (#00ff00), with no shadows, road, scenery, text, smoke or props. No green car paint or green reflections. Neutral daylight, realistic dark charcoal paint and tyres. Silent, no music.`;
  const generator = createSpriteGenerator({
    label: "moving car", prompt, aspect: "16:9", width: 336, height: 192,
    // Preserve the same authored reference rectangle instead of stretching an
    // arbitrary generated alpha bounding box into the debug cuboid.
    cropBounds: { x: guide.bounds.x / 4, y: guide.bounds.y / 4, width: guide.bounds.width / 4, height: guide.bounds.height / 4 },
    reference(ctx) {
      const face = (ids: number[], color: string) => {
        ctx.fillStyle = color; ctx.beginPath(); ids.forEach((id, i) => { const p = guide.vertices[id]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
      };
      // Paint the farther end first. At the current authored inward yaw the front is nearest.
      face(CAR_REAR_FACE, "#5050cc");
      face([0, 1, 5, 4], "#888888"); face([3, 2, 6, 7], "#aaaaaa"); face([4, 5, 6, 7], "#bcbcbc");
      face(CAR_FRONT_FACE, "#cc5050");
      ctx.strokeStyle = "#dddddd"; ctx.lineWidth = 3;
      for (const [a, b] of CUBOID_EDGES) { ctx.beginPath(); ctx.moveTo(guide.vertices[a].x, guide.vertices[a].y); ctx.lineTo(guide.vertices[b].x, guide.vertices[b].y); ctx.stroke(); }
    },
  });
  const result = await generator.generate(signal, progress);
  signal.throwIfAborted(); cached = result; return result;
}
