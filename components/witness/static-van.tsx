"use client";
import { useEffect, useRef, useState } from "react";
import type { Viewer } from "@photo-sphere-viewer/core";
import { cachedStaticVan, generateStaticVan, type StaticVan } from "../../lib/witness/h3-static";

export function StaticVanLayer({ viewer, visible, debug, onDebugChange, controls = true }: {
  viewer: Viewer | null; controls?: boolean; visible: boolean; debug: boolean; onDebugChange: (value: boolean) => void;
}) {
  const [still, setStill] = useState<StaticVan | undefined>(cachedStaticVan);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!visible || !controls) controller.current?.abort(); }, [visible, controls]);
  async function start() {
    if (busy || still) return;
    const request = new AbortController(); controller.current = request; setBusy(true);
    try {
      const result = await generateStaticVan(request.signal, setStatus);
      if (!request.signal.aborted) { setStill(result); setStatus("Static van ready"); }
    } catch (error) {
      if (!request.signal.aborted) setStatus(error instanceof Error ? error.message : String(error));
    } finally { if (controller.current === request) setBusy(false); }
  }
  useEffect(() => {
    if (!viewer || !still || !visible) return;
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const c = canvas.current; if (!c) return;
      const { width, height } = viewer.getSize();
      const dpr = Math.min(devicePixelRatio, 2);
      if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) { c.width = Math.round(width * dpr); c.height = Math.round(height * dpr); }
      const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const pose = viewer.getPosition();
      if (still.corners.some(p => Math.sin(p.pitch) * Math.sin(pose.pitch) + Math.cos(p.pitch) * Math.cos(pose.pitch) * Math.cos(p.yaw - pose.yaw) < .15)) return;
      const p = still.corners.map(point => viewer.dataHelper.sphericalCoordsToViewerCoords(point));
      const w = still.image.width, h = still.image.height;
      for (const second of [false, true]) {
        const ids = second ? [2, 3, 1] : [0, 1, 3];
        ctx.save(); ctx.beginPath(); ids.forEach((id, i) => i ? ctx.lineTo(p[id].x, p[id].y) : ctx.moveTo(p[id].x, p[id].y)); ctx.closePath(); ctx.clip();
        const origin = second ? { x: p[1].x + p[3].x - p[2].x, y: p[1].y + p[3].y - p[2].y } : p[0];
        const a = second ? { x: p[2].x - p[3].x, y: p[2].y - p[3].y } : { x: p[1].x - p[0].x, y: p[1].y - p[0].y };
        const b = second ? { x: p[2].x - p[1].x, y: p[2].y - p[1].y } : { x: p[3].x - p[0].x, y: p[3].y - p[0].y };
        ctx.transform(a.x / w, a.y / w, b.x / h, b.y / h, origin.x, origin.y); ctx.drawImage(still.image, 0, 0); ctx.restore();
      }
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [viewer, still, visible]);
  if (!visible) return null;
  return <>
    <canvas ref={canvas} className="x2-overlay" aria-hidden="true" />
    {controls && <aside className="witness-controls" aria-label="Static van controls">
      <div className="witness-controls__status" role="status"><span>Status</span><strong>{still ? "Static van ready" : busy ? status : "Not started"}</strong></div>
      {!still && !busy && <button className="witness-controls__primary" onClick={() => void start()}>Generate static van</button>}
      {busy && <button className="witness-controls__primary" onClick={() => controller.current?.abort()}>Cancel</button>}
      {!busy && !still && status && <p role="alert" className="witness-controls__error">{status}</p>}
      <button className="witness-controls__debug" aria-pressed={debug} onClick={() => onDebugChange(!debug)}><span>Debug</span><span className="witness-controls__switch" aria-hidden="true" /></button>
    </aside>}
  </>;
}
