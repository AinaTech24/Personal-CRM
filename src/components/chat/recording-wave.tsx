"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BARS = 28;
const MIN_SCALE = 0.12;

/**
 * Live waveform for an in-progress recording.
 *
 * Driven by the microphone's actual level through an AnalyserNode, so it
 * responds to the room rather than looping a canned animation — silence reads
 * as silence, which is the only way this doubles as a "is it hearing me?"
 * indicator.
 *
 * Bar heights are written straight to the DOM from a rAF loop. Putting 28
 * values through React state sixty times a second would re-render the whole
 * composer for a decoration.
 */
export function RecordingWave({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const levels = useRef<number[]>(new Array(BARS).fill(MIN_SCALE));

  useEffect(() => {
    if (!stream) return;

    type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
    if (!Ctor) return; // no Web Audio: bars simply stay at rest

    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    // Deliberately not connected to ctx.destination — routing the mic to the
    // speakers would howl.
    source.connect(analyser);

    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // ~30fps is plenty for 28 bars and halves the work on a busy tab.
      if (now - last < 33) return;
      last = now;

      analyser.getByteTimeDomainData(buf);
      // RMS around the 128 midpoint — a fairer sense of loudness than peak,
      // which any single click would pin to the top.
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Speech sits low in a linear scale; this curve lifts it into view.
      const scaled = Math.min(1, Math.pow(rms * 3.2, 0.7));

      // Newest on the right, older values sliding left.
      levels.current.push(Math.max(MIN_SCALE, scaled));
      levels.current.shift();

      for (let i = 0; i < BARS; i++) {
        const el = barRefs.current[i];
        if (el) el.style.transform = `scaleY(${levels.current[i]})`;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      analyser.disconnect();
      // Closing frees the audio hardware; it can reject if already closed.
      ctx.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div className={cn("flex h-6 items-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="h-full w-[3px] origin-center rounded-full bg-current"
          style={{ transform: `scaleY(${MIN_SCALE})`, transition: "transform 90ms linear" }}
        />
      ))}
    </div>
  );
}
