import { createSpriteGenerator } from "./h3-sprite";
export const CAR_PROMPT = `Picture 1 is a precise silhouette guide for ONE dark charcoal passenger car against a flat pure chroma green (#00ff00) background. Replace only the grey vehicle guide with one realistic compact five-door hatchback. Side profile, its FRONT and headlights facing SCREEN LEFT and its rear facing SCREEN RIGHT. Whole car and both visible wheels always inside the frame. Fit the roof, bumper and tyres within the guide. For the full five seconds the wheels rotate smoothly as if driving forward, but the body remains at exactly the same screen position and scale, like a stationary camera tracking a car. No translation, turning, zoom, cuts or camera movement. No green paint, green windows or green reflections. Dark charcoal paint, neutral daylight, realistic tyres and windows. Background and floor must stay uniform bright pure green, without scenery, road, shadows, smoke, people, captions or additional vehicles. Seamless consistent driving-in-place loop. Silent, no music.`;
const generator = createSpriteGenerator({
  label: "moving car", prompt: CAR_PROMPT, aspect: "16:9", width: 336, height: 192,
  reference(ctx, width, height) {
    ctx.fillStyle = "#808080";
    ctx.beginPath();
    [[.12,.64],[.12,.49],[.25,.45],[.34,.29],[.67,.29],[.79,.46],[.88,.49],[.88,.64]].forEach(([x,y],i)=> i ? ctx.lineTo(x*width,y*height) : ctx.moveTo(x*width,y*height));
    ctx.closePath(); ctx.fill();
    for (const x of [.28,.73]) { ctx.beginPath(); ctx.ellipse(x*width,.64*height,.055*width,.096*height,0,0,Math.PI*2); ctx.fill(); }
  },
});
export const cachedCarClip = generator.cached;
export const generateCarClip = generator.generate;
