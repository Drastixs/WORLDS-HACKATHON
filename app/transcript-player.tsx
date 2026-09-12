"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Speaker = "operator" | "interviewer" | "witness";

type TranscriptLine = {
  at: number;
  duration: number;
  speaker: Speaker;
  text: string;
};

const FILM_DURATION = 120;

const transcript: TranscriptLine[] = [
  { at: 0.2, duration: 1.35, speaker: "operator", text: "999, what's your emergency?" },
  { at: 1.65, duration: 2.65, speaker: "witness", text: "I... I think someone's just been hit by a car." },
  { at: 4.4, duration: 1.15, speaker: "operator", text: "Are you with them now?" },
  { at: 5.65, duration: 4.05, speaker: "witness", text: "No. I'm at my window. On Paris Road. I didn't go over. I'm sorry." },
  { at: 9.85, duration: 1.15, speaker: "operator", text: "Did you see the vehicle?" },
  { at: 11.1, duration: 3.45, speaker: "witness", text: "Only for a second. I don't think I saw anything useful." },
  { at: 14.75, duration: 1.45, speaker: "operator", text: "Stay on the line for me." },
  { at: 17.25, duration: 1.6, speaker: "interviewer", text: "Thanks for coming in, Mrs Petru." },
  { at: 19.15, duration: 3.7, speaker: "witness", text: "I've been trying to remember it all night and it keeps changing." },
  { at: 23.45, duration: 2.1, speaker: "interviewer", text: "That's alright. That's what this is for." },
  { at: 30.15, duration: 2.25, speaker: "interviewer", text: "Start wherever you like. What was it like out?" },
  { at: 32.75, duration: 5.85, speaker: "witness", text: "Pouring. It had been raining all day. So grey the streetlights had come on early." },
  { at: 39.25, duration: 1.25, speaker: "interviewer", text: "And who was there?" },
  { at: 40.8, duration: 2.05, speaker: "witness", text: "There was a man crossing the road." },
  { at: 43.3, duration: 5.9, speaker: "witness", text: "No. He wasn't in a brown coat. He was in a black trench coat. He had an umbrella up." },
  { at: 50.2, duration: 1.05, speaker: "interviewer", text: "Anything else?" },
  { at: 51.55, duration: 4.35, speaker: "witness", text: "There was a car coming down the road. I thought it was going to stop." },
  { at: 65.15, duration: 1.75, speaker: "interviewer", text: "Is that what the car looked like?" },
  { at: 67.25, duration: 0.8, speaker: "witness", text: "No..." },
  { at: 71.1, duration: 2.35, speaker: "witness", text: "I think it was a van. A black one." },
  { at: 75, duration: 2.2, speaker: "witness", text: "Yes. Yes, it looked just like that." },
  { at: 80.15, duration: 2.65, speaker: "interviewer", text: "I'm going to walk you back to where you were standing." },
  { at: 86.7, duration: 1.85, speaker: "witness", text: "Wait. Stop. Go back." },
  { at: 99.2, duration: 3.15, speaker: "witness", text: "There was a man. Standing in that doorway." },
  { at: 108.45, duration: 1.25, speaker: "witness", text: "He was watching." },
];

const speakerNames: Record<Speaker, string> = {
  operator: "999 operator",
  interviewer: "Interviewer",
  witness: "Mrs Petru",
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.min(FILM_DURATION, seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function visibleText(line: TranscriptLine, elapsed: number) {
  if (elapsed >= line.at + line.duration) return line.text;
  const progress = Math.max(0, (elapsed - line.at) / line.duration);
  const characterCount = Math.max(1, Math.ceil(line.text.length * progress));
  return line.text.slice(0, characterCount);
}

export function TranscriptPlayer() {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const latestRef = useRef<HTMLDivElement | null>(null);

  const visibleLines = useMemo(
    () => transcript.filter((line) => line.at <= elapsed),
    [elapsed],
  );

  useEffect(() => {
    if (!playing) return;

    const tick = (now: number) => {
      if (startedAtRef.current === null) {
        startedAtRef.current = now - elapsedRef.current * 1000;
      }

      const nextElapsed = Math.min((now - startedAtRef.current) / 1000, FILM_DURATION);
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);

      if (nextElapsed < FILM_DURATION) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [playing]);

  useEffect(() => {
    latestRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleLines.length]);

  const togglePlayback = () => {
    if (elapsedRef.current >= FILM_DURATION) {
      elapsedRef.current = 0;
      setElapsed(0);
      startedAtRef.current = null;
      setPlaying(true);
      return;
    }

    if (playing) {
      setPlaying(false);
    } else {
      startedAtRef.current = null;
      setPlaying(true);
    }
  };

  const restart = () => {
    elapsedRef.current = 0;
    startedAtRef.current = null;
    setElapsed(0);
    setPlaying(true);
  };

  const phase = elapsed < 17 ? "Emergency call" : "Witness interview";
  const ended = elapsed >= FILM_DURATION;
  const showCard = elapsed >= 110;

  return (
    <main className="player-shell">
      <div className="progress-track" aria-hidden="true">
        <span style={{ transform: `scaleX(${elapsed / FILM_DURATION})` }} />
      </div>

      <header className="player-header">
        <div className="case-mark">
          <span className={`recording-dot${playing ? " recording-dot--live" : ""}`} />
          <div>
            <p>{phase}</p>
            <span>Paris Road · statement 01</span>
          </div>
        </div>

        <div className="transport">
          <time dateTime={`PT${Math.floor(elapsed)}S`}>{formatTime(elapsed)}</time>
          <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause transcript" : ended ? "Replay transcript" : "Resume transcript"}>
            {ended ? <ReplayIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" onClick={restart} aria-label="Restart transcript">
            <RestartIcon />
          </button>
        </div>
      </header>

      <section className="transcript" aria-label="Timed witness statement">
        <div className="transcript__inner">
          {visibleLines.map((line, index) => {
            const isWitness = line.speaker === "witness";
            const isTyping = elapsed < line.at + line.duration;
            return (
              <article
                className={`message message--${isWitness ? "right" : "left"}`}
                key={`${line.at}-${line.text}`}
                ref={index === visibleLines.length - 1 ? latestRef : undefined}
              >
                <div className="message__meta">
                  <span>{speakerNames[line.speaker]}</span>
                  <time dateTime={`PT${line.at}S`}>{formatTime(line.at)}</time>
                </div>
                <p>
                  {visibleText(line, elapsed)}
                  {isTyping && <span className="typing-caret" aria-hidden="true" />}
                </p>
              </article>
            );
          })}

          {elapsed < transcript[0].at && (
            <p className="waiting-copy">Connecting emergency call…</p>
          )}

          {showCard && (
            <div className="statement-end" ref={latestRef}>
              <span>Statement complete</span>
              <p>Witness statements lose detail.<br />Reconstructions don&apos;t.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="player-footer">
        <span>Live transcript</span>
        <span className="sound-note">Timed to 02:00 picture edit</span>
      </footer>
    </main>
  );
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z" /></svg>;
}

function ReplayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2.05 5" /></svg>;
}

function RestartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7v10M17 7v10M10 12l7-5v10Z" /></svg>;
}
