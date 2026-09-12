import assert from "node:assert/strict";
import test from "node:test";
import { vanPrompt } from "./prompts.ts";

test("the original van prompt puts its front toward the camera and fits the front plane", () => {
  const prompt = vanPrompt("white");
  assert.match(prompt, /front faces directly toward the camera/i);
  assert.match(prompt, /grille and bumper with the nearest upright end plane/i);
  assert.match(prompt, /inside the guide/i);
  assert.ok(prompt.length <= 1_000);
});

test("the corrected van prompt reverses with its rear toward the camera", () => {
  const prompt = vanPrompt("navy");
  assert.match(prompt, /rear is nearest the camera/i);
  assert.match(prompt, /perpendicular, at 90 degrees/i);
  assert.match(prompt, /roof corners/i);
  assert.match(prompt, /inside the guide/i);
  assert.ok(prompt.length <= 1_000);
});
