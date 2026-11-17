/**
 * Behavioral tests for the CCTV mode contract. Plain import-time assertions,
 * same convention as the other utils tests.
 */
import { cctvStatus, resolveCctvMode } from '../cctv-control';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// Missing or unknown stored mode falls back to video-only, never silent audio.
expectEq(resolveCctvMode(null), 'video', 'null mode');
expectEq(resolveCctvMode('garbage'), 'video', 'unknown mode');
expectEq(resolveCctvMode('video_audio'), 'video_audio', 'reserved audio mode is preserved');

// OFF must stop polling and never render a stale frame as live.
const off = cctvStatus({ mode: 'off', live: true, base: 'https://192.168.69.1:8080' });
expectEq(off.showFrame, false, 'off hides frame');
expectEq(off.poll, false, 'off stops polling');
expectEq(off.audioAvailable, false, 'off has no audio');

// VIDEO with no frame must name the camera/offline state honestly.
const offline = cctvStatus({ mode: 'video', live: false, base: 'https://192.168.69.1:8080' });
expectEq(offline.showFrame, false, 'offline hides frame');
expectEq(offline.poll, true, 'video polls');
expectEq(offline.audioAvailable, false, 'video has no audio');
if (!/camera|frame/i.test(offline.reason)) {
  failures += 1;
  report(`FAIL offline reason is not plain language: ${offline.reason}`);
}

// A live video frame is showable but does not claim an audio source.
const live = cctvStatus({ mode: 'video', live: true, base: 'https://192.168.69.1:8080' });
expectEq(live.showFrame, true, 'live video shows frame');
expectEq(live.audioAvailable, false, 'live video has no audio');

// VIDEO+AUDIO only becomes available when a recent camera frame proves the
// camera is reachable; the Pi serves /camera-audio from its own RTSP track.
const av = cctvStatus({ mode: 'video_audio', live: true, base: 'https://192.168.69.1:8080' });
expectEq(av.showFrame, true, 'live AV shows frame');
expectEq(av.audioAvailable, true, 'live AV offers camera audio');

if (failures === 0) {
  // eslint-disable-next-line no-console
  console.log('cctv-control: 13 assertions passed');
} else {
  process.exitCode = 1;
}
