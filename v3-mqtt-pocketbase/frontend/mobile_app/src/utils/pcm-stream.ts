/**
 * Continuous barn-mic audio for the web, aligned to the shared PiClock lag.
 *
 * The old player fetched one 3-second WAV chunk at a time, played it, then
 * fetched the next — every boundary contained a silent fetch gap, and on a
 * link whose transit exceeds the chunk length it never caught up ("the audio
 * does a pause"). This player instead reads the never-ending `s16le/PCM`
 * stream once and schedules each block so it is heard at `capture + lag` — the
 * same lag the thermal and CCTV panels use — so every block plays exactly
 * when the frame showing the same moment is displayed.
 *
 * WHY AN AUDIOWORKLET (2026-11-13)
 * The previous version scheduled one `AudioBufferSourceNode` per chunk and
 * started it at a future time. Every scheduling decision, and every byte of
 * every chunk, went through the MAIN thread. When the main thread stalled —
 * background tab, screen lock, a long task, a GC pause — no new block was
 * scheduled, the already-scheduled ones played out, and the audio went SILENT
 * until the main thread woke. That silence was the "pause".
 *
 * Now the main thread only fetches and posts; the samples wait inside an
 * `AudioWorkletProcessor` and are rendered continuously. A slow or throttled
 * main thread can no longer punch a hole in the audio, and there is no
 * schedule-ahead ceiling any more: the worklet parks the audio that is
 * waiting for its turn, so the lead is bounded by memory, not by a timer.
 *
 * The ScriptProcessorNode path is kept as a fallback for browsers without
 * AudioWorklet (notably a plain-HTTP origin, where the worklet API is not
 * exposed). It is reported through `onMode` because it runs on the main
 * thread and mobile browsers suspend it when the screen locks — the very
 * symptom this change exists to remove.
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

/** Which renderer is actually in use. `script-processor` is the degraded one. */
export type PcmStreamMode = 'worklet' | 'script-processor';

export interface PcmStreamOptions {
  /** Absolute stream URL (`…/pi/esp/stream?rate=16000` or the bridge equivalent). */
  url: string;
  onState?: (state: PcmStreamState, detail?: string) => void;
  /** Fired once the renderer is chosen, before the first block is scheduled. */
  onMode?: (mode: PcmStreamMode) => void;
  /**
   * How the sound relates to the picture on screen.
   *
   * 'live' (default) — CONTINUITY FIRST. The sound follows its own timeline,
   * so a stalled main thread can never punch a hole in it. The sound may end
   * up further behind live after a stall, and when it drifts too far the
   * backlog is skipped rather than replayed. The state detail (and `onLag`)
   * always say how far behind live the sound is, so nothing is hidden.
   *
   * 'aligned' — the sound must be heard exactly when the frame showing the
   * same moment appears. A block that cannot be aligned is dropped and the
   * stream re-anchors. This is what a CAPTURE around a detection needs: the
   * captured audio and the captured frames have to describe the same moment.
   *
   * Note that a detection capture does NOT use this stream — it fetches
   * point-in-time artefacts that each carry their own Pi-clock stamp
   * (`/cctv` with `X-Frame-Ts`, `/esp/record?seconds=N`), so they are
   * synced to each other by construction. This option is for a future
   * playback of such a capture.
   */
  sync?: 'live' | 'aligned';
  /** Fired when the measured lag behind live changes materially. */
  onLag?: (lagMs: number) => void;
}

export interface PcmStreamHandle {
  stop: () => void;
}

const FALLBACK_RATE = 16000;
const FALLBACK_CHANNELS = 2;
const MIN_CLAMP_MS = 40; // never schedule closer than this (timer slop)
const LATE_DROP_MS = 250; // aligned moment already this far past -> drop block
const LATE_STRIKES = 4; // consecutive drops -> re-anchor with a fresh stream
// The worklet parks the audio that is waiting for its turn, so the lead is
// bounded by memory and NOT by the old schedule-ahead ceiling. It still has
// to sit comfortably above the clock's lag ceiling (MAX_LAG_MS): beyond that
// the clock is broken, not the audio. When the lead exceeds this the block is
// dropped and the strike counter re-anchors the stream, exactly like a late
// block — the sound is never played early, out of step with the picture.
const MAX_LEAD_MS = MAX_LAG_MS * 4;
const IDLE_READ_MS = 5000; // over the shared lag, above which a read is stalled
const RECONNECT_MIN_MS = 700;
const RECONNECT_MAX_MS = 8000;
const WORKLET_NAME = 'pigpulse-pcm-scheduler';
// Where the worklet module is served from. `public/` is copied to the root of
// the web export, so the module is a sibling of index.html.
const WORKLET_FILE = 'pcm-worklet.js';

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

/**
 * Copy a fetched chunk into whole frames of interleaved Int16.
 *
 * A fetch chunk can start mid-frame and end mid-frame; the renderer needs
 * whole frames, so the partial edges are dropped here rather than becoming a
 * click.
 */
function toInt16(bytes: Uint8Array, channels: number): Int16Array {
  const bytesPerFrame = 2 * channels;
  const frames = Math.floor(bytes.length / bytesPerFrame);
  const out = new Int16Array(frames * channels);
  if (frames <= 0) return out;
  const src = new DataView(bytes.buffer, bytes.byteOffset, frames * bytesPerFrame);
  for (let i = 0; i < out.length; i++) out[i] = src.getInt16(i * 2, true);
  return out;
}

/** A block waiting for its turn, shared by both renderers. */
interface PendingBlock {
  data: Int16Array;
  /** AudioContext time at which this block must be heard. */
  playAt: number;
  /** Fractional input-frame position inside the block. */
  pos: number;
  frames: number;
}

/** Where scheduled PCM goes. Both renderers obey the same contract. */
interface PcmSink {
  readonly mode: PcmStreamMode;
  configure(inRate: number, channels: number): void;
  push(data: Int16Array, playAt: number): void;
  /** Drop everything still pending (a re-anchor invalidates it). */
  flush(): void;
  close(): void;
}

/**
 * The real renderer: an AudioWorklet that owns playback.
 *
 * The worklet module lives in `public/pcm-worklet.js` and is loaded from the
 * app's own origin, so it is available whenever the page is in a secure
 * context (https or localhost). A plain-HTTP LAN origin is NOT a secure
 * context and the AudioWorklet API is not exposed there — that is why the
 * ScriptProcessor fallback exists.
 */
class WorkletSink implements PcmSink {
  readonly mode: PcmStreamMode = 'worklet';

  constructor(private readonly node: AudioWorkletNode) {}

  configure(inRate: number, channels: number): void {
    this.node.port.postMessage({ cmd: 'config', inRate, channels });
  }

  push(data: Int16Array, playAt: number): void {
    this.node.port.postMessage({ cmd: 'block', data, playAt });
  }

  flush(): void {
    this.node.port.postMessage({ cmd: 'flush' });
  }

  close(): void {
    try {
      this.node.disconnect();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fallback renderer for browsers without AudioWorklet.
 *
 * It mirrors the worklet's algorithm exactly (same block queue, same linear
 * interpolation, same mono mixdown) but runs on the MAIN thread — so a busy
 * or throttled main thread can still glitch, and mobile browsers suspend it
 * when the screen locks. It is reported so the UI can say so out loud.
 */
class ScriptProcessorSink implements PcmSink {
  readonly mode: PcmStreamMode = 'script-processor';

  private blocks: PendingBlock[] = [];
  private inRate: number;
  private channels: number;
  private ratio: number;
  private node: ScriptProcessorNode;

  constructor(
    private readonly ctx: AudioContext,
    inRate: number,
    channels: number,
  ) {
    this.inRate = inRate;
    this.channels = channels;
    this.ratio = inRate / ctx.sampleRate;
    // 1024 frames is 21 ms at 48 kHz — lower latency and far less main-thread
    // work than the 4096-frame buffer this used to use.
    const node = ctx.createScriptProcessor(1024, 1, 2);
    node.onaudioprocess = (ev) => this.render(ev);
    node.connect(ctx.destination);
    this.node = node;
  }

  configure(inRate: number, channels: number): void {
    this.inRate = inRate;
    this.channels = channels;
    this.ratio = inRate / this.ctx.sampleRate;
  }

  push(data: Int16Array, playAt: number): void {
    if (!data.length) return;
    this.blocks.push({
      data,
      playAt,
      pos: 0,
      frames: Math.floor(data.length / this.channels),
    });
  }

  flush(): void {
    this.blocks = [];
  }

  close(): void {
    this.blocks = [];
    try {
      this.node.onaudioprocess = null;
    } catch {
      /* ignore */
    }
    try {
      this.node.disconnect();
    } catch {
      /* ignore */
    }
  }

  private at(block: PendingBlock, frame: number, ch: number): number {
    const s = frame * this.channels + ch;
    if (s < 0 || s >= block.data.length) return 0;
    return block.data[s] / 32768;
  }

  private render(ev: AudioProcessingEvent): void {
    const out = ev.outputBuffer;
    const left = out.getChannelData(0);
    const right = out.numberOfChannels > 1 ? out.getChannelData(1) : null;
    const n = left.length;
    const rate = out.sampleRate;
    const t0 = ev.playbackTime;
    for (let i = 0; i < n; i++) {
      const t = t0 + i / rate;
      const block = this.blocks[0];
      if (!block || t < block.playAt) {
        left[i] = 0;
        if (right) right[i] = 0;
        continue;
      }
      const i0 = Math.floor(block.pos);
      const frac = block.pos - i0;
      const l0 = this.at(block, i0, 0);
      const r0 = this.channels > 1 ? this.at(block, i0, 1) : l0;
      const l1 = this.at(block, i0 + 1, 0);
      const r1 = this.channels > 1 ? this.at(block, i0 + 1, 1) : l1;
      const m = ((l0 + (l1 - l0) * frac) + (r0 + (r1 - r0) * frac)) * 0.5;
      left[i] = m;
      if (right) right[i] = m;
      block.pos += this.ratio;
      if (block.pos >= block.frames) this.blocks.shift();
    }
  }
}

/**
 * Candidate URLs for the worklet module.
 *
 * `public/` lands at the root of the web export, so `/pcm-worklet.js` is the
 * normal case. The relative form covers an app served from a sub-path.
 */
function workletUrls(): string[] {
  const urls: string[] = [];
  try {
    if (typeof document !== 'undefined' && document.baseURI) {
      urls.push(new URL(WORKLET_FILE, document.baseURI).toString());
    }
    if (typeof location !== 'undefined' && location.origin) {
      urls.push(new URL(`/${WORKLET_FILE}`, location.origin).toString());
    }
  } catch {
    /* fall through to the empty list */
  }
  return urls;
}

async function createWorkletSink(ctx: AudioContext): Promise<WorkletSink | null> {
  const w = window as unknown as {
    AudioWorkletNode?: new (
      context: AudioContext,
      name: string,
      options?: AudioWorkletNodeOptions,
    ) => AudioWorkletNode;
  };
  if (!ctx.audioWorklet || typeof w.AudioWorkletNode !== 'function') return null;
  for (const url of workletUrls()) {
    try {
      await ctx.audioWorklet.addModule(url);
      const node = new w.AudioWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { inRate: FALLBACK_RATE, channels: FALLBACK_CHANNELS },
      });
      node.connect(ctx.destination);
      return new WorkletSink(node);
    } catch {
      /* try the next candidate URL */
    }
  }
  return null;
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
  let sink: PcmSink | null = null;

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
  async function pump(active: PcmSink): Promise<void> {
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
    const channels = intHeader(res, 'x-audio-channels') ?? FALLBACK_CHANNELS;
    const headerTs = intHeader(res, 'x-stream-ts');
    const bytesPerMs = (rate * channels * 2) / 1000;
    // The renderer only learns the real format once the headers arrive.
    active.configure(rate, channels);

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
    let jumpToLive = false; // the backlog was skipped; play the next block now
    let lastLagReportMs = 0;
    let lastLagMs = -1;

    const sync = opts.sync ?? 'live';

    /** Tell the operator how far behind live the sound is. */
    const reportLag = (lagMs: number) => {
      if (Math.abs(lagMs - lastLagMs) < 250) return;
      lastLagMs = lagMs;
      try {
        opts.onLag?.(lagMs);
      } catch {
        /* a listener must never break the stream */
      }
    };

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
      let leadMs = Math.max(delayMs, MIN_CLAMP_MS);

      if (sync === 'aligned') {
        // STRICT: the sound must be heard exactly when the frame showing the
        // same moment appears. A block that is already late is dropped, and
        // four in a row re-anchor the stream.
        const late = align && delayMs < -LATE_DROP_MS;
        const tooFar = delayMs > MAX_LEAD_MS;
        if (late || tooFar) {
          strikeCount++;
          if (strikeCount >= LATE_STRIKES) {
            throw new StreamError(
              tooFar
                ? 'clock lead too large to park — re-anchoring'
                : 'audio fell behind the aligned schedule',
            );
          }
          continue;
        }
        strikeCount = 0;
      } else if (leadMs > MAX_LEAD_MS) {
        // LIVE: a clock that wants the sound a very long time from now is
        // broken, not the audio. Clamp the anchor and carry on.
        leadMs = MAX_LEAD_MS;
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

      // The renderer is told when the block must be heard; it parks the audio
      // itself, so the main thread never has to wake up again to keep the
      // audio going.
      let startAt: number;
      if (sync === 'aligned') {
        startAt = Math.max(ctx.currentTime + leadMs / 1000, nextFree);
      } else if (jumpToLive) {
        // The backlog was skipped: play this block the moment it arrives.
        startAt = ctx.currentTime;
        jumpToLive = false;
      } else if (nextFree > 0) {
        // LIVE: the sound follows its OWN timeline, so the schedule can never
        // leave an unscheduled hole for the listener.
        //
        // The old code re-anchored to `now + lead` after every block, so a
        // stalled main thread moved the whole schedule forward and the audio
        // in between was never scheduled — dead air for the length of the
        // stall. Here the timeline simply continues. The price is that the
        // sound can drift further behind live — which is REPORTED below,
        // never hidden.
        startAt = nextFree;
      } else {
        startAt = ctx.currentTime + leadMs / 1000;
      }
      active.push(toInt16(value, channels), startAt);
      nextFree = startAt + frames / rate;

      // How far behind live the sound is: the wall time at which this block
      // will be heard, minus the moment it was captured.
      const playAtWall = Date.now() + (startAt - ctx.currentTime) * 1000;
      const lagMs = captureMs === null ? 0 : Math.max(0, playAtWall - captureMs);
      reportLag(lagMs);

      if (sync === 'live' && lagMs > MAX_LAG_MS * 2) {
        // The sound has drifted a long way behind — a long stall, or a link
        // that could not keep up. Skip the backlog instead of letting the
        // drift grow without bound: the queued blocks are dropped and the
        // next one plays as soon as it arrives. The listener hears a skip,
        // not dead air.
        active.flush();
        nextFree = 0;
        jumpToLive = true;
        announced = true;
        setState(
          'live',
          `skipped ${(lagMs / 1000).toFixed(1)} s of backlog — jumped to the live edge`,
        );
        continue;
      }

      const how =
        active.mode === 'worklet'
          ? 'AudioWorklet'
          : 'fallback: ScriptProcessor (no AudioWorklet — the browser suspends it when the screen locks)';
      const detail =
        headerTs === null
          ? `stream has no timestamp — playing near-live (${how})`
          : sync === 'aligned'
            ? `aligned ≈${(piClock.lagMs / 1000).toFixed(1)} s behind live (${how})`
            : `${(lagMs / 1000).toFixed(1)} s behind live · picture ${(piClock.lagMs / 1000).toFixed(1)} s behind live (${how})`;

      if (!announced) {
        announced = true;
        setState('live', detail);
      } else if (sync === 'live' && Date.now() - lastLagReportMs > 2000) {
        // Keep the operator informed: how far behind live the sound is.
        lastLagReportMs = Date.now();
        setState('live', detail);
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

  async function run(active: PcmSink): Promise<void> {
    let attempt = 0;
    while (!stopped) {
      try {
        setState('connecting');
        await pump(active);
        releaseConnection();
        if (stopped) break;
        // Upstream ended (e.g. the Pi closed the stream after the mic went
        // idle). Re-anchor with a fresh stream.
        active.flush();
        setState('reconnecting', 'stream ended');
        attempt = 0;
        await sleep(400);
      } catch (e) {
        releaseConnection();
        // Pending blocks were scheduled against the old anchor; after a
        // re-anchor they would play out of step with the picture.
        active.flush();
        if (stopped) break;
        const detail = e instanceof Error ? e.message : String(e);
        setState('reconnecting', detail);
        const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt);
        attempt = Math.min(attempt + 1, 3);
        await sleep(backoff);
      }
    }
  }

  void (async () => {
    let active: PcmSink;
    try {
      const worklet = await createWorkletSink(ctx);
      active = worklet ?? new ScriptProcessorSink(ctx, FALLBACK_RATE, FALLBACK_CHANNELS);
    } catch (e) {
      setState('reconnecting', e instanceof Error ? e.message : String(e));
      return;
    }
    if (stopped) {
      active.close();
      return;
    }
    sink = active;
    try {
      opts.onMode?.(active.mode);
    } catch {
      /* a listener must never break the stream */
    }
    // The gesture may have expired while the worklet module was loading.
    try {
      void ctx.resume?.().catch(() => {});
    } catch {
      /* ignore */
    }
    await run(active);
  })();

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
        sink?.close();
      } catch {
        /* ignore */
      }
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
      setState('stopped');
    },
  };
}
