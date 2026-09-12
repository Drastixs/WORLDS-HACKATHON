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

// X2 conditions on three distinct inputs: the source owns scene and motion, the reference owns
// appearance, and this prompt owns one transformation, one physical relationship and one short
// preservation boundary. Keeping those responsibilities separate avoids contradictory signals.
type X2PromptLayers = {
  targetAndChange: string;
  relationship: string;
  preservation: string;
};

const VAN: Record<VanVariant, X2PromptLayers> = {
  white: {
    targetAndChange:
      "Replace only the grey van-shaped guide at the right kerb with the white panel van from the reference image",
    relationship:
      "The parked van fills the guide exactly and stays still: its front faces the camera, its grille and bumper align with the nearest upright plane at 90 degrees to the long axis, and its tyres meet the lower edge",
    preservation:
      "Preserve the street, fence, buildings, trees, road, lighting, shadows, camera, and source motion",
  },
  navy: {
    targetAndChange:
      "Replace only the grey van-shaped guide at the right kerb with the dark navy panel van from the reference image",
    relationship:
      "The parked van fills the guide exactly and stays still: its rear faces the camera, its front points away along the long axis, its nearest end plane is at 90 degrees to that axis, and its tyres meet the lower edge",
    preservation:
      "Preserve the street, fence, buildings, trees, road, lighting, shadows, camera, and source motion",
  },
};

function composePrompt(layers: X2PromptLayers) {
  return assertSafeForReactor(
    `${layers.targetAndChange}. ${layers.relationship}. ${layers.preservation}.`,
  );
}

export function vanPrompt(variant: VanVariant) {
  return composePrompt(VAN[variant]);
}
