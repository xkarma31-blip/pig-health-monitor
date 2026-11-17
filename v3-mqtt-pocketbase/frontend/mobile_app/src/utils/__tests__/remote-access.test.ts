/**
 * Behavioral tests for local-first remote access selection.
 * Plain import-time assertions, same convention as source-policy.test.ts.
 */
import { chooseAccessSource } from '../source-policy';

let failures = 0;
let checks = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  checks += 1;
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const local = 'http://192.168.69.1:8090';
const remote = 'http://100.69.139.63:8090';

// LOCAL mode never leaves the hotspot.
expectEq(
  chooseAccessSource({ mode: 'local', localBase: local, remoteBase: remote, localReachable: false, remoteReachable: true }).kind,
  'local',
  'local mode keeps local base',
);

// AUTO prefers local whenever the Pi hotspot answers.
expectEq(
  chooseAccessSource({ mode: 'auto', localBase: local, remoteBase: remote, localReachable: true, remoteReachable: true }).kind,
  'local',
  'auto prefers local',
);

// AUTO uses the encrypted tunnel only when local is truly unreachable.
const tunneled = chooseAccessSource({ mode: 'auto', localBase: local, remoteBase: remote, localReachable: false, remoteReachable: true });
expectEq(tunneled.kind, 'remote', 'auto falls back to remote');
expectEq(tunneled.base, remote, 'remote base used');

// Both unavailable → fail closed with an explicit offline reason.
const offline = chooseAccessSource({ mode: 'auto', localBase: local, remoteBase: remote, localReachable: false, remoteReachable: false });
expectEq(offline.kind, 'offline', 'both unreachable is offline');
expectEq(offline.base, null, 'offline has no base');
if (!/PigPulse|hotspot|offline/i.test(offline.reason)) {
  failures += 1;
  report(`FAIL offline reason is not plain language: ${offline.reason}`);
}

// A malformed remote URL fails closed only when remote is the selected source.
// In local/auto it must never disable a healthy local hotspot path.
const badRemoteSelected = chooseAccessSource({ mode: 'remote', localBase: local, remoteBase: 'ftp://bad', localReachable: false, remoteReachable: true });
expectEq(badRemoteSelected.kind, 'malformed', 'malformed selected remote flagged');
expectEq(badRemoteSelected.base, null, 'malformed selected remote fails closed');

const badRemoteFallbackAuto = chooseAccessSource({ mode: 'auto', localBase: local, remoteBase: 'ftp://bad', localReachable: true, remoteReachable: true });
expectEq(badRemoteFallbackAuto.kind, 'local', 'malformed unused remote does not break local auto');

const badRemoteFallbackLocal = chooseAccessSource({ mode: 'local', localBase: local, remoteBase: 'ftp://bad', localReachable: true, remoteReachable: true });
expectEq(badRemoteFallbackLocal.base, local, 'malformed unused remote ignored in local mode');

// REMOTE mode uses the tunnel when configured and reachable.
expectEq(
  chooseAccessSource({ mode: 'remote', localBase: local, remoteBase: remote, localReachable: true, remoteReachable: true }).kind,
  'remote',
  'remote mode uses tunnel',
);

// REMOTE mode with no remote configured is honest, not local fallback.
expectEq(
  chooseAccessSource({ mode: 'remote', localBase: local, remoteBase: '', localReachable: true, remoteReachable: true }).kind,
  'offline',
  'remote mode without config is offline',
);

if (failures === 0) {
  report(`remote-access: all ${checks} assertions passed`);
} else {
  process.exitCode = 1;
}
