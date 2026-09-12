import assert from "node:assert/strict";
import test from "node:test";
import { SCENE_SCHEMA_VERSION, validateSceneExport, type SceneExport } from "./scene.ts";

function scene(): SceneExport {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    panorama: { asset: "/panorama.jpg", widthPx: 1000, heightPx: 500 },
    objects: [
      {
        id: "van-1",
        kind: "vehicle",
        description: "A van",
        anchor: { textureX: 500, textureY: 280, depthM: 8 },
        dimensionsM: { width: 4, height: 2, depth: 2 },
        yawRad: 0,
        approximate: true,
      },
    ],
  };
}

test("accepts a scene with explicit depth and positive dimensions", () => {
  const input = scene();
  assert.equal(validateSceneExport(input), input);
});

test("rejects duplicate stable object IDs", () => {
  const input = scene();
  input.objects.push({ ...input.objects[0] });
  assert.throws(() => validateSceneExport(input), /Duplicate scene object ID/);
});

test("rejects missing depth and non-positive dimensions", () => {
  const missingDepth = scene();
  missingDepth.objects[0].anchor.depthM = Number.NaN;
  assert.throws(() => validateSceneExport(missingDepth), /depthM must be a finite number/);

  const invalidSize = scene();
  invalidSize.objects[0].dimensionsM.height = 0;
  assert.throws(() => validateSceneExport(invalidSize), /height must be positive/);
});
