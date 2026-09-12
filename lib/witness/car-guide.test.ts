import assert from "node:assert/strict";
import test from "node:test";
import { carGuideCoordinates } from "./car-guide.ts";

test("car reference preserves debug corner perspective with one uniform scale", () => {
  const vertices = [{ x: 100, y: 300 }, { x: 160, y: 280 }, { x: 280, y: 300 }, { x: 220, y: 320 }, { x: 100, y: 180 }, { x: 160, y: 160 }, { x: 280, y: 180 }, { x: 220, y: 200 }];
  const guide = carGuideCoordinates({ vertices, bounds: { x: 100, y: 160, width: 180, height: 160 } });
  assert.ok(Math.abs(guide.bounds.width / guide.bounds.height - 180 / 160) < 1e-9);
  const scale = guide.bounds.width / 180;
  vertices.forEach((p, i) => {
    assert.ok(Math.abs(guide.vertices[i].x - guide.bounds.x - (p.x - 100) * scale) < 1e-9);
    assert.ok(Math.abs(guide.vertices[i].y - guide.bounds.y - (p.y - 160) * scale) < 1e-9);
  });
  assert.ok(guide.bounds.x >= 0 && guide.bounds.y >= 0);
  assert.ok(guide.bounds.x + guide.bounds.width <= 1344);
  assert.ok(guide.bounds.y + guide.bounds.height <= 768);
});

test("rejects a degenerate car reference before generation", () => {
  assert.throws(() => carGuideCoordinates({ vertices: [], bounds: { x: 0, y: 0, width: 0, height: 100 } }), /invalid bounds/);
});
