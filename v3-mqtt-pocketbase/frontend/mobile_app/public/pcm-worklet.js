// PigPulse v3 app — scheduled PCM playback worklet.
//
// The main thread (src/utils/pcm-stream.ts) fetches the never-ending PCM
// stream and posts each block here together with the AudioContext time at
// which the block must be HEARD. This processor owns the rendering.
//
// Why a worklet and not AudioBufferSourceNode
// --------------------------------------------
// The old player created one AudioBufferSourceNode per chunk and started it
// at a future time, so that the sound would land together with the frame
// showing the same moment. Every one of those calls — and every byte of every
// chunk — was scheduled from the MAIN thread. When the main thread stalled
// (background tab, screen lock, a long task, a GC pause) no new block was
// scheduled, the already-scheduled ones played out, and the audio went silent
// until the main thread woke up. That silence was the "pause" people heard.
//
// Here the main thread only FETCHES and POSTS. The samples wait inside this
// processor and are rendered continuously, so a slow or throttled main thread
// can no longer punch a hole in the audio.
//
// Protocol (main -> processor)
//   { cmd: 'config', inRate, channels }  set the input format
//   { cmd: 'block', data: Int16Array, playAt }
//   { cmd: 'flush' }                    drop every pending block
//   { cmd: 'stats' }                    -> stats-reply
// processor -> main
//   { cmd: 'stats-reply', frames, gaps, underruns, pending }
//
// Rendering rules
//   * Silence before a block's `playAt` — that is the scheduled delay that
//     keeps the sound in step with the picture, not a dropout.
//   * Linear interpolation between input frames, because the input rate
//     (16 kHz from the Pi) is usually not the context rate (44.1/48 kHz).
//   * Mono mixdown to every output channel: the barn mic is a single
//     capsule, so one of the interleaved slots is silent and averaging keeps
//     both ears at the same level.
//   * When the queue runs dry after playback has started, that IS an
//     underrun and is counted.

class PigPulsePcmScheduler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.inRate = opts.inRate || 16000;
    this.channels = opts.channels || 2;
    this.ratio = this.inRate / sampleRate; // input frames per output frame
    this.blocks = [];
    this.started = false;
    this.frames = 0;
    this.gaps = 0;
    this.underruns = 0;
    this._wasDry = false;
    this.port.onmessage = (ev) => this._onMessage(ev.data);
  }

  _onMessage(d) {
    if (!d || typeof d !== 'object') return;
    if (d.cmd === 'config') {
      if (d.inRate > 0) {
        this.inRate = d.inRate;
        this.ratio = this.inRate / sampleRate;
      }
      if (d.channels > 0) this.channels = d.channels;
      return;
    }
    if (d.cmd === 'block') {
      const data = d.data;
      if (data && data.length) {
        this.blocks.push({
          data,
          playAt: d.playAt,
          pos: 0,
          frames: Math.floor(data.length / this.channels),
        });
        this.started = true;
      }
      return;
    }
    if (d.cmd === 'flush') {
      this.blocks.length = 0;
      return;
    }
    if (d.cmd === 'stats') {
      this.port.postMessage({
        cmd: 'stats-reply',
        frames: this.frames,
        gaps: this.gaps,
        underruns: this.underruns,
        pending: this.blocks.length,
      });
    }
  }

  /** One input sample of `frame`, channel `ch`, as a float in [-1, 1]. */
  _at(block, frame, ch) {
    const s = frame * this.channels + ch;
    if (s < 0 || s >= block.data.length) return 0;
    return block.data[s] / 32768;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const n = out[0].length;
    const nOut = out.length;
    const t0 = currentTime;
    let hadBlock = false;
    let dry = true;

    for (let i = 0; i < n; i++) {
      const t = t0 + i / sampleRate;
      const block = this.blocks[0];
      if (!block) {
        for (let c = 0; c < nOut; c++) out[c][i] = 0;
        continue;
      }
      hadBlock = true;
      if (t < block.playAt) {
        // Scheduled silence: the block is not due yet.
        for (let c = 0; c < nOut; c++) out[c][i] = 0;
        continue;
      }
      dry = false;

      const i0 = Math.floor(block.pos);
      const frac = block.pos - i0;
      const l0 = this._at(block, i0, 0);
      const r0 = this.channels > 1 ? this._at(block, i0, 1) : l0;
      const l1 = this._at(block, i0 + 1, 0);
      const r1 = this.channels > 1 ? this._at(block, i0 + 1, 1) : l1;
      const m =
        ((l0 + (l1 - l0) * frac) + (r0 + (r1 - r0) * frac)) * 0.5;
      for (let c = 0; c < nOut; c++) out[c][i] = m;

      block.pos += this.ratio;
      if (block.pos >= block.frames) {
        const endAt = block.playAt + block.frames / this.inRate;
        this.blocks.shift();
        const next = this.blocks[0];
        if (next && next.playAt > endAt + 1e-6) this.gaps++;
      }
    }

    this.frames += n;
    if (dry && !hadBlock && this.started && !this._wasDry) this.underruns++;
    this._wasDry = dry && !hadBlock;
    return true;
  }
}

registerProcessor('pigpulse-pcm-scheduler', PigPulsePcmScheduler);
