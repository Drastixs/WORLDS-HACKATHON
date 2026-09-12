import type { ProjectedGuide, ViewPose } from "../../lib/witness/geometry";
import type { VanVariant } from "../../lib/witness/contract";

export const MAX_ENTRIES = 6;
export const POSE_BUCKET_RAD = (6 * Math.PI) / 180;
export const ZOOM_BUCKET = 4;
const YAW_BUCKETS = Math.round((2 * Math.PI) / POSE_BUCKET_RAD);
const DEFAULT_ZOOM = 45;

export type LoopCacheEntry = {
  key: string;
  blobUrl: string;
  guide: ProjectedGuide;
  pose: ViewPose;
  variant: VanVariant;
  sceneRevision: string;
  durationMs: number;
  createdAt: number;
};

function normaliseYaw(yaw: number) {
  const turn = Math.PI * 2;
  return ((yaw % turn) + turn) % turn;
}

function bucket(value: number, size: number) {
  return Math.round(value / size);
}

export function loopCacheKey(
  pose: ViewPose,
  variant: VanVariant,
  sceneRevision = "v1",
) {
  return [
    sceneRevision,
    variant,
    bucket(normaliseYaw(pose.yaw), POSE_BUCKET_RAD) % YAW_BUCKETS,
    bucket(pose.pitch, POSE_BUCKET_RAD),
    bucket(pose.zoom - DEFAULT_ZOOM, ZOOM_BUCKET),
  ].join(":");
}

export class LoopCache {
  readonly maxEntries: number;
  private readonly entries = new Map<string, LoopCacheEntry>();

  constructor(maxEntries = MAX_ENTRIES) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("LoopCache maxEntries must be a positive integer.");
    }
    this.maxEntries = maxEntries;
  }

  get size() {
    return this.entries.size;
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Map insertion order is the LRU order: newest at the end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  find(
    pose: ViewPose,
    variant: VanVariant,
    sceneRevision: string,
    matches: (a: ViewPose, b: ViewPose) => boolean,
  ) {
    const keyed = this.get(loopCacheKey(pose, variant, sceneRevision));
    if (keyed && matches(pose, keyed.pose)) return keyed;

    // Quantisation has bucket edges. Check the bounded cache so a genuinely
    // matching pose on the other side of an edge is still reused safely.
    for (const candidate of this.entries.values()) {
      if (
        candidate.variant === variant &&
        candidate.sceneRevision === sceneRevision &&
        matches(pose, candidate.pose)
      ) {
        return this.get(candidate.key);
      }
    }
    return undefined;
  }

  put(entry: LoopCacheEntry) {
    const replaced = this.entries.get(entry.key);
    if (replaced) {
      this.entries.delete(entry.key);
      if (replaced.blobUrl !== entry.blobUrl) URL.revokeObjectURL(replaced.blobUrl);
    }
    this.entries.set(entry.key, entry);

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) URL.revokeObjectURL(oldest.blobUrl);
    }
  }

  invalidate(predicate: (entry: LoopCacheEntry) => boolean) {
    for (const [key, entry] of this.entries) {
      if (!predicate(entry)) continue;
      this.entries.delete(key);
      URL.revokeObjectURL(entry.blobUrl);
    }
  }

  clear() {
    this.invalidate(() => true);
  }
}

export const witnessLoopCache = new LoopCache();

export type ReconstructionMode = "live" | "cached" | "updating";
let reconstructionMode: ReconstructionMode = "updating";
const modeListeners = new Set<() => void>();

export function setReconstructionMode(mode: ReconstructionMode) {
  if (reconstructionMode === mode) return;
  reconstructionMode = mode;
  modeListeners.forEach((listener) => listener());
}

export function getReconstructionMode() {
  return reconstructionMode;
}

export function subscribeReconstructionMode(listener: () => void) {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}
