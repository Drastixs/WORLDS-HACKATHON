"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const BASTILLE_COURT = { lat: 51.5067, lng: -0.1064 };

type MapsLatLng = {
  lat: () => number;
  lng: () => number;
};

type PanoramaData = {
  location?: {
    latLng?: MapsLatLng;
    pano?: string;
  };
};

type Panorama = {
  setPano: (pano: string) => void;
  setPov: (pov: { heading: number; pitch: number }) => void;
  setVisible: (visible: boolean) => void;
};

type MapsApi = {
  maps: {
    ControlPosition: { RIGHT_BOTTOM: number };
    StreetViewPanorama: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => Panorama;
    StreetViewService: new () => {
      getPanorama: (
        request: Record<string, unknown>,
        callback: (data: PanoramaData | null, status: string) => void,
      ) => void;
    };
    StreetViewSource: { GOOGLE: string };
    StreetViewStatus: { OK: string };
  };
};

declare global {
  interface Window {
    google?: MapsApi;
  }
}

function bearingToTarget(origin: MapsLatLng) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const fromLat = radians(origin.lat());
  const toLat = radians(BASTILLE_COURT.lat);
  const longitudeDelta = radians(BASTILLE_COURT.lng - origin.lng());

  const y = Math.sin(longitudeDelta) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(longitudeDelta);

  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function StreetViewExperience() {
  const panoramaElement = useRef<HTMLDivElement>(null);
  const panorama = useRef<Panorama | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [hintVisible, setHintVisible] = useState(true);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const initialisePanorama = useCallback(() => {
    if (!entered || panorama.current || !panoramaElement.current || !window.google) return;

    setStatus("loading");
    const { maps } = window.google;

    panorama.current = new maps.StreetViewPanorama(panoramaElement.current, {
      addressControl: false,
      clickToGo: false,
      disableDefaultUI: true,
      fullscreenControl: false,
      linksControl: false,
      motionTracking: true,
      motionTrackingControl: true,
      motionTrackingControlOptions: {
        position: maps.ControlPosition.RIGHT_BOTTOM,
      },
      panControl: false,
      scrollwheel: false,
      showRoadLabels: false,
      visible: false,
      zoom: 1,
      zoomControl: false,
    });

    const service = new maps.StreetViewService();
    service.getPanorama(
      {
        location: BASTILLE_COURT,
        preference: "nearest",
        radius: 100,
        source: maps.StreetViewSource.GOOGLE,
      },
      (data, serviceStatus) => {
        const location = data?.location;
        if (
          serviceStatus !== maps.StreetViewStatus.OK ||
          !location?.pano ||
          !location.latLng ||
          !panorama.current
        ) {
          panorama.current = null;
          setStatus("error");
          return;
        }

        panorama.current.setPano(location.pano);
        panorama.current.setPov({
          heading: bearingToTarget(location.latLng),
          pitch: 2,
        });
        panorama.current.setVisible(true);
        setStatus("ready");
      },
    );
  }, [entered]);

  useEffect(() => {
    if (mapsReady) initialisePanorama();
  }, [initialisePanorama, mapsReady]);

  const enterExperience = () => {
    setEntered(true);
    setStatus(apiKey ? "loading" : "error");

    if (document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  const tryAgain = () => {
    panorama.current = null;
    setStatus("loading");
    initialisePanorama();
  };

  return (
    <main className={entered ? "experience experience--entered" : "experience"}>
      {apiKey ? (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&loading=async`}
          strategy="afterInteractive"
          onLoad={() => setMapsReady(true)}
          onError={() => setStatus("error")}
        />
      ) : null}

      <div ref={panoramaElement} className="panorama" aria-label="Street View at Bastille Court" />

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
          <span className="sr-only">Loading Street View</span>
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
          <h2>{apiKey ? "Street View didn’t load." : "Add your Google Maps API key."}</h2>
          <p>
            {apiKey
              ? "Check your connection and confirm that Maps JavaScript API is enabled."
              : "Copy .env.example to .env.local, then restart the development server."}
          </p>
          {apiKey ? (
            <button type="button" onClick={tryAgain}>Try again</button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
