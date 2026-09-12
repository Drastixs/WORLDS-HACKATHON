import assert from "node:assert/strict";
import test from "node:test";
import { createModelFrameSnapshot, type SceneFrameInput } from "./model-frame.ts";

function input(): SceneFrameInput {
  return {
    frameId: "figure-crosses:2500",
    sceneRevision: "witness-demo-v1",
    calibrationRevision: "paris-garden-provisional-v1",
    animationTimeMs: 2_500,
    capturedAtMs: 18_250,
    pose: { yaw: 0.4, pitch: -0.08, zoom: 45 },
    verticalFovDeg: 57.5,
    widthPx: 1472,
    heightPx: 832,
    objects: [
      { id: "parked-van-01", kind: "vehicle", facing: "right", bounds: { x: 900, y: 350, width: 360, height: 210 }, occlusionPolygons: [] },
      { id: "crossing-person-01", kind: "person", facing: "left", bounds: { x: 410, y: 310, width: 70, height: 270 }, occlusionPolygons: [[{ x: 420, y: 400 }, { x: 450, y: 400 }, { x: 450, y: 500 }]] },
    ],
  };
}

test("preserves stable revision, timing, camera and object identity metadata", () => {
  const frame = createModelFrameSnapshot(input());
  assert.deepEqual(frame.metadata, {
    frameId: "figure-crosses:2500",
    sceneRevision: "witness-demo-v1",
    calibrationRevision: "paris-garden-provisional-v1",
    animationTimeMs: 2_500,
    capturedAtMs: 18_250,
    pose: { yaw: 0.4, pitch: -0.08, zoom: 45 },
    verticalFovDeg: 57.5,
    widthPx: 1472,
    heightPx: 832,
  });
  assert.deepEqual(frame.objects.map(({ id }) => id), ["parked-van-01", "crossing-person-01"]);
});

test("clones and freezes a frame so later renderer state cannot rewrite its record", () => {
  const mutable = input() as {
    pose: { yaw: number; pitch: number; zoom: number };
    objects: { id: string; kind: "vehicle" | "person" | "animal"; facing: "left" | "right"; bounds: { x: number; y: number; width: number; height: number }; occlusionPolygons: { x: number; y: number }[][] }[];
  } & SceneFrameInput;
  const frame = createModelFrameSnapshot(mutable);
  mutable.pose.yaw = 2;
  mutable.objects[0].bounds.x = 12;
  mutable.objects[1].occlusionPolygons[0][0].x = 12;

  assert.equal(frame.metadata.pose.yaw, 0.4);
  assert.equal(frame.objects[0].bounds.x, 900);
  assert.equal(frame.objects[1].occlusionPolygons[0][0].x, 420);
  assert.equal(Object.isFrozen(frame), true);
  assert.equal(Object.isFrozen(frame.metadata.pose), true);
  assert.equal(Object.isFrozen(frame.objects[0].guide[0]), true);
  assert.equal(Object.isFrozen(frame.objects[0].mask[0]), true);
});

test("vehicle facing reverses its asymmetric guide while preserving matching masks", () => {
  const right = createModelFrameSnapshot(input()).objects[0];
  const changed = input();
  const left = createModelFrameSnapshot({
    ...changed,
    objects: changed.objects.map((object) => object.id === "parked-van-01" ? { ...object, facing: "left" } : object),
  }).objects[0];
  assert.notDeepEqual(left.guide, right.guide);
  assert.deepEqual(left.mask, left.guide);
});

test("vehicle guides have a body, cabin and two wheels with a matching mask", () => {
  const vehicle = createModelFrameSnapshot(input()).objects[0];
  assert.deepEqual(vehicle.guide.map(({ role }) => role), [
    "vehicle-body",
    "vehicle-cabin",
    "vehicle-wheel",
    "vehicle-wheel",
  ]);
  assert.equal(vehicle.guide.filter(({ shape }) => shape === "ellipse").length, 2);
  assert.deepEqual(vehicle.mask, vehicle.guide);
  assert.notEqual(vehicle.mask, vehicle.guide);
});

test("person guides have a head, torso and separate legs with a matching mask", () => {
  const person = createModelFrameSnapshot(input()).objects[1];
  assert.deepEqual(person.guide.map(({ role }) => role), [
    "person-head",
    "person-torso",
    "person-left-leg",
    "person-right-leg",
  ]);
  assert.equal(person.guide[0].shape, "ellipse");
  assert.equal(person.guide.slice(1).every(({ shape }) => shape === "polygon"), true);
  assert.deepEqual(person.mask, person.guide);
});

test("rejects frame records that cannot be aligned later", () => {
  assert.throws(
    () => createModelFrameSnapshot({ ...input(), sceneRevision: "" }),
    /sceneRevision is required/,
  );
  assert.throws(
    () => createModelFrameSnapshot({ ...input(), verticalFovDeg: 180 }),
    /verticalFovDeg must be between/,
  );
  assert.throws(
    () => createModelFrameSnapshot({ ...input(), objects: [...input().objects, input().objects[0]] }),
    /duplicate frame object ID/,
  );
});
