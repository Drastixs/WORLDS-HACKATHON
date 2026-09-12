"use client";

import { events, Viewer } from "@photo-sphere-viewer/core";
import { GyroscopePlugin } from "@photo-sphere-viewer/gyroscope-plugin";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ScenePlaybackControls } from "../components/witness/scene-playback-controls";
import { ModelFeedInspector } from "../components/witness/model-feed-inspector";
import { WitnessControls } from "../components/witness/witness-controls";
import { MovingPerson } from "../components/witness/moving-person";
import { StaticVanLayer } from "../components/witness/static-van";
import { X2Overlay } from "../components/witness/x2-overlay";
import { witnessLoopCache } from "../components/witness/loop-cache";
import { WITNESS_DEMO_SCRIPT } from "../lib/witness/demo-script";
import { currentPose, type ViewPose } from "../lib/witness/geometry";
import { occlusionMasksForObject } from "../lib/witness/occlusion";
import { useScenePlayback } from "../lib/witness/use-scene-playback";
import { useWitnessX2, WitnessX2Provider } from "../lib/witness/x2";
import { SceneDebugOverlay } from "./scene-debug-overlay";

const PANORAMA_URL = "/bastille-court-photosphere.jpg";

type ExperienceStatus = "idle" | "loading" | "ready" | "error";

function PanoramaViewer({
  active,
  onError,
  onReady,
  poseRef,
  viewerRef,
}: {
  active: boolean;
  onError: () => void;
  onReady: () => void;
  poseRef?: MutableRefObject<ViewPose>;
  viewerRef?: MutableRefObject<Viewer | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const viewer = new Viewer({
      container: containerRef.current,
      panorama: PANORAMA_URL,
      navbar: false,
      keyboard: "fullscreen",
      mousemove: true,
      mousewheel: false,
      moveInertia: 0.65,
      defaultZoomLvl: 45,
      rendererParameters: {
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
      },
      plugins: [
        [
          GyroscopePlugin,
          {
            absolutePosition: false,
            moveMode: "fast",
            roll: true,
            touchmove: true,
          },
        ],
      ],
    });
    if (viewerRef) viewerRef.current = viewer;

    const handleReady = () => {
      if (poseRef) poseRef.current = currentPose(viewer);
      onReady();
      const gyroscope = viewer.getPlugin<GyroscopePlugin>(GyroscopePlugin);
      void gyroscope.start("fast").catch(() => undefined);
    };
    const handleError = () => onError();
    const handleRender = () => {
      if (!poseRef) return;
      poseRef.current = currentPose(viewer);
    };

    viewer.addEventListener(events.ReadyEvent.type, handleReady, { once: true });
    viewer.addEventListener(events.PanoramaErrorEvent.type, handleError);
    viewer.addEventListener(events.RenderEvent.type, handleRender);

    return () => {
      viewer.removeEventListener(events.ReadyEvent.type, handleReady);
      viewer.removeEventListener(events.PanoramaErrorEvent.type, handleError);
      viewer.removeEventListener(events.RenderEvent.type, handleRender);
      if (viewerRef) viewerRef.current = null;
      viewer.destroy();
    };
  }, [active, onError, onReady, poseRef, viewerRef]);

  return (
    <div
      ref={containerRef}
      className="panorama"
      aria-label="Interactive photosphere at Bastille Court"
    />
  );
}

function PhotosphereExperienceContent() {
  const [entered, setEntered] = useState(false);
  const [status, setStatus] = useState<ExperienceStatus>("idle");
  const [hintVisible, setHintVisible] = useState(true);
  const [debugVisible, setDebugVisible] = useState(false);
  const poseRef = useRef<ViewPose>({ yaw: 0, pitch: 0, zoom: 45 });
  const viewerRef = useRef<Viewer | null>(null);
  const syncedVariantRef = useRef<"white" | "navy" | null>(null);
  const playback = useScenePlayback(WITNESS_DEMO_SCRIPT);
  const x2 = useWitnessX2();
  const sceneRevision = [
    `schema-${playback.scene.schemaVersion}`,
    playback.scene.panorama.calibration?.revision ?? "uncalibrated",
    playback.step.id,
    `revision-${playback.revision}`,
  ].join(":");

  useEffect(() => {
    x2.setSceneFrame({
      scene: playback.scene,
      sceneRevision,
      stepId: playback.step.id,
      animationTimeMs: playback.loopTimeMs,
    });
  }, [playback.loopTimeMs, playback.scene, playback.step.id, sceneRevision, x2.setSceneFrame]);

  useEffect(() => {
    if (status === "ready") void x2.prepareFeed();
  }, [status, x2.prepareFeed]);

  useEffect(() => {
    const variant = playback.corrected ? "navy" : "white";
    if (syncedVariantRef.current === variant) return;
    syncedVariantRef.current = variant;
    witnessLoopCache.invalidate((entry) => entry.variant !== variant);
    void x2.setVariant(variant);
  }, [playback.corrected, x2.setVariant]);

  const handleReady = useCallback(() => setStatus("ready"), []);
  const handleError = useCallback(() => {
    setDebugVisible(false);
    setStatus("error");
  }, []);

  const enterExperience = () => {
    setEntered(true);
    setStatus("loading");
    setDebugVisible(false);
    playback.restart();

    if (document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  const tryAgain = () => {
    setStatus("loading");
    setDebugVisible(false);
    playback.restart();
    setEntered(false);
    window.requestAnimationFrame(() => setEntered(true));
  };

  return (
    <main className={entered ? "experience experience--entered" : "experience"}>
      <PanoramaViewer
        active={entered}
        onError={handleError}
        onReady={handleReady}
        poseRef={poseRef}
        viewerRef={viewerRef}
      />
      {playback.scene.objects.map((object) => (
        <SceneDebugOverlay
          key={object.id}
          viewer={viewerRef.current}
          object={object}
          occlusionMasks={occlusionMasksForObject(playback.scene.occlusionMasks, object.id)}
          visible={status === "ready" && debugVisible}
        />
      ))}

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
            <a href="/measure" style={{ color: "inherit", fontSize: 14 }}>Measure street distances</a>
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
          <StaticVanLayer viewer={viewerRef.current} visible={playback.stepIndex <= 1} controls={playback.stepIndex === 0} debug={debugVisible} onDebugChange={setDebugVisible} />
          <MovingPerson viewer={viewerRef.current} scene={playback.scene} loopTimeMs={playback.loopTimeMs} visible={playback.stepIndex === 1} debug={debugVisible} onDebugChange={setDebugVisible} />
          {playback.stepIndex > 1 && <><X2Overlay poseRef={poseRef} sceneRevision={sceneRevision} />
          <WitnessControls
            debug={debugVisible}
            corrected={playback.corrected}
            onDebugChange={setDebugVisible}
          />
          </>}
          <ModelFeedInspector visible={debugVisible} />
          <ScenePlaybackControls
            stepIndex={playback.stepIndex}
            totalSteps={playback.totalSteps}
            label={playback.step.label}
            elapsedMs={playback.elapsedMs}
            durationMs={playback.step.durationMs}
            progress={playback.progress}
            isFinalStep={playback.isFinalStep}
            onNext={playback.next}
            onRestart={playback.restart}
          />

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

export function PhotosphereExperience() {
  return (
    <WitnessX2Provider>
      <PhotosphereExperienceContent />
    </WitnessX2Provider>
  );
}
