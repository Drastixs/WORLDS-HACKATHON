"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PANORAMA_URL = "/bastille-court-photosphere.jpg";
const FULL_PANORAMA_HEIGHT = 4608;
const CROPPED_PANORAMA_HEIGHT = 4140;
const MAX_PITCH = (52 * Math.PI) / 180;

type ExperienceStatus = "idle" | "loading" | "ready" | "error";

type ViewState = {
  dragYaw: number;
  dragPitch: number;
  sensorYaw: number;
  sensorPitch: number;
};

type OrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create panorama shader.");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unable to compile panorama shader.";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function angleDelta(current: number, origin: number) {
  return ((current - origin + 540) % 360) - 180;
}

function PanoramaCanvas({
  active,
  onError,
  onReady,
  orientationEnabled,
}: {
  active: boolean;
  onError: () => void;
  onReady: () => void;
  orientationEnabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<ViewState>({ dragYaw: 0, dragPitch: 0, sensorYaw: 0, sensorPitch: 0 });

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      onError();
      return;
    }

    let frame = 0;
    let disposed = false;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    let sensorOrigin: { alpha: number; beta: number } | null = null;

    const vertexSource = `
      attribute vec2 a_position;
      varying vec2 v_position;

      void main() {
        v_position = a_position;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision highp float;

      varying vec2 v_position;
      uniform sampler2D u_panorama;
      uniform float u_aspect;
      uniform float u_yaw;
      uniform float u_pitch;

      const float PI = 3.141592653589793;

      void main() {
        float tangent = tan(67.0 * PI / 360.0);
        vec3 forward = vec3(
          sin(u_yaw) * cos(u_pitch),
          sin(u_pitch),
          -cos(u_yaw) * cos(u_pitch)
        );
        vec3 right = vec3(cos(u_yaw), 0.0, sin(u_yaw));
        vec3 up = cross(right, forward);
        vec3 ray = normalize(
          forward +
          right * v_position.x * u_aspect * tangent +
          up * v_position.y * tangent
        );

        float panoramaX = fract(atan(ray.x, -ray.z) / (2.0 * PI) + 0.5);
        float fullPanoramaY = 0.5 - asin(clamp(ray.y, -1.0, 1.0)) / PI;
        float croppedPanoramaY = clamp(
          fullPanoramaY * ${FULL_PANORAMA_HEIGHT.toFixed(1)} / ${CROPPED_PANORAMA_HEIGHT.toFixed(1)},
          0.001,
          0.999
        );

        gl_FragColor = texture2D(u_panorama, vec2(panoramaX, croppedPanoramaY));
      }
    `;

    let program: WebGLProgram;
    let vertexShader: WebGLShader;
    let fragmentShader: WebGLShader;

    try {
      vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
      fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      const nextProgram = gl.createProgram();
      if (!nextProgram) throw new Error("Unable to create panorama renderer.");
      program = nextProgram;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link panorama renderer.");
      }
    } catch {
      onError();
      return;
    }

    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const aspectLocation = gl.getUniformLocation(program, "u_aspect");
    const yawLocation = gl.getUniformLocation(program, "u_yaw");
    const pitchLocation = gl.getUniformLocation(program, "u_pitch");

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const render = () => {
      resize();
      const yaw = view.current.dragYaw + view.current.sensorYaw;
      const pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, view.current.dragPitch + view.current.sensorPitch),
      );
      gl.uniform1f(aspectLocation, canvas.width / canvas.height);
      gl.uniform1f(yawLocation, yaw);
      gl.uniform1f(pitchLocation, pitch);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = window.requestAnimationFrame(render);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      view.current.dragYaw -= (event.clientX - previousX) * 0.004;
      view.current.dragPitch += (event.clientY - previousY) * 0.004;
      view.current.dragPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, view.current.dragPitch));
      previousX = event.clientX;
      previousY = event.clientY;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null || event.beta === null) return;
      sensorOrigin ??= { alpha: event.alpha, beta: event.beta };
      view.current.sensorYaw = (-angleDelta(event.alpha, sensorOrigin.alpha) * Math.PI) / 180;
      view.current.sensorPitch = ((sensorOrigin.beta - event.beta) * Math.PI) / 180;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    if (orientationEnabled) window.addEventListener("deviceorientation", onOrientation, true);

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;

      const maximumTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      let source: TexImageSource = image;
      if (image.width > maximumTextureSize) {
        const scale = maximumTextureSize / image.width;
        const resized = document.createElement("canvas");
        resized.width = maximumTextureSize;
        resized.height = Math.round(image.height * scale);
        const context = resized.getContext("2d");
        if (!context) {
          onError();
          return;
        }
        context.drawImage(image, 0, 0, resized.width, resized.height);
        source = resized;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      onReady();
      render();
    };
    image.onerror = onError;
    image.src = PANORAMA_URL;

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("deviceorientation", onOrientation, true);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [active, onError, onReady, orientationEnabled]);

  return (
    <canvas
      ref={canvasRef}
      className="panorama"
      aria-label="Interactive photosphere at Bastille Court"
    />
  );
}

export function PhotosphereExperience() {
  const [entered, setEntered] = useState(false);
  const [orientationEnabled, setOrientationEnabled] = useState(false);
  const [status, setStatus] = useState<ExperienceStatus>("idle");
  const [hintVisible, setHintVisible] = useState(true);

  const handleReady = useCallback(() => setStatus("ready"), []);
  const handleError = useCallback(() => setStatus("error"), []);

  const enterExperience = async () => {
    setEntered(true);
    setStatus("loading");

    if (document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }

    if (typeof DeviceOrientationEvent !== "undefined") {
      const orientation = DeviceOrientationEvent as OrientationWithPermission;
      try {
        const permission = orientation.requestPermission
          ? await orientation.requestPermission()
          : "granted";
        setOrientationEnabled(permission === "granted");
      } catch {
        setOrientationEnabled(false);
      }
    }
  };

  const tryAgain = () => {
    setStatus("loading");
    setEntered(false);
    window.requestAnimationFrame(() => setEntered(true));
  };

  return (
    <main className={entered ? "experience experience--entered" : "experience"}>
      <PanoramaCanvas
        active={entered}
        onError={handleError}
        onReady={handleReady}
        orientationEnabled={orientationEnabled}
      />

      {!entered ? (
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="welcome__topline">
            <span className="location-dot" aria-hidden="true" />
            London · 51.5067° N
          </div>

          <div className="welcome__content">
            <p className="eyebrow">Bastille Court</p>
            <h1 id="welcome-title">Stand where it happened.</h1>
            <p className="welcome__intro">
              Step onto Paris Garden. Turn your phone to look around the street.
            </p>
          </div>

          <div className="welcome__action">
            <button className="enter-button" type="button" onClick={enterExperience}>
              <span>Look around</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <p>Best experienced standing up with your phone upright.</p>
          </div>
        </section>
      ) : null}

      {entered && status === "loading" ? (
        <div className="loading-state" role="status">
          <span className="loading-state__line" />
          <span className="loading-state__line loading-state__line--short" />
          <span className="sr-only">Loading the photosphere</span>
        </div>
      ) : null}

      {entered && status === "ready" ? (
        <>
          <div className="place-label">
            <span className="location-dot" aria-hidden="true" />
            <span>
              <strong>Bastille Court</strong>
              <small>Paris Garden, London</small>
            </span>
          </div>

          {hintVisible ? (
            <button className="motion-hint" type="button" onClick={() => setHintVisible(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="7" y="3" width="10" height="18" rx="2" />
                <path d="M4.5 8.5a8 8 0 0 0 0 7M19.5 8.5a8 8 0 0 1 0 7" />
              </svg>
              <span>
                <strong>Turn to look around</strong>
                <small>You can also drag the view</small>
              </span>
              <span className="motion-hint__close" aria-label="Dismiss hint">×</span>
            </button>
          ) : null}
        </>
      ) : null}

      {entered && status === "error" ? (
        <section className="error-state" role="alert">
          <p className="eyebrow">View unavailable</p>
          <h2>The photosphere didn’t load.</h2>
          <p>This browser needs WebGL to open the panorama. You can try loading it again.</p>
          <button type="button" onClick={tryAgain}>Try again</button>
        </section>
      ) : null}
    </main>
  );
}
