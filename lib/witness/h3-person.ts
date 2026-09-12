import { Reactor } from "@reactor-team/js-sdk";
import { H3_MODEL, H3_SEED } from "./h3-test";

export type PersonClip = { frames: HTMLCanvasElement[]; durationMs: number; bounds: { x: number; y: number; width: number; height: number } };
let cached: PersonClip | undefined;
export function cachedPersonClip() { return cached; }
export const PERSON_PROMPT = `Picture 1 is a placement guide for one full-body adult pedestrian against an evenly lit pure chroma green (#00ff00) background. Replace the grey silhouette with one realistic adult wearing a dark red jacket, charcoal trousers and dark shoes. No green clothing. Full body, head and both feet always visible. Side profile facing screen RIGHT. A seamless walking-in-place cycle: alternate natural leg strides and opposite arm swings while the torso stays at exactly the same screen position and scale. The person must NOT translate across the frame. Keep the person inside the guide's extent, centred horizontally, with feet at its bottom edge. Locked camera, no zoom, pan, cuts, scene or perspective changes. Entire background and floor remain flat pure bright green, no street, scenery, props, shadows, text or other people. Realistic daylight on the person. Five seconds of steady walking in place, suitable for a looping sprite. Silent, no music.`;

export async function generatePersonClip(signal: AbortSignal, progress: (text: string) => void): Promise<PersonClip> {
  if (cached) return cached;
  signal.throwIfAborted();
  const reference = document.createElement("canvas"); reference.width = 768; reference.height = 1344;
  const rc = reference.getContext("2d")!; rc.fillStyle = "#00ff00"; rc.fillRect(0, 0, 768, 1344);
  rc.fillStyle = "#808080"; rc.beginPath(); rc.ellipse(384, 220, 70, 85, 0, 0, Math.PI * 2); rc.fill();
  rc.fillRect(310, 300, 148, 400); rc.fillRect(315, 700, 60, 470); rc.fillRect(397, 700, 60, 470);
  rc.fillRect(258, 330, 45, 350); rc.fillRect(465, 330, 45, 350);
  const png = await new Promise<Blob>((resolve, reject) => reference.toBlob(b => b ? resolve(b) : reject(new Error("Reference capture failed")), "image/png"));
  let token: string | undefined;
  const reactor = new Reactor({ modelName: H3_MODEL, jwt: async () => {
    if (token) return token;
    const response = await fetch("/api/reactor/h3-token", { signal, cache: "no-store" });
    const data = await response.json(); if (!response.ok || !data.jwt) throw new Error(data.error || "H3 token unavailable");
    token = data.jwt; return token!;
  } });
  const video = document.createElement("video"); video.muted = true; video.playsInline = true;
  let callback = 0;
  try {
    return await new Promise<PersonClip>((resolve, reject) => {
      let done = false, firstTime = -1, lastTime = -1;
      const frames: HTMLCanvasElement[] = [];
      let minX = 192, minY = 336, maxX = 0, maxY = 0;
      const finish = (error?: Error) => {
        if (done) return; done = true; clearTimeout(timeout); signal.removeEventListener("abort", abort);
        if (error) { reject(error); return; }
        if (frames.length < 20 || maxX <= minX || maxY <= minY) { reject(new Error("H3 did not produce a usable walking clip. Try again.")); return; }
        cached = { frames, durationMs: 5000, bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
        resolve(cached);
      };
      const abort = () => finish(new Error("Person generation cancelled"));
      const timeout = setTimeout(() => finish(new Error("H3 person generation timed out. Try again.")), 180000);
      signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) { abort(); return; }
      const capture: VideoFrameRequestCallback = (_now, metadata) => {
        if (done) return;
        if (frames.length < 120 && metadata.mediaTime - lastTime >= .04) {
          const frame = document.createElement("canvas"); frame.width = 192; frame.height = 336;
          const ctx = frame.getContext("2d")!; ctx.drawImage(video, 0, 0, 192, 336);
          const pixels = ctx.getImageData(0, 0, 192, 336); let green = 0;
          for (let i = 0; i < pixels.data.length; i += 4) {
            const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
            const excess = g - Math.max(r, b);
            if (g > 65 && excess > 25) { pixels.data[i + 3] = Math.round(255 * (1 - Math.min(1, (excess - 25) / 35))); green++; }
          }
          // Ignore pre-roll black frames and refuse a clip without its removable background.
          if (green > 192 * 336 * .3) {
            for (let y = 0; y < 336; y++) for (let x = 0; x < 192; x++) {
              if (pixels.data[(y * 192 + x) * 4 + 3] > 128) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
            }
            ctx.putImageData(pixels, 0, 0); frames.push(frame); firstTime = firstTime < 0 ? metadata.mediaTime : firstTime; lastTime = metadata.mediaTime;
          }
        }
        callback = video.requestVideoFrameCallback(capture);
      };
      reactor.on("trackReceived", (_name, track) => { if (!done && track.kind === "video") { video.srcObject = new MediaStream([track]); void video.play().catch(e => finish(e)); callback = video.requestVideoFrameCallback(capture); } });
      reactor.on("error", e => finish(new Error(e.message)));
      reactor.on("message", message => {
        if (done) return;
        const data = message.data as { clip?: { clip_id: string }; reason?: string };
        if (message.type === "clip_generated") { progress("Caching walking motion…"); void reactor.sendCommand("play", { clip_id: data.clip!.clip_id }); }
        if (message.type === "clip_finished") setTimeout(() => finish(), 350);
        if (message.type === "clip_failed" || message.type === "command_error") finish(new Error(data.reason || message.type));
      });
      void (async () => {
        progress("Connecting to H3…"); await reactor.connect(); if (done) return;
        for (const [command, data, expected] of [["set_canvas", { aspect: "9:16" }, "canvas_accepted"], ["set_autoplay", { enabled: false }, "autoplay_accepted"]] as const) {
          const reply = await reactor.sendCommand(command, data); if (done) return;
          if (reply?.type !== expected) throw new Error(`H3 did not accept ${command}`);
        }
        const file = await reactor.uploadFile(png); if (done) return;
        progress("Generating walking person…");
        const reply = await reactor.sendCommand("enqueue", { prompt: PERSON_PROMPT, reference_image: file, seconds: 5, seed: H3_SEED });
        if (!done && reply?.type !== "clip_queued") throw new Error("H3 did not queue the person");
      })().catch(e => finish(e));
    });
  } finally {
    if (callback) video.cancelVideoFrameCallback(callback); video.pause(); video.srcObject = null;
    void reactor.disconnect().catch(() => {});
  }
}
