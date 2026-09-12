"use client";

import { useEffect, useRef, useState } from "react";
import { Reactor } from "@reactor-team/js-sdk";
import { WITNESS_DEMO_SCRIPT } from "../../lib/witness/demo-script";
import { H3_MODEL, H3_PROMPT, H3_SEED } from "../../lib/witness/h3-test";
import type { ModelFeed } from "../../lib/witness/model-feed";
import styles from "./test.module.css";

type Reference = { image: HTMLCanvasElement; background: HTMLCanvasElement; mask: HTMLCanvasElement };
function canvas(source?: CanvasImageSource) {
  const c = document.createElement("canvas"); c.width = 1344; c.height = 768;
  if (source) c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return c;
}
function blob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error("Image capture failed")), "image/png"));
}

export default function H3Test() {
  const [status, setStatus] = useState("Preparing reference…");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [clip, setClip] = useState("");
  const [still, setStill] = useState("");
  const [overlay, setOverlay] = useState("");
  const [prompt, setPrompt] = useState(H3_PROMPT);
  const reference = useRef<Reference | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const replay = useRef<HTMLVideoElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const urls = useRef<string[]>([]);
  const mounted = useRef(true);
  const makeUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.current.push(u); return u; };

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let feed: ModelFeed | undefined;
    void (async () => {
      const { createModelFeed } = await import("../../lib/witness/model-feed");
      feed = await createModelFeed(WITNESS_DEMO_SCRIPT.scene.panorama.asset, { yaw: 2.01, pitch: -0.08, zoom: 65 });
      if (disposed) { feed.dispose(); return; }
      const scene = { ...WITNESS_DEMO_SCRIPT.scene, objects: WITNESS_DEMO_SCRIPT.scene.objects.slice(0, 1), occlusionMasks: [] };
      feed.setSceneFrame({ scene, sceneRevision: "h3-static-test", stepId: "h3-van", animationTimeMs: 0 });
      const deadline = Date.now() + 10000;
      while (feed.inspection().frame?.metadata.sceneRevision !== "h3-static-test") {
        if (disposed) return;
        if (Date.now() > deadline) throw new Error("Reference renderer timed out");
        await new Promise(r => setTimeout(r, 50));
      }
      const inspection = feed.inspection();
      const background = canvas(inspection.background);
      const image = canvas(background);
      const mask = canvas();
      // A front-facing rectangular guide avoids the production feed's side-profile silhouette.
      const bounds = inspection.frame!.objects[0]?.bounds;
      if (!bounds) throw new Error("Van is outside the reference camera");
      const sx = 1344 / inspection.background.width, sy = 768 / inspection.background.height;
      const h = bounds.height * sy, w = Math.min(bounds.width * sx, h * 0.96);
      const x = (bounds.x + bounds.width / 2) * sx - w / 2, y = bounds.y * sy;
      const ctx = image.getContext("2d")!;
      ctx.fillStyle = "#808080"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#bcbcbc"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      const mc = mask.getContext("2d")!;
      mc.fillStyle = "white"; mc.fillRect(x - 5, y - 5, w + 10, h + 10);
      reference.current = { image, background, mask };
      if (!disposed) { setReferenceUrl(image.toDataURL()); setStatus("Ready · one reference image · seed 42 · five-second clip"); }
      feed.dispose(); feed = undefined;
    })().catch(e => { if (!disposed) setStatus(e instanceof Error ? e.message : String(e)); feed?.dispose(); });
    return () => { disposed = true; mounted.current = false; feed?.dispose(); cleanup.current?.(); urls.current.forEach(URL.revokeObjectURL); };
  }, []);

  function capture(video: HTMLVideoElement | null) {
    const ref = reference.current;
    if (!video || video.readyState < 2 || !ref) return false;
    const raw = canvas(video);
    const layer = canvas(raw);
    const lc = layer.getContext("2d")!;
    lc.globalCompositeOperation = "destination-in"; lc.drawImage(ref.mask, 0, 0);
    const composed = canvas(ref.background); composed.getContext("2d")!.drawImage(layer, 0, 0);
    setStill(raw.toDataURL()); setOverlay(composed.toDataURL());
    return true;
  }

  async function generate() {
    if (!reference.current || busy) return;
    setBusy(true); setClip(""); setStill(""); setOverlay("");
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    let ended = false;
    let recorder: MediaRecorder | undefined;
    let output: MediaStream | undefined;
    let playing = false;
    let starting = false;
    let readyClip = "";
    let generated = false;
    const chunks: Blob[] = [];
    let token: string | undefined;
    const reactor = new Reactor({ modelName: H3_MODEL, jwt: async () => {
      if (token) return token;
      const response = await fetch("/api/reactor/h3-token", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.jwt) throw new Error(body.error || "Token unavailable");
      token = body.jwt;
      return token!;
    } });
    const finish = (message?: string) => {
      if (ended) return; ended = true; clearTimeout(timeout);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      void reactor.disconnect().catch(() => {});
      if (mounted.current) { setBusy(false); if (message) setStatus(message); }
    };
    const timeout = setTimeout(() => finish("H3 timed out after three minutes. Session closed; retry when ready."), 180000);
    cleanup.current = () => finish("Cancelled. Session closed.");
    const play = async () => {
      if (ended || !generated || !readyClip || !output || starting) return;
      starting = true;
      try {
        const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
        recorder = new MediaRecorder(output, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = () => { if (mounted.current && chunks.length) setClip(makeUrl(new Blob(chunks, { type: recorder!.mimeType }))); };
        recorder.start(200);
        playing = true;
        setStatus("Playing and recording the generated clip…");
        await reactor.sendCommand("play", { clip_id: readyClip });
      } catch (e) { finish(e instanceof Error ? e.message : String(e)); }
    };
    reactor.on("error", e => finish(`H3: ${e.message}`));
    reactor.on("trackReceived", (_name, track) => {
      if (ended || track.kind !== "video") return;
      output = new MediaStream([track]);
      if (live.current) { live.current.srcObject = output; void live.current.play().catch(() => {}); }
      void play();
    });
    reactor.on("message", message => {
      if (ended) return;
      const data = message.data as { clip_id?: string; clip?: { clip_id?: string }; reason?: string } | undefined;
      if (message.type === "clip_generated") {
        generated = true;
        readyClip = data?.clip_id || data?.clip?.clip_id || readyClip;
        setStatus("Clip generated. Waiting for video track…"); void play();
      }
      if (message.type === "clip_failed" || message.type === "command_error") finish(data?.reason || message.type);
      if (message.type === "clip_finished" && playing) {
        // Allow the last transmitted frames to reach the browser decoder before closing.
        setTimeout(() => {
          if (ended) return;
          const captured = capture(live.current);
          finish(captured ? "Complete. Session closed. Replay locally or capture another frame." : "Clip ended. Use local replay to capture a frame.");
        }, 500);
      }
    });
    try {
      setStatus("Connecting to H3…"); await reactor.connect(); if (ended) return;
      if (reactor.getStatus() !== "ready") throw new Error("H3 connection did not become ready");
      for (const [command, data, expected] of [
        ["set_canvas", { aspect: "16:9" }, "canvas_accepted"],
        ["set_autoplay", { enabled: false }, "autoplay_accepted"],
        ["set_flush_on_clip_end", { enabled: false }, "flush_accepted"],
      ] as const) {
        const reply = await reactor.sendCommand(command, data);
        if (ended) return;
        if (reply?.type !== expected) throw new Error(`H3 did not accept ${command}`);
      }
      setStatus("Uploading one reference image…");
      const file = await reactor.uploadFile(await blob(reference.current.image)); if (ended) return;
      setStatus("Generating five seconds from one image…");
      const reply = await reactor.sendCommand("enqueue", { prompt, reference_image: file, seconds: 5, seed: H3_SEED, metadata: "witness-single-van-capability-test" });
      if (ended) return;
      if (reply?.type !== "clip_queued") throw new Error("H3 did not confirm the clip was queued");
      const data = reply.data as { clip_id?: string; clip?: { clip_id?: string } };
      readyClip = data.clip_id || data.clip?.clip_id || readyClip;
    } catch (e) { finish(e instanceof Error ? e.message : String(e)); }
  }

  return <main className={styles.page}>
    <a href="/">← Back to scene</a><h1>H3 · Single van test</h1>
    <p>One reference image. One stationary van. Inspect the full result before judging the masked overlay.</p>
    <p role="status" aria-live="polite">{status}</p>
    <div className={styles.actions}>
      <button disabled={!referenceUrl || busy} onClick={() => void generate()}>Generate one clip</button>
      {busy && <button onClick={() => cleanup.current?.()}>Cancel</button>}
      {clip && <button onClick={() => capture(replay.current)}>Capture replay frame</button>}
      {still && <a href={still} download="h3-van-frame.png">Download frame</a>}
      {clip && <a href={clip} download="h3-van-test.webm">Download clip</a>}
    </div>
    <div className={styles.grid}>
      <section><h2>Reference sent to H3</h2>{referenceUrl && <img src={referenceUrl} alt="Street with a single grey front-facing van guide" />}</section>
      <section><h2>{clip ? "Recorded output · local replay" : "Live H3 output"}</h2>
        <video ref={live} muted playsInline autoPlay hidden={!!clip} />
        {clip && <video ref={replay} src={clip} muted playsInline controls />}
      </section>
      {still && <section><h2>Selected raw frame</h2><img src={still} alt="Full unmasked H3 frame" /></section>}
      {overlay && <section><h2>Masked overlay · guide + 5px</h2><img src={overlay} alt="H3 inside the guide region over the original street" /></section>}
    </div>
    <details><summary>Exact prompt (editable before generation)</summary><textarea aria-label="H3 prompt" value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} /></details>
    <p>H3 makes reference-to-video clips; exact placement is being tested. Replay stays in this browser tab. Server caching and movement come later.</p>
  </main>;
}
