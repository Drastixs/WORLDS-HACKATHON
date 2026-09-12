import { createSpriteGenerator } from "./h3-sprite";
export type { SpriteClip as PersonClip } from "./h3-sprite";
export const PERSON_PROMPT = `Picture 1 is a placement guide for one full-body adult pedestrian against an evenly lit pure chroma green (#00ff00) background. Replace the grey silhouette with one realistic adult wearing a dark red jacket, charcoal trousers and dark shoes. No green clothing. Full body, head and both feet always visible. Side profile facing screen RIGHT. A seamless walking-in-place cycle: alternate natural leg strides and opposite arm swings while the torso stays at exactly the same screen position and scale. The person must NOT translate across the frame. Keep the person inside the guide's extent, centred horizontally, with feet at its bottom edge. Locked camera, no zoom, pan, cuts, scene or perspective changes. Entire background and floor remain flat pure bright green, no street, scenery, props, shadows, text or other people. Realistic daylight on the person. Five seconds of steady walking in place, suitable for a looping sprite. Silent, no music.`;
const generator = createSpriteGenerator({
  label: "walking person", prompt: PERSON_PROMPT, aspect: "9:16", width: 192, height: 336,
  reference(ctx, width, height) {
    ctx.fillStyle = "#808080";
    ctx.beginPath(); ctx.ellipse(width / 2, height * .164, width * .091, height * .063, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(width * .404, height * .223, width * .193, height * .298);
    ctx.fillRect(width * .410, height * .521, width * .078, height * .350);
    ctx.fillRect(width * .517, height * .521, width * .078, height * .350);
    ctx.fillRect(width * .336, height * .246, width * .059, height * .260);
    ctx.fillRect(width * .605, height * .246, width * .059, height * .260);
  },
});
export const cachedPersonClip = generator.cached;
export const generatePersonClip = generator.generate;
