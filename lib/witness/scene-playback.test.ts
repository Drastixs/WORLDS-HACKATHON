import assert from "node:assert/strict";
import test from "node:test";
import { SCENE_SCHEMA_VERSION, type SceneExport } from "./scene.ts";
import {
  advancePlayback,
  correctPlaybackObject,
  createPlayback,
  evaluatePlayback,
  restartPlayback,
  type PlaybackScript,
} from "./scene-playback.ts";

function scene(): SceneExport {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    panorama: { asset: "/panorama.jpg", widthPx: 1000, heightPx: 500 },
    objects: [
      {
        id: "van-1",
        kind: "vehicle",
        description: "White van",
        anchor: { textureX: 100, textureY: 250, depthM: 10 },
        dimensionsM: { width: 4, height: 2, depth: 2 },
        yawRad: 0,
        approximate: true,
      },
      {
        id: "person-1",
        kind: "person",
        description: "Person in a red jacket",
        anchor: { textureX: 300, textureY: 250, depthM: 8 },
        dimensionsM: { width: 0.6, height: 1.8, depth: 0.4 },
        yawRad: 0,
        approximate: true,
      },
    ],
  };
}

function script(): PlaybackScript {
  return {
    scene: scene(),
    steps: [
      {
        id: "street-build",
        label: "The street builds",
        durationMs: 1_000,
        visibleObjectIds: ["van-1", "person-1"],
        paths: [
          {
            objectId: "person-1",
            keyframes: [
              { atMs: 0, anchor: { textureX: 300, textureY: 250, depthM: 8 } },
              { atMs: 1_000, anchor: { textureX: 500, textureY: 250, depthM: 10 } },
            ],
          },
        ],
      },
      { id: "car-arrives", label: "The car arrives", durationMs: 500, paths: [] },
      { id: "correction", label: "Correct the van", durationMs: 750, paths: [] },
    ],
  };
}

function objectAt(state: ReturnType<typeof createPlayback>, elapsedMs: number, id: string) {
  const object = evaluatePlayback(state, elapsedMs).scene.objects.find((item) => item.id === id);
  assert.ok(object);
  return object;
}

test("derives motion from loop time and repeats identical source positions", () => {
  const playback = createPlayback(script());
  assert.equal(objectAt(playback, 250, "person-1").anchor.textureX, 350);
  assert.deepEqual(objectAt(playback, 250, "person-1"), objectAt(playback, 4_250, "person-1"));
  assert.equal(evaluatePlayback(playback, 4_250).progress, 0.25);

  // Evaluation is pure: asking for a later time does not accumulate into the next result.
  objectAt(playback, 900, "person-1");
  assert.equal(objectAt(playback, 250, "person-1").anchor.textureX, 350);
});

test("Next advances exactly one authored step and stops at the final step", () => {
  const initial = createPlayback(script());
  const second = advancePlayback(initial);
  const third = advancePlayback(second);
  const stillThird = advancePlayback(third);

  assert.equal(initial.stepIndex, 0);
  assert.equal(second.stepIndex, 1);
  assert.equal(third.stepIndex, 2);
  assert.equal(stillThird.stepIndex, 2);
  assert.equal(stillThird, third);
});

test("a correction keeps the object ID, survives loops, and leaves other objects unchanged", () => {
  const initial = createPlayback(script());
  const originalPerson = objectAt(initial, 200, "person-1");
  const corrected = correctPlaybackObject(initial, "van-1", {
    description: "Dark navy van",
    yawRad: Math.PI,
  });

  const firstLoop = objectAt(corrected, 100, "van-1");
  const laterLoop = objectAt(corrected, 3_100, "van-1");
  assert.equal(firstLoop.id, "van-1");
  assert.equal(firstLoop.description, "Dark navy van");
  assert.equal(firstLoop.yawRad, Math.PI);
  assert.deepEqual(laterLoop, firstLoop);
  assert.deepEqual(objectAt(corrected, 200, "person-1"), originalPerson);
  assert.equal(objectAt(advancePlayback(corrected), 100, "van-1").description, "Dark navy van");
});

test("completed paths persist and future objects stay hidden across a correction step", () => {
  const authored = script();
  authored.steps[0].visibleObjectIds = ["van-1"];
  authored.steps[1].visibleObjectIds = ["van-1", "person-1"];
  authored.steps[2].visibleObjectIds = ["van-1", "person-1"];
  let playback = createPlayback(authored);

  assert.deepEqual(evaluatePlayback(playback, 0).scene.objects.map((object) => object.id), ["van-1"]);
  playback = advancePlayback(playback);
  playback = advancePlayback(playback);
  playback = correctPlaybackObject(playback, "van-1", { description: "Dark navy van" });

  const snapshot = evaluatePlayback(playback, 300);
  assert.equal(snapshot.scene.objects.find((object) => object.id === "person-1")?.anchor.textureX, 500);
  assert.equal(snapshot.scene.objects.find((object) => object.id === "van-1")?.description, "Dark navy van");
});

test("Restart restores the first step and the original scene", () => {
  let playback = createPlayback(script());
  playback = advancePlayback(playback);
  playback = correctPlaybackObject(playback, "van-1", {
    description: "Dark navy van",
    anchor: { depthM: 12 },
  });

  const restarted = restartPlayback(playback);
  assert.equal(restarted.stepIndex, 0);
  assert.equal(objectAt(restarted, 0, "van-1").description, "White van");
  assert.equal(objectAt(restarted, 0, "van-1").anchor.depthM, 10);
  assert.deepEqual(restarted.corrections, {});
});

test("rejects invalid paths and corrections to unknown objects", () => {
  const invalid = script();
  invalid.steps[0].paths[0].objectId = "missing";
  assert.throws(() => createPlayback(invalid), /unknown object ID/);

  const playback = createPlayback(script());
  assert.throws(() => correctPlaybackObject(playback, "missing", {}), /unknown object ID/);
});
