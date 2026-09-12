import { SCENE_SCHEMA_VERSION } from "./scene";
import type { PlaybackScript, SceneObjectCorrection } from "./scene-playback";

// Temporary authored fixture for Stage 2. Replace these approximate anchors with
// the annotation teammate's export when it lands.
export const WITNESS_DEMO_SCRIPT: PlaybackScript = {
  scene: {
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
      {
        id: "crossing-person-01",
        kind: "person",
        description: "Figure crossing",
        anchor: { textureX: 4470, textureY: 2475, depthM: 11.8 },
        dimensionsM: { width: 0.65, height: 1.75, depth: 0.45 },
        yawRad: 0,
        appearance: { color: "dark" },
        approximate: true,
      },
      {
        id: "moving-car-01",
        kind: "vehicle",
        description: "Passing car",
        anchor: { textureX: 6120, textureY: 2500, depthM: 16 },
        dimensionsM: { width: 4.35, height: 1.5, depth: 1.85 },
        yawRad: -Math.PI / 2,
        appearance: { color: "dark" },
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
      durationMs: 5_000,
      visibleObjectIds: ["parked-van-01", "crossing-person-01"],
      paths: [
        {
          objectId: "crossing-person-01",
          keyframes: [
            { atMs: 0, anchor: { textureX: 4310, textureY: 2460, depthM: 12.4 }, yawRad: 0 },
            { atMs: 2_500, anchor: { textureX: 4510, textureY: 2500, depthM: 11.6 }, yawRad: 0 },
            { atMs: 5_000, anchor: { textureX: 4710, textureY: 2540, depthM: 10.8 }, yawRad: 0 },
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
            { atMs: 0, anchor: { textureX: 6120, textureY: 2470, depthM: 16 }, yawRad: -Math.PI / 2 },
            { atMs: 2_500, anchor: { textureX: 5480, textureY: 2530, depthM: 12.5 }, yawRad: -Math.PI / 2 },
            { atMs: 5_000, anchor: { textureX: 4750, textureY: 2620, depthM: 9.5 }, yawRad: -Math.PI / 2 },
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
