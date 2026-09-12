import { SCENE_SCHEMA_VERSION } from "./scene.ts";
import type { PlaybackScript, SceneObjectCorrection } from "./scene-playback.ts";

// Temporary authored fixture for Stage 2. Replace these approximate anchors with
// the annotation teammate's export when it lands.
export const WITNESS_DEMO_SCRIPT: PlaybackScript = {
  scene: {
    schemaVersion: SCENE_SCHEMA_VERSION,
    panorama: {
      asset: "/bastille-court-photosphere.jpg",
      widthPx: 9216,
      heightPx: 4140,
      calibration: {
        revision: "paris-garden-provisional-v1",
        headingDeg: 94,
        horizonTextureY: 2304,
        cameraHeightM: 2.0338,
        fittedCamera: { latitude: 51.5055338, longitude: -0.1059009 },
        fitRmsM: 2.6826,
        crossValidationRmsM: 5.4004,
        approximate: true,
      },
    },
    objects: [
      {
        id: "parked-van-01",
        kind: "vehicle",
        description: "Parked panel van",
        anchor: { textureX: 5150, textureY: 2438, depthM: 22.2931 },
        dimensionsM: { width: 4.8, height: 2.15, depth: 2.05 },
        yawRad: Math.PI / 2,
        appearance: { color: "white" },
        approximate: true,
      },
      {
        id: "crossing-person-01",
        kind: "person",
        description: "Figure crossing",
        anchor: { textureX: 3200, textureY: 2450, depthM: 20.4662 },
        dimensionsM: { width: 0.85, height: 1.75, depth: 0.45 },
        yawRad: 0,
        appearance: { color: "dark" },
        approximate: true,
      },
      {
        id: "moving-car-01",
        kind: "vehicle",
        description: "Passing car",
        anchor: { textureX: 6120, textureY: 2470, depthM: 18.0091 },
        dimensionsM: { width: 4.35, height: 1.5, depth: 1.85 },
        yawRad: -Math.PI / 2,
        appearance: { color: "dark" },
        approximate: true,
      },
    ],
    occlusionMasks: [
      {
        id: "pub-garden-enclosure-01",
        description: "Black timber pub-garden enclosure",
        texturePolygon: [
          { textureX: 3410, textureY: 2050 },
          { textureX: 3510, textureY: 2045 },
          { textureX: 3510, textureY: 2030 },
          { textureX: 3708, textureY: 2035 },
          { textureX: 3805, textureY: 2095 },
          { textureX: 3805, textureY: 2215 },
          { textureX: 3967, textureY: 2220 },
          { textureX: 3967, textureY: 2508 },
          { textureX: 3705, textureY: 2548 },
          { textureX: 3410, textureY: 2550 },
        ],
        occludesObjectIds: ["crossing-person-01"],
        approximate: true,
      },
    ],
  },
  steps: [
    {
      id: "van-recalled",
      label: "A van outside number forty",
      durationMs: 4_000,
      visibleObjectIds: ["parked-van-01"],
      paths: [],
    },
    {
      id: "figure-crosses",
      label: "A figure crosses by the postbox",
      durationMs: 4_000,
      visibleObjectIds: ["parked-van-01", "crossing-person-01"],
      paths: [
        {
          objectId: "crossing-person-01",
          keyframes: [
            { atMs: 0, anchor: { textureX: 3200, textureY: 2450, depthM: 20.4662 }, yawRad: 0 },
            { atMs: 2_000, anchor: { textureX: 3700, textureY: 2450, depthM: 20.4662 }, yawRad: 0 },
            { atMs: 4_000, anchor: { textureX: 4250, textureY: 2450, depthM: 20.4662 }, yawRad: 0 },
          ],
        },
      ],
    },
    {
      id: "car-passes",
      label: "The car comes around the corner",
      durationMs: 5_000,
      visibleObjectIds: ["parked-van-01", "crossing-person-01", "moving-car-01"],
      paths: [
        {
          objectId: "moving-car-01",
          keyframes: [
            { atMs: 0, anchor: { textureX: 6120, textureY: 2470, depthM: 18.0091 }, yawRad: -Math.PI / 2 },
            { atMs: 2_500, anchor: { textureX: 5480, textureY: 2530, depthM: 13.2521 }, yawRad: -Math.PI / 2 },
            { atMs: 5_000, anchor: { textureX: 4750, textureY: 2620, depthM: 9.5137 }, yawRad: -Math.PI / 2 },
          ],
        },
      ],
    },
    {
      id: "van-correction",
      label: "The van was dark, facing the other way",
      durationMs: 4_000,
      visibleObjectIds: ["parked-van-01", "crossing-person-01", "moving-car-01"],
      paths: [],
    },
  ],
};

export const VAN_CORRECTION: SceneObjectCorrection = {
  description: "Dark navy panel van",
  yawRad: -Math.PI / 2,
  appearance: { color: "navy" },
};

export const VAN_OBJECT_ID = "parked-van-01";
export const CORRECTION_STEP_ID = "van-correction";
