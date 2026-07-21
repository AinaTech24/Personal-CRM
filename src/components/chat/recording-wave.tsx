"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.12;
/** Bar width + gap. The count is derived from this so the wave fills its box. */
const PITCH = 6;
const MIN_BARS = 12;

/**
 * Live waveform for an in-progress recording.
 *
 * Driven by the microphone's actual level through an AnalyserNode, so it
 * responds to the room rather than looping a canned animation — silence reads
 * as silence, which is the only way this doubles as a "is it hearing me?"
 * indicator.
 *
 * Bar heights are written straight to the DOM from a rAF loop. Putting a
 * hundred-odd values through React state sixty times a second would re-render
 * the whole composer for a decoration.
 *
 * The bar count is measured from the rendered width rather than fixed, so the
 * wave spans the composer instead of leaving most of it empty — and still fits
 * when the window is narrow.
 */
export function RecordingWave({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const levels = useRef<number[]>([]);
  const [width, setWidth] = useState(0);
  // Below this the strip is too cramped to read as a waveform, so it isn't
  // drawn at all — the pulsing dot and timer alongside still say "recording".
  const canShow = width >= MIN_BARS * PITCH;
  const bars = canShow ? Math.floor(width / PITCH) : 0;

  // Track the available width. ResizeObserver rather than a window listener:
  // the composer also changes width when attachments or the reply bar appear.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Belt and braces: ResizeObserver callbacks ride the rendering steps, which
    // some environments starve. A window resize is the common case anyway.
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Keep the history the same length as the bars, preserving what's already
  // there so a resize doesn't blank the wave mid-recording.
  if (levels.current.length !== bars) {
    const next = new Array(bars).fill(MIN_SCALE);
    const keep = Math.min(bars, levels.current.length);
    for (let i = 0; i < keep; i++) next[bars - keep + i] = levels.current[levels.current.length - keep + i];
    levels.current = next;
  }

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
      // ~30fps is plenty for a waveform and halves the work on a busy tab.
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

      // Read the live length: a resize can change it between frames.
      for (let i = 0; i < levels.current.length; i++) {
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
    <div
      ref={containerRef}
      // No `w-full`: the bars don't shrink, so a width driven by content would
      // let a stale (too high) bar count force the whole composer wider than the
      // screen. Width comes from the flex parent, extra bars are clipped, and
      // the observer trims the count on the next frame.
      className={cn("flex h-6 min-w-0 items-center justify-between gap-[3px] overflow-hidden", className)}
      aria-hidden
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="h-full w-[3px] shrink-0 origin-center rounded-full bg-current"
          style={{ transform: `scaleY(${MIN_SCALE})`, transition: "transform 90ms linear" }}
        />
      ))}
    </div>
  );
}
