import type { VanVariant } from "./contract";

// Reactor moderates prompts and terminates the session when one is flagged, so nothing that
// reads as violence may reach it. The on-screen transcript can say anything; prompts cannot.
const BLOCKED_WORDS =
  /\b(hit|hits|struck|strikes?|victims?|bod(y|ies)|blood\w*|injur\w*|dead|death|dies?|kill\w*|crash\w*|collid\w*|collision|wound\w*|corpse|run over)\b/i;
const X2_PROMPT_LIMIT = 1000;

export function assertSafeForReactor(prompt: string) {
  const match = prompt.match(BLOCKED_WORDS);
  if (match) throw new Error(`Prompt contains "${match[0]}", which Reactor may moderate.`);
  if (prompt.length > X2_PROMPT_LIMIT) {
    throw new Error(`X2 prompts are limited to ${X2_PROMPT_LIMIT} characters (this one is ${prompt.length}).`);
  }
  return prompt;
}

// One object in the scene, as the prompt describes it (architecture.md, Part A: each guide shape
// and spatial location mapped to its description, scale, facing and appearance). The model-facing
// frame carries no text labels, so objects are named by their guide's shape and place.
type SceneObject = {
  shape: string;
  description: string;
  placement: string;
  orientation: string;
  fit: string;
};

const VAN: Record<VanVariant, SceneObject> = {
  white: {
    shape: "van-shaped",
    description: "a white panel van like the van in the reference image",
    placement: "at the kerb on the right, in front of the low building",
    orientation:
      "The front faces directly toward the camera along the guide's long axis. Align the grille and " +
      "bumper with the nearest upright end plane, perpendicular at 90 degrees to the long axis",
    fit:
      "Fit the van tightly to the complete grey guide: align the front bumper, grille, roof corners, " +
      "side edges and tyre contact points with the corresponding guide boundary",
  },
  navy: {
    shape: "van-shaped",
    description: "a dark navy blue panel van shaped like the van in the reference image",
    placement: "at the kerb on the right, in front of the low building",
    orientation:
      "The rear is nearest the camera and the front points directly away along the guide's long axis. " +
      "The rear plane is perpendicular, at 90 degrees, to that axis",
    fit:
      "Fit the van tightly to the complete grey guide: align its bumper, roof corners, side edges " +
      "and tyre contact points with the corresponding guide boundary",
  },
};

// Part A's detailed prompt template: the objects, background preservation with the existing
// camera and lighting, motion and occlusion, then removing every guide and label.
function buildPrompt(objects: SceneObject[]) {
  const replacements = objects.map(
    (object) =>
      `Replace the grey ${object.shape} guide ${object.placement} with ${object.description}, ` +
      `at exactly the same size and position. ${object.orientation}. ${object.fit}. ` +
      "Keep every generated vehicle pixel inside the guide; do not extend beyond any edge or corner.",
  );
  return assertSafeForReactor(
    [
      ...replacements,
      "Keep the photographed pub, fence, buildings, trees, road, light, shadows and camera perspective unchanged.",
      "Each object follows its guide's motion and stays hidden wherever something covers its " +
        "guide. A parked vehicle stays parked and still.",
      "Remove every grey guide shape completely.",
    ].join(" "),
  );
}

export function vanPrompt(variant: VanVariant) {
  return buildPrompt([VAN[variant]]);
}
