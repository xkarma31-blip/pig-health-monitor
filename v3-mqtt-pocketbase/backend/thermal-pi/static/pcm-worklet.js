// PigPulse mic stream worker — raw S16LE stereo @48k in → Web Audio out.
//
// Contract with /audio/stream (see web_server.py::_stream_audio):
//   interleaved Int16 frames, 48000 Hz, 2 channels, no container headers.
// The page posts each fetched chunk's ArrayBuffer; we prebuffer ~170 ms
// before the first audible frame, then linearly resample to whatever rate
// the AudioContext actually runs at (ctx.sampleRate may not be 48000).
// On underrun we jump to the live edge instead of replaying stale audio.

class MicStreamProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.inRate = opts.inRate || 48000;
    this.preroll = opts.preroll || 16384;      // input SAMPLES (~170 ms stereo)
    this.ratio = this.inRate / sampleRate;     // input frames per output frame
    this.chunks = [];                          // Int16Array[]
    this.chunkStart = 0;                       // abs sample index of chunks[0][0]
    this.total = 0;                            // abs samples received
    this.pos = 0;                              // abs input FRAME read position
    this.started = false;
    this.underruns = 0;
    this.frames = 0;                           // samples rendered (process() proof)
    this.port.onmessage = (ev) => {
      const d = ev.data;
      if (d && typeof d === 'object' && d.cmd === 'stats') {
        this.port.postMessage(
          {cmd: 'stats-reply', frames: this.frames, underruns: this.underruns});
        return;
      }
      let view = null;
      if (d instanceof ArrayBuffer) view = new Int16Array(d);
      else if (ArrayBuffer.isView(d)) {
        view = new Int16Array(d.buffer, d.byteOffset, d.byteLength >> 1);
      }
      if (view && view.length) this.push(view);
    };
  }

  push(view) {
    this.chunks.push(view);
    this.total += view.length;
    if (!this.started && this.total - this._consumed() >= this.preroll) {
      this.started = true;
    }
    // Tab throttled / consumer stalled → drop back to preroll (stay live)
    if (this.started && this.total - this._consumed() > this.preroll * 4) {
      this.pos = Math.max(0, Math.floor((this.total - this.preroll) / 2));
      this._trim();
    }
  }

  _consumed() {
    return Math.floor(this.pos) * 2;           // frames → interleaved samples
  }

  _trim() {
    const consumed = this._consumed();
    while (this.chunks.length &&
           consumed - this.chunkStart >= this.chunks[0].length) {
      this.chunkStart += this.chunks[0].length;
      this.chunks.shift();
    }
  }

  _raw(k) {
    let idx = k - this.chunkStart;
    if (idx < 0) return null;
    for (let c = 0; c < this.chunks.length; c++) {
      const ch = this.chunks[c];
      if (idx < ch.length) return ch[idx];
      idx -= ch.length;
    }
    return null;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const n = out[0].length;
    const nOut = out.length;
    this.frames += n;
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0;
      if (this.started) {
        const k = Math.floor(this.pos) * 2;
        const lv = this._raw(k);
        const rv = this._raw(k + 1);
        if (lv !== null && rv !== null) {
          l = lv / 32768;
          r = rv / 32768;
          this.pos += this.ratio;
        } else {
          // underrun: resync to live edge minus preroll, output silence
          this.underruns++;
          this.pos = Math.max(0, Math.floor((this.total - this.preroll) / 2));
        }
      }
      // Mix to both ears: single INMP441 strapping L/R→GND drives only one
      // slot (right stays 0); headphone playback is mono this way (meters
      // still show raw L/R separately).
      const m = (l + r) * 0.5;
      out[0][i] = m;
      if (nOut >= 2) out[1][i] = m;
    }
    if (this.started) this._trim();
    return true;
  }
}

registerProcessor('mic-stream', MicStreamProcessor);
