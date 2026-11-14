/**
 * Stateful PCM frame assembly for the continuous barn-mic player.
 *
 * A `fetch` body arrives as ARBITRARY byte chunks: a chunk can start mid-frame
 * and end mid-frame. Decoding each chunk in isolation — the old behaviour —
 * dropped those partial edges, so bytes at every chunk boundary were lost and
 * the samples after the boundary were shifted: a click at each edge, plus a
 * slow drift between the audio and the frames it is meant to line up with.
 *
 * This decoder carries the leftover bytes (strictly fewer than one frame) from
 * one chunk into the next, so a stream split at ANY byte offset decodes to
 * exactly the same samples as the whole buffer. The carry is bounded by
 * construction: after every `push` at most `bytesPerFrame - 1` bytes are held.
 *
 * A decoder belongs to ONE stream/session. `reset()` — or simply a fresh
 * decoder — drops the carry, so a new connection, a format change or a
 * re-anchor can never splice the tail of the old stream onto the head of the
 * new one.
 *
 * Format is little-endian signed 16-bit interleaved, matching the `s16le` the
 * Pi emits on `x-audio-channels` interleaved channels.
 */

/** Bytes per interleaved 16-bit little-endian sample. */
const BYTES_PER_SAMPLE = 2;

/**
 * Largest channel count this decoder accepts. The barn mic is mono or stereo;
 * anything above this is a corrupt header, which is rejected rather than
 * silently trusted (fail closed — never invent a format at runtime).
 */
export const MAX_PCM_CHANNELS = 8;

export interface PcmFrameDecoder {
  /**
   * Decode one fetched chunk, carrying any partial-frame bytes to the next
   * call. Returns the whole frames now available (possibly empty).
   */
  push(chunk: Uint8Array): Int16Array;
  /** Drop the carried bytes and reset the emitted counter (new stream/session). */
  reset(): void;
  /** Bytes held back waiting for the rest of their frame (`< bytesPerFrame`). */
  readonly carriedBytes: number;
  /** Whole-frame bytes emitted since construction or the last `reset()`. */
  readonly emittedBytes: number;
  /** Bytes in one interleaved frame (`2 * channels`). */
  readonly bytesPerFrame: number;
  /** Channel count this decoder was built for. */
  readonly channels: number;
}

function assertSupportedChannels(channels: number): void {
  if (!Number.isInteger(channels) || channels < 1 || channels > MAX_PCM_CHANNELS) {
    throw new TypeError(
      `unsupported PCM channel count: ${String(channels)} (expected 1..${MAX_PCM_CHANNELS})`,
    );
  }
}

/**
 * Create a decoder for `channels` interleaved channels.
 *
 * Throws `TypeError` for a channel count outside `1..MAX_PCM_CHANNELS`: a bad
 * header must fail loudly, not be coerced into a guess.
 */
export function createPcmFrameDecoder(channels = 2): PcmFrameDecoder {
  assertSupportedChannels(channels);
  const bytesPerFrame = BYTES_PER_SAMPLE * channels;
  let residual = new Uint8Array(0);
  let emittedBytes = 0;

  const push = (chunk: Uint8Array): Int16Array => {
    if (!chunk || chunk.length === 0) return new Int16Array(0);
    const incoming = chunk.length;
    const total = residual.length + incoming;
    const frames = Math.floor(total / bytesPerFrame);

    if (frames <= 0) {
      // Still short of a frame: hold every byte for the next chunk.
      const held = new Uint8Array(total);
      held.set(residual, 0);
      held.set(chunk, residual.length);
      residual = held;
      return new Int16Array(0);
    }

    const wholeBytes = frames * bytesPerFrame;
    // The whole-frame region may span the carried tail and (part of) the
    // chunk; copy just that region into one contiguous buffer so the
    // little-endian read is uniform and the chunk's `byteOffset` is honoured.
    const whole = new Uint8Array(wholeBytes);
    const fromResidual = Math.min(residual.length, wholeBytes);
    whole.set(residual.subarray(0, fromResidual), 0);
    if (fromResidual < wholeBytes) {
      whole.set(chunk.subarray(0, wholeBytes - fromResidual), fromResidual);
    }

    const out = new Int16Array(frames * channels);
    const view = new DataView(whole.buffer);
    for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * BYTES_PER_SAMPLE, true);

    const consumedFromChunk = wholeBytes - fromResidual;
    const tail = chunk.subarray(consumedFromChunk);
    residual = tail.length ? new Uint8Array(tail) : new Uint8Array(0);
    emittedBytes += wholeBytes;
    return out;
  };

  const reset = (): void => {
    residual = new Uint8Array(0);
    emittedBytes = 0;
  };

  return {
    push,
    reset,
    get carriedBytes() {
      return residual.length;
    },
    get emittedBytes() {
      return emittedBytes;
    },
    bytesPerFrame,
    channels,
  };
}
