import type { Viewer } from "@photo-sphere-viewer/core";

// Placement shared by the phone view, the X2 model feed and the compositor. Objects are
// fixed as pixel positions on the photosphere itself, and every view places them with its
// own Photo Sphere Viewer camera — so the phone and the model feed agree by construction.
// Photo Sphere Viewer applies the photo's recorded heading (GPano PoseHeadingDegrees, 94°)
// and its crop for us; never re-derive its camera maths here.

// A Photo Sphere Viewer position (radians) plus its zoom level (0–100). Zoom sets the
// vertical field of view, so two viewers at the same pose show the same vertical extent.
export type ViewPose = { yaw: number; pitch: number; zoom: number };
export type Point = { x: number; y: number };
export type PhotoPoint = { textureX: number; textureY: number };

// X2 chooses its output size once per session from the source aspect ratio; 1472 × 832 is
// its own bucket, so the model feed is rendered at exactly that size.
export const MODEL_FEED_WIDTH = 1472;
export const MODEL_FEED_HEIGHT = 832;

// Points further than this from the view centre are treated as off-screen.
const MAX_VISIBLE_ANGLE = (80 * Math.PI) / 180;

export type GuideShape = {
  outline: PhotoPoint[];
  wheels: { centre: PhotoPoint; edge: PhotoPoint }[];
};

// The parked van at the right-hand kerb, in front of the low building, in pixels of
// public/bastille-court-photosphere.jpg (9216 × 4140, crop offset 0, 0). Taken from the
// real-street X2 test that worked (docs/evidence/real-street-*).
const px = (textureX: number, textureY: number): PhotoPoint => ({ textureX, textureY });
export const VAN_GUIDE: GuideShape = {
  outline: [
    px(4922.7, 2156.8),
    px(5493.3, 2179.8),
    px(5522.6, 2418.8),
    px(4782.3, 2444.3),
    px(4778.9, 2307.9),
    px(4842.7, 2195.0),
  ],
  wheels: [
    { centre: px(4927.5, 2442.0), edge: px(4989.0, 2440.6) },
    { centre: px(5419.2, 2424.3), edge: px(5465.4, 2422.0) },
  ],
};

export type ProjectedGuide = {
  outline: Point[];
  wheels: { x: number; y: number; r: number }[];
  bounds: { x: number; y: number; width: number; height: number };
};

function direction(yaw: number, pitch: number) {
  // Photo Sphere Viewer's own convention (DataHelper.sphericalCoordsToVector3).
  return [-Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
}

function angleBetween(a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }) {
  const u = direction(a.yaw, a.pitch);
  const v = direction(b.yaw, b.pitch);
  return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
}

// Angular distance between two poses, in radians.
export function poseDistance(a: ViewPose, b: ViewPose) {
  return angleBetween(a, b);
}

// True when two poses show the same view closely enough to reuse generated frames.
export function posesMatch(a: ViewPose, b: ViewPose, toleranceRad = (3 * Math.PI) / 180, zoomTolerance = 2) {
  return poseDistance(a, b) <= toleranceRad && Math.abs(a.zoom - b.zoom) <= zoomTolerance;
}

export function currentPose(viewer: Viewer): ViewPose {
  const { yaw, pitch } = viewer.getPosition();
  return { yaw, pitch, zoom: viewer.getZoomLevel() };
}

// The guide in the viewer's own CSS pixels. `mirrored` flips it about its own centre, which
// is how the correction turns the van to face the other way. Null when it is off-screen.
export function projectGuide(
  viewer: Viewer,
  guide: GuideShape,
  { mirrored = false }: { mirrored?: boolean } = {},
): ProjectedGuide | null {
  const centre = viewer.getPosition();
  const project = (point: PhotoPoint) => {
    const spherical = viewer.dataHelper.textureCoordsToSphericalCoords(point);
    if (angleBetween(spherical, centre) > MAX_VISIBLE_ANGLE) return null;
    return viewer.dataHelper.sphericalCoordsToViewerCoords(spherical);
  };

  const outline = guide.outline.map(project);
  const wheelParts = guide.wheels.map((w) => ({ centre: project(w.centre), edge: project(w.edge) }));
  if (outline.some((p) => !p) || wheelParts.some((w) => !w.centre || !w.edge)) return null;

  const points = outline as Point[];
  const wheels = wheelParts.map((w) => ({
    x: w.centre!.x,
    y: w.centre!.y,
    r: Math.hypot(w.edge!.x - w.centre!.x, w.edge!.y - w.centre!.y),
  }));
  const xs = [...points.map((p) => p.x), ...wheels.flatMap((w) => [w.x - w.r, w.x + w.r])];
  const ys = [...points.map((p) => p.y), ...wheels.flatMap((w) => [w.y - w.r, w.y + w.r])];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const flip = (x: number) => (mirrored ? minX + maxX - x : x);
  return {
    outline: points.map((p) => ({ x: flip(p.x), y: p.y })),
    wheels: wheels.map((w) => ({ ...w, x: flip(w.x) })),
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}
