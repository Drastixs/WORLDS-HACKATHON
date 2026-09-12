import {
  validateSceneExport,
  type PanoramaAnchor,
  type SceneExport,
  type SceneObject,
} from "./scene.ts";

export type MotionKeyframe = {
  atMs: number;
  anchor: PanoramaAnchor;
  yawRad?: number;
};

export type ObjectMotionPath = {
  objectId: string;
  keyframes: MotionKeyframe[];
};

export type PlaybackStep = {
  id: string;
  label: string;
  durationMs: number;
  visibleObjectIds?: string[];
  paths: ObjectMotionPath[];
};

export type PlaybackScript = {
  scene: SceneExport;
  steps: PlaybackStep[];
};

export type SceneObjectCorrection = {
  description?: string;
  anchor?: Partial<PanoramaAnchor>;
  dimensionsM?: Partial<SceneObject["dimensionsM"]>;
  yawRad?: number;
  appearance?: Partial<NonNullable<SceneObject["appearance"]>>;
  approximate?: boolean;
};

export type PlaybackState = {
  readonly script: PlaybackScript;
  readonly stepIndex: number;
  readonly revision: number;
  readonly corrections: Readonly<Record<string, SceneObjectCorrection>>;
};

export type EvaluatedPlayback = {
  scene: SceneExport;
  step: PlaybackStep;
  stepIndex: number;
  loopTimeMs: number;
  progress: number;
  revision: number;
};

function finite(value: number, field: string) {
  if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
}

function cloneAnchor(anchor: PanoramaAnchor): PanoramaAnchor {
  return { ...anchor };
}

function cloneObject(object: SceneObject): SceneObject {
  return {
    ...object,
    anchor: cloneAnchor(object.anchor),
    dimensionsM: { ...object.dimensionsM },
    appearance: object.appearance ? { ...object.appearance } : undefined,
  };
}

function cloneScript(script: PlaybackScript): PlaybackScript {
  return {
    scene: {
      ...script.scene,
      panorama: { ...script.scene.panorama },
      objects: script.scene.objects.map(cloneObject),
      occlusionMasks: script.scene.occlusionMasks?.map((mask) => ({
        ...mask,
        texturePolygon: mask.texturePolygon.map((point) => ({ ...point })),
        occludesObjectIds: [...mask.occludesObjectIds],
      })),
    },
    steps: script.steps.map((step) => ({
      ...step,
      visibleObjectIds: step.visibleObjectIds ? [...step.visibleObjectIds] : undefined,
      paths: step.paths.map((path) => ({
        ...path,
        keyframes: path.keyframes.map((keyframe) => ({
          ...keyframe,
          anchor: cloneAnchor(keyframe.anchor),
        })),
      })),
    })),
  };
}

function validateScript(script: PlaybackScript): PlaybackScript {
  validateSceneExport(script.scene);
  if (script.steps.length === 0) throw new Error("A playback script needs at least one step.");

  const objectIds = new Set(script.scene.objects.map((object) => object.id));
  const stepIds = new Set<string>();

  for (const step of script.steps) {
    if (!step.id.trim()) throw new Error("Every playback step must have an ID.");
    if (stepIds.has(step.id)) throw new Error(`Duplicate playback step ID: ${step.id}.`);
    stepIds.add(step.id);
    finite(step.durationMs, `${step.id}.durationMs`);
    if (step.durationMs <= 0) throw new Error(`${step.id}.durationMs must be positive.`);

    if (step.visibleObjectIds) {
      const visibleIds = new Set<string>();
      for (const objectId of step.visibleObjectIds) {
        if (!objectIds.has(objectId)) throw new Error(`${step.id} shows unknown object ID: ${objectId}.`);
        if (visibleIds.has(objectId)) throw new Error(`${step.id} shows ${objectId} more than once.`);
        visibleIds.add(objectId);
      }
    }

    const pathIds = new Set<string>();
    for (const path of step.paths) {
      if (!objectIds.has(path.objectId)) {
        throw new Error(`${step.id} references unknown object ID: ${path.objectId}.`);
      }
      if (pathIds.has(path.objectId)) {
        throw new Error(`${step.id} has more than one path for ${path.objectId}.`);
      }
      pathIds.add(path.objectId);
      if (path.keyframes.length === 0) {
        throw new Error(`${step.id}.${path.objectId} needs at least one keyframe.`);
      }

      let previousAt = -1;
      for (const keyframe of path.keyframes) {
        finite(keyframe.atMs, `${step.id}.${path.objectId}.atMs`);
        if (keyframe.atMs < 0 || keyframe.atMs > step.durationMs) {
          throw new Error(`${step.id}.${path.objectId}.atMs is outside the step.`);
        }
        if (keyframe.atMs <= previousAt) {
          throw new Error(`${step.id}.${path.objectId} keyframes must be strictly ordered.`);
        }
        previousAt = keyframe.atMs;
        finite(keyframe.anchor.textureX, `${step.id}.${path.objectId}.anchor.textureX`);
        finite(keyframe.anchor.textureY, `${step.id}.${path.objectId}.anchor.textureY`);
        finite(keyframe.anchor.depthM, `${step.id}.${path.objectId}.anchor.depthM`);
        if (keyframe.anchor.depthM <= 0) {
          throw new Error(`${step.id}.${path.objectId}.anchor.depthM must be positive.`);
        }
        if (keyframe.yawRad !== undefined) {
          finite(keyframe.yawRad, `${step.id}.${path.objectId}.yawRad`);
        }
      }
    }
  }

  return script;
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function evaluatePath(path: ObjectMotionPath, loopTimeMs: number) {
  const first = path.keyframes[0];
  const last = path.keyframes[path.keyframes.length - 1];
  if (loopTimeMs <= first.atMs) return first;
  if (loopTimeMs >= last.atMs) return last;

  const endIndex = path.keyframes.findIndex((keyframe) => keyframe.atMs >= loopTimeMs);
  const start = path.keyframes[endIndex - 1];
  const end = path.keyframes[endIndex];
  const amount = (loopTimeMs - start.atMs) / (end.atMs - start.atMs);

  return {
    atMs: loopTimeMs,
    anchor: {
      textureX: lerp(start.anchor.textureX, end.anchor.textureX, amount),
      textureY: lerp(start.anchor.textureY, end.anchor.textureY, amount),
      depthM: lerp(start.anchor.depthM, end.anchor.depthM, amount),
    },
    yawRad:
      start.yawRad === undefined && end.yawRad === undefined
        ? undefined
        : lerp(start.yawRad ?? end.yawRad ?? 0, end.yawRad ?? start.yawRad ?? 0, amount),
  } satisfies MotionKeyframe;
}

function applyCorrection(object: SceneObject, correction?: SceneObjectCorrection): SceneObject {
  if (!correction) return object;
  return {
    ...object,
    ...correction,
    id: object.id,
    kind: object.kind,
    anchor: { ...object.anchor, ...correction.anchor },
    dimensionsM: { ...object.dimensionsM, ...correction.dimensionsM },
    appearance: { ...object.appearance, ...correction.appearance },
  };
}

export function createPlayback(script: PlaybackScript): PlaybackState {
  const ownedScript = cloneScript(script);
  validateScript(ownedScript);
  return { script: ownedScript, stepIndex: 0, revision: 0, corrections: {} };
}

export function advancePlayback(state: PlaybackState): PlaybackState {
  if (state.stepIndex === state.script.steps.length - 1) return state;
  return {
    ...state,
    stepIndex: state.stepIndex + 1,
    revision: state.revision + 1,
  };
}

export function correctPlaybackObject(
  state: PlaybackState,
  objectId: string,
  correction: SceneObjectCorrection,
): PlaybackState {
  if (!state.script.scene.objects.some((object) => object.id === objectId)) {
    throw new Error(`Cannot correct unknown object ID: ${objectId}.`);
  }

  const previous = state.corrections[objectId];
  return {
    ...state,
    revision: state.revision + 1,
    corrections: {
      ...state.corrections,
      [objectId]: {
        ...previous,
        ...correction,
        anchor: { ...previous?.anchor, ...correction.anchor },
        dimensionsM: { ...previous?.dimensionsM, ...correction.dimensionsM },
        appearance: { ...previous?.appearance, ...correction.appearance },
      },
    },
  };
}

export function restartPlayback(state: PlaybackState): PlaybackState {
  return {
    script: state.script,
    stepIndex: 0,
    revision: state.revision + 1,
    corrections: {},
  };
}

export function evaluatePlayback(state: PlaybackState, elapsedMs: number): EvaluatedPlayback {
  finite(elapsedMs, "elapsedMs");
  const step = state.script.steps[state.stepIndex];
  const loopTimeMs = Math.max(0, elapsedMs) % step.durationMs;
  const paths = new Map(step.paths.map((path) => [path.objectId, path]));
  const completedPaths = new Map<string, ObjectMotionPath>();
  for (const completedStep of state.script.steps.slice(0, state.stepIndex)) {
    for (const path of completedStep.paths) completedPaths.set(path.objectId, path);
  }
  const visibleIds = step.visibleObjectIds ? new Set(step.visibleObjectIds) : null;

  const objects = state.script.scene.objects.flatMap((sourceObject) => {
    if (visibleIds && !visibleIds.has(sourceObject.id)) return [];
    const object = cloneObject(sourceObject);
    const completedPath = completedPaths.get(object.id);
    if (completedPath) {
      const keyframe = evaluatePath(completedPath, Number.POSITIVE_INFINITY);
      object.anchor = cloneAnchor(keyframe.anchor);
      if (keyframe.yawRad !== undefined) object.yawRad = keyframe.yawRad;
    }
    const path = paths.get(object.id);
    if (path) {
      const keyframe = evaluatePath(path, loopTimeMs);
      object.anchor = cloneAnchor(keyframe.anchor);
      if (keyframe.yawRad !== undefined) object.yawRad = keyframe.yawRad;
    }
    return [applyCorrection(object, state.corrections[object.id])];
  });

  return {
    scene: {
      ...state.script.scene,
      panorama: { ...state.script.scene.panorama },
      objects,
      occlusionMasks: state.script.scene.occlusionMasks,
    },
    step,
    stepIndex: state.stepIndex,
    loopTimeMs,
    progress: loopTimeMs / step.durationMs,
    revision: state.revision,
  };
}
