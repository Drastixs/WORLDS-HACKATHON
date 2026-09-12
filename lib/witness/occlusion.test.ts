import assert from "node:assert/strict";
import test from "node:test";
import { WITNESS_DEMO_SCRIPT } from "./demo-script.ts";
import { densifyTexturePolygon, occlusionMasksForObject, texturePointInPolygon } from "./occlusion.ts";
import { createPlayback, evaluatePlayback } from "./scene-playback.ts";
import { validateSceneExport } from "./scene.ts";

const enclosure = WITNESS_DEMO_SCRIPT.scene.occlusionMasks![0];

test("validates calibrated scene masks and their object targets", () => {
  assert.equal(validateSceneExport(WITNESS_DEMO_SCRIPT.scene), WITNESS_DEMO_SCRIPT.scene);
  const invalid = structuredClone(WITNESS_DEMO_SCRIPT.scene);
  invalid.occlusionMasks![0].occludesObjectIds = ["missing-object"];
  assert.throws(() => validateSceneExport(invalid), /unknown object ID/);
});

test("densifies every polygon edge within the projection limit", () => {
  const dense = densifyTexturePolygon(enclosure.texturePolygon, 48);
  assert.ok(dense.length > enclosure.texturePolygon.length);
  for (let index = 0; index < dense.length; index += 1) {
    const start = dense[index];
    const end = dense[(index + 1) % dense.length];
    assert.ok(Math.hypot(end.textureX - start.textureX, end.textureY - start.textureY) <= 48.001);
  }
});

test("the authored figure passes behind the enclosure and reappears", () => {
  const playback = createPlayback(WITNESS_DEMO_SCRIPT);
  const stepTwo = { ...playback, stepIndex: 1 };
  const durationMs = WITNESS_DEMO_SCRIPT.steps[1].durationMs;
  const figureAt = (elapsedMs: number) =>
    evaluatePlayback(stepTwo, elapsedMs).scene.objects.find((object) => object.id === "crossing-person-01")!;

  assert.equal(texturePointInPolygon(figureAt(0).anchor, enclosure.texturePolygon), false);
  assert.equal(texturePointInPolygon(figureAt(durationMs / 2).anchor, enclosure.texturePolygon), true);
  assert.equal(texturePointInPolygon(figureAt(durationMs - 1).anchor, enclosure.texturePolygon), false);
  assert.equal(texturePointInPolygon(figureAt(durationMs * 1.5).anchor, enclosure.texturePolygon), true);
  assert.deepEqual(occlusionMasksForObject([enclosure], "crossing-person-01"), [enclosure]);
  assert.deepEqual(occlusionMasksForObject([enclosure], "parked-van-01"), []);
});
