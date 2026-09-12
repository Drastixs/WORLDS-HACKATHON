import assert from "node:assert/strict";
import {
  LoopCache,
  MAX_ENTRIES,
  loopCacheKey,
  type LoopCacheEntry,
} from "../../components/witness/loop-cache.ts";
import type { ProjectedGuide, ViewPose } from "../../lib/witness/geometry.ts";
import type { VanVariant } from "../../lib/witness/contract.ts";

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const guide: ProjectedGuide = {
  outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
  wheels: [],
  bounds: { x: 0, y: 0, width: 1, height: 1 },
};
const basePose: ViewPose = { yaw: radians(22), pitch: 0, zoom: 45 };

assert.equal(
  loopCacheKey(basePose, "white"),
  loopCacheKey({ yaw: radians(22.8), pitch: radians(0.4), zoom: 45.4 }, "white"),
  "nearby matching poses should share a key",
);
assert.notEqual(
  loopCacheKey(basePose, "white"),
  loopCacheKey(basePose, "navy"),
  "different variants must not share a key",
);
assert.equal(
  loopCacheKey({ yaw: radians(179), pitch: 0, zoom: 45 }, "white"),
  loopCacheKey({ yaw: radians(-179), pitch: 0, zoom: 45 }, "white"),
  "nearby poses across the yaw seam should share a key",
);

const revoked: string[] = [];
const originalRevoke = URL.revokeObjectURL;
URL.revokeObjectURL = (url: string) => revoked.push(url);

const entry = (id: number, variant: VanVariant = "white"): LoopCacheEntry => {
  const pose = { ...basePose, yaw: basePose.yaw + radians(id * 6) };
  return {
    key: loopCacheKey(pose, variant),
    blobUrl: `blob:loop-${id}`,
    guide,
    pose,
    variant,
    sceneRevision: "v1",
    durationMs: 4_000,
    createdAt: id,
  };
};

try {
  const cache = new LoopCache(2);
  const first = entry(1);
  const second = entry(2);
  const third = entry(3);
  cache.put(first);
  cache.put(second);
  assert.equal(cache.get(first.key), first, "get should return and refresh an entry");
  cache.put(third);
  assert.equal(cache.get(second.key), undefined, "least recently used entry should be evicted");
  assert.deepEqual(revoked, [second.blobUrl], "eviction should revoke its blob URL");

  cache.invalidate((candidate) => candidate.key === first.key);
  assert.equal(cache.get(first.key), undefined, "invalidate should remove matching entries");
  assert.ok(revoked.includes(first.blobUrl), "invalidate should revoke matching blob URLs");

  cache.clear();
  assert.equal(cache.size, 0, "clear should empty the cache");
  assert.ok(revoked.includes(third.blobUrl), "clear should revoke remaining blob URLs");

  const capped = new LoopCache();
  const cappedEntries = Array.from({ length: MAX_ENTRIES + 1 }, (_, index) => entry(20 + index));
  cappedEntries.slice(0, MAX_ENTRIES).forEach((candidate) => capped.put(candidate));
  capped.get(cappedEntries[0].key);
  capped.put(cappedEntries[MAX_ENTRIES]);
  assert.equal(capped.size, MAX_ENTRIES, "default cache should stay within MAX_ENTRIES");
  assert.equal(
    capped.get(cappedEntries[1].key),
    undefined,
    "default LRU should evict its least-recently-used entry beyond MAX_ENTRIES",
  );
  assert.ok(
    revoked.includes(cappedEntries[1].blobUrl),
    "default LRU eviction should revoke the evicted object URL",
  );
  capped.clear();
} finally {
  URL.revokeObjectURL = originalRevoke;
}

console.log("loop-cache-check: all assertions passed");
