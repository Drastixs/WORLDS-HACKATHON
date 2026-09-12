"use client";

import type { Viewer } from "@photo-sphere-viewer/core";
import { useEffect, useId, useRef } from "react";
import { projectOcclusionMask, texturePointInPolygon } from "../lib/witness/occlusion";
import { CUBOID_EDGES, CUBOID_FACES, projectSceneObject } from "../lib/witness/scene-projection";
import type { OcclusionMask, SceneObject } from "../lib/witness/scene";

function points(values: { x: number; y: number }[]) {
  return values.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function SceneDebugOverlay({
  object,
  occlusionMasks = [],
  viewer,
  visible,
}: {
  object: SceneObject;
  occlusionMasks?: OcclusionMask[];
  viewer: Viewer | null;
  visible: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const maskId = `scene-occlusion-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const objectRef = useRef(object);
  const occlusionMasksRef = useRef(occlusionMasks);
  const lineRef = useRef<SVGPathElement>(null);
  const faceRefs = useRef<(SVGPolygonElement | null)[]>([]);
  const occluderRefs = useRef<(SVGPolygonElement | null)[]>([]);
  const maskBackgroundRef = useRef<SVGRectElement>(null);
  const labelRef = useRef<SVGGElement>(null);

  useEffect(() => {
    objectRef.current = object;
  }, [object]);

  useEffect(() => {
    occlusionMasksRef.current = occlusionMasks;
  }, [occlusionMasks]);

  useEffect(() => {
    if (!viewer || !svgRef.current || !lineRef.current) return;

    let frame = 0;
    const draw = () => {
      const svg = svgRef.current;
      const line = lineRef.current;
      if (!svg || !line) return;
      const { width, height } = viewer.getSize();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      maskBackgroundRef.current?.setAttribute("width", String(width));
      maskBackgroundRef.current?.setAttribute("height", String(height));
      occlusionMasksRef.current.forEach((mask, index) => {
        const element = occluderRefs.current[index];
        if (!element) return;
        const projectedMask = projectOcclusionMask(viewer, mask);
        element.style.display = projectedMask ? "block" : "none";
        if (projectedMask) element.setAttribute("points", points(projectedMask.points));
      });
      const objectIsOccluded = occlusionMasksRef.current.some((mask) =>
        texturePointInPolygon(objectRef.current.anchor, mask.texturePolygon),
      );
      if (labelRef.current) labelRef.current.style.display = objectIsOccluded ? "none" : "block";
      const projection = visible ? projectSceneObject(viewer, objectRef.current) : null;
      svg.style.display = projection ? "block" : "none";
      if (!projection) {
        frame = window.requestAnimationFrame(draw);
        return;
      }

      line.setAttribute(
        "d",
        CUBOID_EDGES.map(([a, b]) => {
          const start = projection.vertices[a];
          const end = projection.vertices[b];
          return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
        }).join(" "),
      );
      CUBOID_FACES.forEach((face, index) => {
        faceRefs.current[index]?.setAttribute("points", points(face.map((vertex) => projection.vertices[vertex])));
      });
      labelRef.current?.setAttribute(
        "transform",
        `translate(${projection.bounds.x.toFixed(1)} ${(projection.bounds.y - 14).toFixed(1)})`,
      );
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [viewer, visible]);

  return (
    <svg ref={svgRef} className="scene-debug" aria-hidden="true" style={{ display: "none" }}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect ref={maskBackgroundRef} x="0" y="0" fill="white" />
          {occlusionMasks.map((mask, index) => (
            <polygon
              key={mask.id}
              ref={(node) => { occluderRefs.current[index] = node; }}
              fill="black"
            />
          ))}
        </mask>
      </defs>
      <g mask={occlusionMasks.length ? `url(#${maskId})` : undefined}>
        <g className="scene-debug__volume">
          {CUBOID_FACES.map((_, index) => (
            <polygon key={index} ref={(node) => { faceRefs.current[index] = node; }} />
          ))}
          <path ref={lineRef} />
        </g>
        <g ref={labelRef} className="scene-debug__label">
          <rect x="0" y="-20" width="172" height="24" rx="5" />
          <text x="9" y="-4">{object.description} · approx.</text>
        </g>
      </g>
    </svg>
  );
}
