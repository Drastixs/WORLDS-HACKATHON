import { Reactor } from "@reactor-team/js-sdk";
import { WITNESS_DEMO_SCRIPT } from "./demo-script";
import { H3_MODEL, H3_PROMPT, H3_SEED } from "./h3-test";
import { createModelFeed } from "./model-feed";

export type StaticVan = {
  image: HTMLCanvasElement;
  corners: { yaw: number; pitch: number }[];
};
// One still per page lifetime. Restart reuses it; refreshing deliberately clears it.
let cached: StaticVan | undefined;
export function cachedStaticVan() { return cached; }

export async function generateStaticVan(signal: AbortSignal, progress: (message: string) => void): Promise<StaticVan> {
  if (cached) return cached;
  signal.throwIfAborted();
  progress("Preparing van reference…");
  const feed = await createModelFeed(WITNESS_DEMO_SCRIPT.scene.panorama.asset, { yaw: 2.01, pitch: -0.08, zoom: 65 });
  let reactor: Reactor | undefined;
  const video = document.createElement("video"); video.muted = true; video.playsInline = true;
  let callback = 0;
  try {
    const scene = { ...WITNESS_DEMO_SCRIPT.scene, objects: WITNESS_DEMO_SCRIPT.scene.objects.slice(0, 1), occlusionMasks: [] };
    feed.setSceneFrame({ scene, sceneRevision: "h3-static", stepId: "van-recalled", animationTimeMs: 0 });
    const deadline = Date.now() + 10000;
    while (feed.inspection().frame?.metadata.sceneRevision !== "h3-static") {
      signal.throwIfAborted();
      if (Date.now() > deadline) throw new Error("Van reference timed out");
      await new Promise(r => setTimeout(r, 40));
    }
    const source = feed.inspection();
    const bounds = source.frame!.objects[0]?.bounds;
    if (!bounds) throw new Error("Van guide is outside the reference camera");
    const image = document.createElement("canvas"); image.width = 1344; image.height = 768;
    const ctx = image.getContext("2d")!;
    ctx.drawImage(source.background, 0, 0, 1344, 768);
    const sx = 1344 / source.background.width, sy = 768 / source.background.height;
    const h = bounds.height * sy, w = Math.min(bounds.width * sx, h * .96);
    const x = (bounds.x + bounds.width / 2) * sx - w / 2, y = bounds.y * sy;
    ctx.fillStyle = "#808080"; ctx.fillRect(x, y, w, h);
    const rect = { x: x - 5, y: y - 5, width: w + 10, height: h + 10 };
    const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]]
      .map(([px, py]) => feed.sphericalPoint(px / sx, py / sy));
    const png = await new Promise<Blob>((resolve, reject) => image.toBlob(b => b ? resolve(b) : reject(new Error("Reference capture failed")), "image/png"));
    signal.throwIfAborted();
    let token: string | undefined;
    reactor = new Reactor({ modelName: H3_MODEL, jwt: async () => {
      if (token) return token;
      const response = await fetch("/api/reactor/h3-token", { signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.jwt) throw new Error(data.error || "H3 token unavailable");
      token = data.jwt; return token!;
    } });
    const session = reactor;
    return await new Promise<StaticVan>((resolve, reject) => {
      let done = false;
      const finish = (error?: Error, result?: StaticVan) => {
        if (done) return; done = true;
        clearTimeout(timer); signal.removeEventListener("abort", abort);
        if (result) { cached = result; resolve(result); } else reject(error);
      };
      const abort = () => finish(new Error("Van generation cancelled"));
      const timer = setTimeout(() => finish(new Error("H3 timed out. Try again.")), 180000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      session.on("error", e => finish(new Error(e.message)));
      const capture = () => {
        if (done) return;
        if (video.readyState >= 2 && video.videoWidth) {
          // Ignore empty transport frames; freeze the first decoded image with street content.
          const probe = document.createElement("canvas"); probe.width = 16; probe.height = 16;
          const pc = probe.getContext("2d")!; pc.drawImage(video, 0, 0, 16, 16);
          const pixels = pc.getImageData(0, 0, 16, 16).data;
          let light = 0; for (let i = 0; i < pixels.length; i += 4) light += pixels[i] + pixels[i + 1] + pixels[i + 2];
          if (light > 4000) {
            const still = document.createElement("canvas"); still.width = Math.ceil(rect.width); still.height = Math.ceil(rect.height);
            still.getContext("2d")!.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, still.width, still.height);
            finish(undefined, { image: still, corners }); return;
          }
        }
        callback = video.requestVideoFrameCallback(capture);
      };
      session.on("trackReceived", (_name, track) => {
        if (done || track.kind !== "video") return;
        video.srcObject = new MediaStream([track]);
        void video.play().catch(e => finish(e));
        callback = video.requestVideoFrameCallback(capture);
      });
      session.on("message", message => {
        if (done) return;
        const data = message.data as { clip?: { clip_id: string }; reason?: string };
        if (message.type === "clip_generated") {
          progress("Capturing static van…");
          void session.sendCommand("play", { clip_id: data.clip!.clip_id });
        }
        if (message.type === "clip_failed" || message.type === "command_error") finish(new Error(data.reason || message.type));
      });
      void (async () => {
        progress("Connecting to H3…"); await session.connect(); if (done) return;
        for (const [command, data, expected] of [
          ["set_canvas", { aspect: "16:9" }, "canvas_accepted"],
          ["set_autoplay", { enabled: false }, "autoplay_accepted"],
        ] as const) {
          const reply = await session.sendCommand(command, data); if (done) return;
          if (reply?.type !== expected) throw new Error(`H3 did not accept ${command}`);
        }
        const file = await session.uploadFile(png); if (done) return;
        progress("Generating static van…");
        const reply = await session.sendCommand("enqueue", { prompt: H3_PROMPT, reference_image: file, seconds: 5, seed: H3_SEED });
        if (!done && reply?.type !== "clip_queued") throw new Error("H3 did not queue the van");
      })().catch(e => finish(e));
    });
  } finally {
    if (callback) video.cancelVideoFrameCallback(callback);
    video.pause(); video.srcObject = null;
    feed.dispose();
    void reactor?.disconnect().catch(() => {});
  }
}
