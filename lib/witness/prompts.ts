import type { VanVariant } from "./contract";

// Reactor moderates prompts and terminates the session when one is flagged, so nothing that
// reads as violence may reach it. The on-screen transcript can say anything; prompts cannot.
const BLOCKED_WORDS =
  /\b(hit|hits|struck|strikes?|victims?|bod(y|ies)|blood\w*|injur\w*|dead|death|dies?|kill\w*|crash\w*|collid\w*|collision|wound\w*|corpse|run over)\b/i;

export function assertSafeForReactor(prompt: string) {
  const match = prompt.match(BLOCKED_WORDS);
  if (match) throw new Error(`Prompt contains "${match[0]}", which Reactor may moderate.`);
  if (prompt.length > 1000) throw new Error("X2 prompts are limited to 1000 characters.");
  return prompt;
}

// The wording that worked on the real street (docs/evidence/real-street-*): name the guide,
// the one change and where it sits, then what must stay as it is.
const PRESERVE =
  "Keep everything else unchanged: the pub, the black fence, the buildings, the trees, the " +
  "road markings, the sunlight and the camera. The van stays parked and still.";

const VAN_PROMPTS: Record<VanVariant, string> = {
  white:
    "Turn the flat grey van-shaped silhouette at the kerb on the right, in front of the low " +
    "building, into the van from the reference image, parked exactly there at the same size, " +
    `side-on to the camera. ${PRESERVE}`,
  navy:
    "Turn the flat grey van-shaped silhouette at the kerb on the right, in front of the low " +
    "building, into a dark navy blue panel van shaped like the van in the reference image, " +
    "parked exactly there at the same size, side-on to the camera and facing the other way. " +
    PRESERVE,
};

export function vanPrompt(variant: VanVariant) {
  return assertSafeForReactor(VAN_PROMPTS[variant]);
}
