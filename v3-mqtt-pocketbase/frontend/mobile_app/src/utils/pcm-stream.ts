/**
 * Continuous barn-mic audio for the web, aligned to the shared PiClock lag.
 *
 * The old player fetched one 3-second WAV chunk at a time, played it, then
 * fetched the next — every boundary contained a silent fetch gap, and on a
 * link whose transit exceeds the chunk length it never caught up ("the audio
 * does a pause"). This player instead reads the never-ending
 * `s16le/PCM` stream once, converts to Float32, and schedules each block on
 * a Web Audio timeline at `capture + lag` — the same lag the thermal and
 * CCTV panels use — so every block plays exactly when the frame showing the
 * same moment is displayed.
 *
 * Honesty rules: the state callback reports what is actually happening
 * ("connecting", "live", "reconnecting" + reason); audio is never played
 * un-aligned when the stream carries a timestamp and the clock is not ready
 * yet — those blocks are dropped instead.
 *
 * Web-only: everything touching `window`/`AudioContext` happens inside
 * `startPcmStream`, so the module is safe to bundle for native (where the
 * chunked WAV path remains in use).
 */
import { Platform } from 'react-native';
import { MAX_LAG_MS, piClock } from './pi-clock';

export type PcmStreamState = 'connecting' | 'live' | 'reconnecting' | 'stopped';

export interface PcmStreamOptions {
  /** Absolute stream URL (`…/pi/esp/stream?rate=16000` or the bridge equivalent). */
  url: string;
  onState?: (state: PcmStreamState, detail?: string) => void;
}

export interface PcmStreamHandle {
  stop: () => void;
}

const FALLBACK_RATE = 16000;
const MIN_CLAMP_MS = 40; // never schedule closer than this (timer slop)
const LATE_DROP_MS = 250; // aligned moment already this far past -> drop block
const LATE_STRIKES = 4; // consecutive drops -> re-anchor with a fresh stream
// Paranoia cap on scheduling ahead. Must sit comfortably ABOVE the lag
// ceiling: the lead IS the shared lag (plus the clock's under-estimate slack),
// so a cap near `MAX_LAG_MS` would schedule audio ahead of the frame showing
// the same moment — the one thing this player must not do.
const MAX_LEAD_MS = MAX_LAG_MS + 5000;
const IDLE_READ_MS = 5000; // over the shared lag, above which a read is stalled
const RECONNECT_MIN_MS = 700;
const RECONNECT_MAX_MS = 8000;

type AudioCtor = new () => AudioContext;

function audioCtor(): AudioCtor | null {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True when this runtime can play the continuous PCM stream. */
export function isPcmStreamSupported(): boolean {
  return audioCtor() !== null && typeof ReadableStream !== 'undefined';
}

class StreamError extends Error {}

function intHeader(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function int16ToFloat32(bytes: Uint8Array, channels: number): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(bytes.byteLength / (2 * channels));
  const out = new Float32Array(frames);
  if (channels === 1) {
    for (let i = 0; i < frames; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  } else {
    for (let i = 0; i < frames; i++) {
      let acc = 0;
      for (let c = 0; c < channels; c++) acc += view.getInt16((i * channels + c) * 2, true);
      out[i] = acc / (channels * 32768);
    }
  }
  return out;
}

export function startPcmStream(opts: PcmStreamOptions): PcmStreamHandle {
  const Ctor = audioCtor();
  if (!Ctor) throw new StreamError('continuous audio needs Web Audio in a browser');
  // Created inside the caller's user gesture so autoplay policy lets it run.
  const ctx = new Ctor();
  void ctx.resume?.().catch(() => {});

  let stopped = false;
  let abort: AbortController | null = null;
  let wake: (() => void) | null = null;

  const setState = (s: PcmStreamState, detail?: string) => {
    if (stopped && s !== 'stopped') return;
    try {
      opts.onState?.(s, detail);
    } catch {
      /* a listener must never break the stream */
    }
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
    });

  /** One connection: read until the upstream ends (or throws). Never buffers. */
  async function pump(): Promise<void> {
    const ctrl = new AbortController();
    abort = ctrl;
    const res = await fetch(opts.url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const text = (await res.text()).trim();
        if (text) detail = text;
      } catch {
        /* keep the HTTP status */
      }
      throw new StreamError(detail);
    }
    if (!res.body) throw new StreamError('stream has no body');

    const rate = intHeader(res, 'x-audio-rate') ?? FALLBACK_RATE;
    const channels = intHeader(res, 'x-audio-channels') ?? 1;
    const headerTs = intHeader(res, 'x-stream-ts');
    const bytesPerMs = (rate * channels * 2) / 1000;

    const reader = res.body.getReader();
    // A stalled-but-open connection must throw, not hang: with no data there
    // are no blocks, no late-strikes, and the reconnect machinery would never
    // fire while the UI keeps saying "Playing". Race each read against an idle
    // timer; the abort in the reconnect path releases the losing read.
    const readNext = (): Promise<Awaited<ReturnType<typeof reader.read>>> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stall = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new StreamError('audio stalled — no data (link dropped?)')),
          piClock.lagMs + IDLE_READ_MS,
        );
      });
      return Promise.race([reader.read(), stall]).finally(() => {
        if (timer !== undefined) clearTimeout(timer);
      });
    };
    let bytes = 0; // audio bytes consumed from this stream (chunk-start clock)
    let nextFree = 0; // ctx time (s) at which the last scheduled block ends
    let strikeCount = 0;
    let settleSamples = 0;
    let align = false;
    let runOffset: number | null = null;
    let announced = false;

    for (;;) {
      const { done, value } = await readNext();
      if (done) break;
      if (stopped) return;
      if (!value || value.length === 0) continue;

      const arrival = Date.now();
      const chunkStart = bytes;
      bytes += value.length;

      let captureMs: number | null = null;
      if (headerTs !== null) {
        captureMs = headerTs + chunkStart / bytesPerMs;
        // Chunk arrivals are clock observations too: the first sample of this
        // block was captured at `captureMs` and it just reached us.
        piClock.observe(captureMs, arrival);
        if (!align && piClock.ready) {
          const nowPi = piClock.now();
          if (nowPi !== null) piClock.ensureForAge(nowPi - captureMs, 600);
          settleSamples++;
          if (settleSamples >= 2) {
            // Two full blocks of evidence: snapshot the offset for this run so
            // the timeline stays monotonic on it.
            runOffset = piClock.offsetMs();
            align = runOffset !== null;
          }
        } else if (align) {
          const nowPi = piClock.now();
          if (nowPi !== null) piClock.ensureForAge(nowPi - captureMs, 600);
        }
      }

      const frames = Math.floor(value.length / (2 * channels));
      if (frames <= 0) continue;

      let targetMs: number;
      if (align && captureMs !== null && runOffset !== null) {
        targetMs = captureMs - runOffset + piClock.lagMs;
      } else if (captureMs === null) {
        // Structurally un-timestamped stream (should not happen with our
        // stack): play what we can, near-live, and say so.
        targetMs = arrival + 60;
      } else {
        // Timestamped but the clock is not ready yet: drop rather than play
        // mis-aligned audio into a user who asked for alignment.
        continue;
      }

      const delayMs = targetMs - Date.now();
      if (align) {
        if (delayMs < -LATE_DROP_MS) {
          strikeCount++;
          if (strikeCount >= LATE_STRIKES) {
            throw new StreamError('audio fell behind the aligned schedule');
          }
          continue;
        }
        strikeCount = 0;
      }

      if (ctx.state !== 'running') {
        // Autoplay policy can hold the context suspended (the legacy chunked
        // path had the same discipline). Never announce or schedule audio
        // that cannot be heard: drop the block instead of queueing it into a
        // burst for whenever the context resumes, and keep asking to resume.
        try {
          void ctx.resume?.().catch(() => {});
        } catch {
          /* a suspended context must not kill the reader loop */
        }
        continue;
      }

      const leadMs = Math.min(Math.max(delayMs, MIN_CLAMP_MS), MAX_LEAD_MS);
      const startAt = Math.max(ctx.currentTime + leadMs / 1000, nextFree);
      const buffer = ctx.createBuffer(1, frames, rate);
      buffer.getChannelData(0).set(int16ToFloat32(value, channels));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(startAt);
      nextFree = startAt + buffer.duration;

      if (!announced) {
        announced = true;
        setState(
          'live',
          headerTs === null
            ? 'stream has no timestamp — playing near-live'
            : `aligned ≈${(piClock.lagMs / 1000).toFixed(1)} s behind live`,
        );
      }
    }
  }

  /** Abort the current connection NOW and drop the handle. Call this before
   *  every wait: leaving it open until the next pump() leaks a socket on the
   *  bidirectional side of the stream and can stack connections across
   *  reconnect attempts. */
  function releaseConnection(): void {
    try {
      abort?.abort();
    } catch {
      /* a failed abort must not mask the re-anchor */
    }
    abort = null;
  }

  async function run(): Promise<void> {
    let attempt = 0;
    while (!stopped) {
      try {
        setState('connecting');
        await pump();
        releaseConnection();
        if (stopped) break;
        // Upstream ended (e.g. the Pi closed the stream after the mic went
        // idle). Re-anchor with a fresh stream.
        setState('reconnecting', 'stream ended');
        attempt = 0;
        await sleep(400);
      } catch (e) {
        releaseConnection();
        if (stopped) break;
        const detail = e instanceof Error ? e.message : String(e);
        setState('reconnecting', detail);
        const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt);
        attempt = Math.min(attempt + 1, 3);
        await sleep(backoff);
      }
    }
  }

  void run();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        abort?.abort();
      } catch {
        /* ignore */
      }
      wake?.();
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
      setState('stopped');
    },
  };
}
