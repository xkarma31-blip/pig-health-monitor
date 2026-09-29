// PigPulse shared mic client — used by / (thermal dashboard) and /audio.
//
// Secure-context grounding (verified 2026-09-26, see README "HTTPS / AudioWorklet"):
//  - AudioWorklet is secure-context gated: BaseAudioContext.audioWorklet is
//    [SecureContext] (W3C web-audio-api issue #1436); MDN documents AudioWorklet
//    as "available only in secure contexts (HTTPS)"; Chrome's official blog:
//    "Worklet APIs including Audio Worklet are only available in a secure
//    context ... although http://localhost is considered a secure context".
//  - Potentially trustworthy origins (Secure Contexts spec / MDN): https, wss,
//    file, 127.0.0.0/8, ::1, localhost. Plain http://<lan-ip> is NOT secure.
//  - ScriptProcessorNode is deprecated but NOT secure-gated; AudioContext and
//    fetch() are not secure-gated either. So on a plain-HTTP LAN origin we fall
//    back to ScriptProcessorNode and live audio still works with zero TLS setup.
//
// Stream contract with /esp/stream (web_server.py::_stream_esp):
//   interleaved S16LE frames, 48000 Hz, 2 channels, frame-aligned chunks.
//   (The Pi GPIO mic stream /audio/stream was removed 2026-09-29.)
// The FIFO below mirrors static/pcm-worklet.js (a worklet runs in its own
// global scope, so it cannot reuse this file's classes) — keep the two
// algorithms in sync: preroll start, drop-back-to-live-edge on backlog,
// linear resample by inRate/ctxRate, underrun resync instead of stale replay.

const PigPulseMic = (function () {
  const IN_RATE_DEFAULT = 48000;
  let IN_RATE = IN_RATE_DEFAULT;   // overridden by start(url, inRate)
  const PREROLL = 16384; // input samples (~170 ms stereo)

  const API = {
    onMode: null, // (mode) => void — 'worklet' | 'script-processor' | null
    onEnded: null  // () => void — stream closed by server while live
  };
  const S = {
    live: false, ctx: null, node: null, reader: null,
    fifo: null, mode: null, spFrames: 0,
    gain: null, muted: false
  };

  API.secure = function () { return window.isSecureContext === true; };
  API.isLive = function () { return S.live; };
  API.mode = function () { return S.mode; };

  // Sound toggle — silence the monitor without tearing down the stream.
  API.setMuted = function (m) {
    S.muted = !!m;
    if (S.gain) S.gain.gain.value = S.muted ? 0 : 1;
    if (API.onMute) API.onMute(S.muted);
    return S.muted;
  };
  API.muted = function () { return S.muted; };
  API.onMute = null;

  // --- FIFO (mirror of pcm-worklet.js) ------------------------------------
  function makeFifo(step) {
    return {
      chunks: [], chunkStart: 0, total: 0, pos: 0, started: false, step: step,
      push(view) {
        this.chunks.push(view);
        this.total += view.length;
        if (!this.started && this.total - this._consumed() >= PREROLL) {
          this.started = true;
        }
        if (this.started && this.total - this._consumed() > PREROLL * 4) {
          this.pos = Math.max(0, Math.floor((this.total - PREROLL) / 2));
          this._trim();
        }
      },
      _consumed() { return Math.floor(this.pos) * 2; },
      _trim() {
        const consumed = this._consumed();
        while (this.chunks.length &&
               consumed - this.chunkStart >= this.chunks[0].length) {
          this.chunkStart += this.chunks[0].length;
          this.chunks.shift();
        }
      },
      _raw(k) {
        let idx = k - this.chunkStart;
        if (idx < 0) return null;
        for (let c = 0; c < this.chunks.length; c++) {
          const ch = this.chunks[c];
          if (idx < ch.length) return ch[idx];
          idx -= ch.length;
        }
        return null;
      },
      // One output frame: [l, r] floats; silence when not started or underrun.
      frame() {
        let l = 0, r = 0;
        if (this.started) {
          const k = Math.floor(this.pos) * 2;
          const lv = this._raw(k);
          const rv = this._raw(k + 1);
          if (lv !== null && rv !== null) {
            l = lv / 32768;
            r = rv / 32768;
            this.pos += this.step;
          } else {
            this.pos = Math.max(0, Math.floor((this.total - PREROLL) / 2));
          }
          this._trim();
        }
        return [l, r];
      }
    };
  }

  // --- start ---------------------------------------------------------------
  async function start(url, inRate) {
    if (S.live) return S.mode;
    IN_RATE = inRate || IN_RATE_DEFAULT;   // ESP barn mic pushes 48 k
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API not supported in this browser');

    let ctx;
    try { ctx = new AC({ sampleRate: IN_RATE }); }
    catch (e) { ctx = new AC(); }
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) {}
    }

    let node = null, mode = null, fifo = null;
    const workletUsable = API.secure() && !!ctx.audioWorklet &&
      typeof window.AudioWorkletNode === 'function';
    if (workletUsable) {
      try {
        await ctx.audioWorklet.addModule('/static/pcm-worklet.js');
        node = new window.AudioWorkletNode(ctx, 'mic-stream', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
          processorOptions: { inRate: IN_RATE, preroll: PREROLL }
        });
        mode = 'worklet';
      } catch (e) { node = null; }
    }
    if (!node) {
      if (typeof ctx.createScriptProcessor !== 'function') {
        try { ctx.close(); } catch (e) {}
        throw new Error(API.secure()
          ? 'no audio processor available (AudioWorklet failed and ScriptProcessorNode is missing)'
          : 'AudioWorklet needs a secure context (HTTPS or localhost) and ScriptProcessorNode is missing');
      }
      fifo = makeFifo(IN_RATE / ctx.sampleRate);
      node = ctx.createScriptProcessor(4096, 1, 2);
      const f = fifo;
      node.onaudioprocess = (ev) => {
        S.spFrames++;
        const outL = ev.outputBuffer.getChannelData(0);
        const outR = ev.outputBuffer.numberOfChannels > 1
          ? ev.outputBuffer.getChannelData(1) : null;
        for (let i = 0; i < outL.length; i++) {
          const fr = f.frame();
          const m = (fr[0] + fr[1]) * 0.5;  // both ears (single mic = one slot)
          outL[i] = m;
          if (outR) outR[i] = m;
        }
      };
      mode = 'script-processor';
    }
    // Route through a gain node so the 🔊/🔇 toggle can mute without
    // stopping the stream (S.gain survives across start/stop of one ctx).
    if (!S.gain || S.gain.context !== ctx) {
      S.gain = ctx.createGain();
      S.gain.connect(ctx.destination);
    }
    S.gain.gain.value = S.muted ? 0 : 1;
    node.connect(S.gain);

    let res;
    try {
      res = await fetch(url || '/esp/stream', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.text()) || ('HTTP ' + res.status));
    } catch (e) {
      try { node.disconnect(); } catch (x) {}
      try { node.onaudioprocess = null; } catch (x) {}
      try { ctx.close(); } catch (x) {}
      throw e;
    }

    S.ctx = ctx; S.node = node; S.fifo = fifo;
    S.reader = res.body.getReader();
    S.mode = mode; S.live = true; S.spFrames = 0;
    if (API.onMode) API.onMode(mode);
    pump();
    return mode;
  }

  async function pump() {
    try {
      while (S.live) {
        const { value, done } = await S.reader.read();
        if (done) break;
        if (S.mode === 'worklet') {
          S.node.port.postMessage(value.buffer, [value.buffer]);
        } else if (S.fifo && value.byteLength >= 4) {
          S.fifo.push(new Int16Array(
            value.buffer, value.byteOffset, value.byteLength >> 1));
        }
      }
    } catch (e) { /* stream closed or server went away */ }
    if (S.live) stop(true);
  }

  function stop(notifyEnded) {
    S.live = false;
    try { S.reader && S.reader.cancel(); } catch (e) {}
    S.reader = null;
    try { S.node && S.node.disconnect(); } catch (e) {}
    try { S.node && (S.node.onaudioprocess = null); } catch (e) {}
    S.node = null; S.fifo = null;
    try { S.ctx && S.ctx.close(); } catch (e) {}
    S.ctx = null;
    S.mode = null;
    if (API.onMode) API.onMode(null);
    if (notifyEnded && API.onEnded) API.onEnded();
  }

  // Diagnostic: prove which path is active and that it actually renders.
  // worklet mode asks the processor thread for its frame counter (it only
  // increments inside process(), i.e. only if audio is really rendering).
  function workletStats(timeoutMs) {
    return new Promise((resolve) => {
      if (!S.node || !S.node.port) return resolve(null);
      let done = false;
      const finish = (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
      const t = setTimeout(() => finish(null), timeoutMs || 600);
      S.node.port.onmessage = (ev) => {
        if (ev.data && ev.data.cmd === 'stats-reply') finish(ev.data);
      };
      S.node.port.postMessage({cmd: 'stats'});
    });
  }

  API.stats = async function () {
    const base = {
      live: S.live, mode: S.mode, secure: API.secure(),
      inRate: IN_RATE,                 // input rate start() was given
      ctxState: S.ctx ? S.ctx.state : null,
      spFrames: S.spFrames, wFrames: null, underruns: null
    };
    if (S.live && S.mode === 'worklet') {
      const r = await workletStats();
      if (r) { base.wFrames = r.frames; base.underruns = r.underruns; }
    }
    return base;
  };

  API.start = start;
  API.stop = stop;
  return API;
})();

window.PigPulseMic = PigPulseMic;
