"use client";
import { useEffect, useRef, useState } from "react";
import type { Viewer } from "@photo-sphere-viewer/core";
import type { SpriteClip } from "../../lib/witness/h3-sprite";
import { projectSceneObject } from "../../lib/witness/scene-projection";
import { projectOcclusionMask, occlusionMasksForObject } from "../../lib/witness/occlusion";
import type { SceneObject } from "../../lib/witness/scene";
import type { SceneExport } from "../../lib/witness/scene";

export function MovingSprite({ viewer, scene, loopTimeMs, durationMs, visible, debug, onDebugChange, objectId, label, cachedClip, generateClip, controls = true, frozen = false }: {
  objectId: string; label: string; cachedClip: () => SpriteClip | undefined;
  generateClip: (signal: AbortSignal, progress: (text: string) => void, context?: { viewer: Viewer; scene: SceneExport; object: SceneObject }) => Promise<SpriteClip>;
  controls?: boolean; frozen?: boolean;
  viewer: Viewer | null; scene: SceneExport; loopTimeMs: number; durationMs: number; visible: boolean; debug: boolean; onDebugChange: (value: boolean) => void;
}) {
  const [clip, setClip] = useState<SpriteClip | undefined>(cachedClip);
  const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null); const request = useRef<AbortController | null>(null);
  const current = useRef({ scene, loopTimeMs, durationMs, frozen }); current.current = { scene, loopTimeMs, durationMs, frozen };
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (!visible || !controls) request.current?.abort(); }, [visible, controls]);
  async function start() {
    if (busy || clip) return; const controller = new AbortController(); request.current = controller; setBusy(true);
    try { const object = current.current.scene.objects.find(o => o.id === objectId);
      if (!viewer || !object) throw new Error("Scene object is not ready");
      const result = await generateClip(controller.signal, setStatus, { viewer, scene: current.current.scene, object }); if (!controller.signal.aborted) setClip(result); }
    catch (e) { if (!controller.signal.aborted) setStatus(e instanceof Error ? e.message : String(e)); }
    finally { if (request.current === controller) setBusy(false); }
  }
  useEffect(() => {
    if (!viewer || !visible || !clip) return;
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const c = canvas.current; if (!c) return;
      const { width, height } = viewer.getSize(); const dpr = Math.min(devicePixelRatio, 2);
      if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) { c.width = Math.round(width * dpr); c.height = Math.round(height * dpr); }
      const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const { scene, loopTimeMs, durationMs, frozen } = current.current;
      const person = scene.objects.find(o => o.id === objectId); if (!person) return;
      const projection = projectSceneObject(viewer, person); if (!projection) return;
      const image = clip.frames[frozen ? clip.frames.length - 1 : Math.floor((loopTimeMs % durationMs) / durationMs * clip.frames.length)];
      const b = projection.bounds, s = clip.bounds;
      ctx.drawImage(image, s.x, s.y, s.width, s.height, b.x, b.y, b.width, b.height);
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      for (const mask of occlusionMasksForObject(scene.occlusionMasks, person.id)) {
        const projected = projectOcclusionMask(viewer, mask); if (!projected) continue;
        ctx.beginPath(); projected.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [viewer, visible, clip, objectId]);
  if (!visible) return null;
  return <>
    <canvas ref={canvas} className="x2-overlay" aria-hidden="true" />
    {controls && <aside className="witness-controls" aria-label={`${label} controls`}>
      <div className="witness-controls__status" role="status"><span>Status</span><strong>{clip ? `${label} ready` : busy ? status : "Not started"}</strong></div>
      {!clip && !busy && <button className="witness-controls__primary" onClick={() => void start()}>Generate {label}</button>}
      {busy && <button className="witness-controls__primary" onClick={() => request.current?.abort()}>Cancel</button>}
      {!busy && !clip && status && <p className="witness-controls__error" role="alert">{status}</p>}
      <button className="witness-controls__debug" aria-pressed={debug} onClick={() => onDebugChange(!debug)}><span>Debug</span><span className="witness-controls__switch" aria-hidden="true" /></button>
    </aside>}
  </>;
}
