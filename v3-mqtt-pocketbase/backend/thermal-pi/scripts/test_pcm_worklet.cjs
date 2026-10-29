const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let Processor;
const context = { sampleRate:48000, ArrayBuffer, Int16Array,
  AudioWorkletProcessor:class {constructor(){this.port={postMessage(){}};}},
  registerProcessor(_name, cls){Processor=cls;} };
vm.runInNewContext(fs.readFileSync(`${__dirname}/../static/pcm-worklet.js`,'utf8'),context);
const p = new Processor({processorOptions:{preroll:8}});
const render = n => {const out = new Float32Array(n);p.process([],[[out,new Float32Array(n)]]);return out;};
p.push(new Int16Array(8).fill(1000));render(4);
const silence = render(4); // exhausted input must not replay the old buffer
assert.ok(silence.every(v=>v===0), 'underrun must output silence, not repeat stale audio');
p.push(new Int16Array(8).fill(2000));
assert.ok(render(4).some(v=>v>0), 'audio must resume after underrun, not stay silent on trimmed data');
console.log('PASS: worklet recovers after underrun');
