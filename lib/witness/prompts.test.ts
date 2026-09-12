import assert from "node:assert/strict";
import test from "node:test";
import { vanPrompt } from "./prompts.ts";

test("the original van prompt puts its front toward the camera and fits the front plane", () => {
  const prompt = vanPrompt("white");
  assert.match(prompt, /^Replace only the grey van-shaped guide at the right kerb/i);
  assert.match(prompt, /front faces the camera/i);
  assert.match(prompt, /grille and bumper align with the nearest upright plane at 90 degrees/i);
  assert.match(prompt, /Preserve the street.+camera, and source motion/i);
  assert.ok(prompt.length <= 600);
});

test("the corrected van prompt reverses with its rear toward the camera", () => {
  const prompt = vanPrompt("navy");
  assert.match(prompt, /^Replace only the grey van-shaped guide at the right kerb/i);
  assert.match(prompt, /rear faces the camera/i);
  assert.match(prompt, /front points away along the long axis/i);
  assert.match(prompt, /nearest end plane is at 90 degrees/i);
  assert.ok(prompt.length <= 600);
});
