export const SCENE_SCHEMA_VERSION = 1 as const;

export type PanoramaAnchor = {
  textureX: number;
  textureY: number;
  // Camera-ray distance to the ground contact, not horizontal ground distance.
  depthM: number;
};

export type TexturePoint = Pick<PanoramaAnchor, "textureX" | "textureY">;

export type OcclusionMask = {
  id: string;
  description: string;
  texturePolygon: TexturePoint[];
  occludesObjectIds: string[];
  approximate: boolean;
};

export type PanoramaCalibration = {
  revision: string;
  headingDeg: number;
  horizonTextureY: number;
  cameraHeightM: number;
  fittedCamera: { latitude: number; longitude: number };
  fitRmsM: number;
  crossValidationRmsM: number;
  approximate: true;
};

export type SceneObject = {
  id: string;
  kind: "vehicle" | "person" | "animal";
  description: string;
  anchor: PanoramaAnchor;
  dimensionsM: {
    width: number;
    height: number;
    depth: number;
  };
  yawRad: number;
  appearance?: {
    color?: string;
  };
  approximate: boolean;
};

export type SceneExport = {
  schemaVersion: typeof SCENE_SCHEMA_VERSION;
  panorama: {
    asset: string;
    widthPx: number;
    heightPx: number;
    calibration?: PanoramaCalibration;
  };
  objects: SceneObject[];
  occlusionMasks?: OcclusionMask[];
};

function requireFinite(value: number, field: string) {
  if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
}

export function validateSceneExport(scene: SceneExport): SceneExport {
  if (scene.schemaVersion !== SCENE_SCHEMA_VERSION) {
    throw new Error(`Unsupported scene schema version: ${scene.schemaVersion}.`);
  }
  if (!scene.panorama.asset) throw new Error("The scene must name a panorama asset.");
  if (scene.panorama.widthPx <= 0 || scene.panorama.heightPx <= 0) {
    throw new Error("Panorama dimensions must be positive.");
  }

  const ids = new Set<string>();
  for (const object of scene.objects) {
    if (!object.id.trim()) throw new Error("Every scene object must have an ID.");
    if (ids.has(object.id)) throw new Error(`Duplicate scene object ID: ${object.id}.`);
    ids.add(object.id);

    requireFinite(object.anchor.textureX, `${object.id}.anchor.textureX`);
    requireFinite(object.anchor.textureY, `${object.id}.anchor.textureY`);
    requireFinite(object.anchor.depthM, `${object.id}.anchor.depthM`);
    requireFinite(object.yawRad, `${object.id}.yawRad`);
    if (object.anchor.depthM <= 0) throw new Error(`${object.id}.anchor.depthM must be positive.`);

    for (const [name, value] of Object.entries(object.dimensionsM)) {
      requireFinite(value, `${object.id}.dimensionsM.${name}`);
      if (value <= 0) throw new Error(`${object.id}.dimensionsM.${name} must be positive.`);
    }
  }

  const calibration = scene.panorama.calibration;
  if (calibration) {
    requireFinite(calibration.headingDeg, "panorama.calibration.headingDeg");
    requireFinite(calibration.horizonTextureY, "panorama.calibration.horizonTextureY");
    requireFinite(calibration.cameraHeightM, "panorama.calibration.cameraHeightM");
    requireFinite(calibration.fittedCamera.latitude, "panorama.calibration.fittedCamera.latitude");
    requireFinite(calibration.fittedCamera.longitude, "panorama.calibration.fittedCamera.longitude");
    requireFinite(calibration.fitRmsM, "panorama.calibration.fitRmsM");
    requireFinite(calibration.crossValidationRmsM, "panorama.calibration.crossValidationRmsM");
    if (!calibration.revision.trim()) throw new Error("Calibration revision is required.");
    if (calibration.cameraHeightM <= 0) throw new Error("Camera height must be positive.");
  }

  const maskIds = new Set<string>();
  for (const mask of scene.occlusionMasks ?? []) {
    if (!mask.id.trim() || maskIds.has(mask.id)) throw new Error(`Invalid or duplicate occlusion mask ID: ${mask.id}.`);
    maskIds.add(mask.id);
    if (mask.texturePolygon.length < 3) throw new Error(`${mask.id} needs at least three polygon points.`);
    for (const point of mask.texturePolygon) {
      requireFinite(point.textureX, `${mask.id}.textureX`);
      requireFinite(point.textureY, `${mask.id}.textureY`);
      if (
        point.textureX < 0 || point.textureX > scene.panorama.widthPx ||
        point.textureY < 0 || point.textureY > scene.panorama.heightPx
      ) throw new Error(`${mask.id} has a point outside the panorama.`);
    }
    for (const objectId of mask.occludesObjectIds) {
      if (!ids.has(objectId)) throw new Error(`${mask.id} targets unknown object ID: ${objectId}.`);
    }
  }

  return scene;
}

// Temporary Stage 1 fixture. Replace this with the annotation teammate's export.
// The panorama anchor follows the proven van guide; depth and dimensions are visual estimates.
export const STAGE_ONE_SCENE = validateSceneExport({
  schemaVersion: SCENE_SCHEMA_VERSION,
  panorama: {
    asset: "/bastille-court-photosphere.jpg",
    widthPx: 9216,
    heightPx: 4140,
  },
  objects: [
    {
      id: "parked-van-01",
      kind: "vehicle",
      description: "Parked panel van",
      anchor: { textureX: 5150, textureY: 2438, depthM: 10.5 },
      dimensionsM: { width: 4.8, height: 2.15, depth: 2.05 },
      yawRad: Math.PI / 2,
      appearance: { color: "white" },
      approximate: true,
    },
  ],
});
