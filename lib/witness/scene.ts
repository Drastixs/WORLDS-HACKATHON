export const SCENE_SCHEMA_VERSION = 1 as const;

export type PanoramaAnchor = {
  textureX: number;
  textureY: number;
  depthM: number;
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
  };
  objects: SceneObject[];
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
