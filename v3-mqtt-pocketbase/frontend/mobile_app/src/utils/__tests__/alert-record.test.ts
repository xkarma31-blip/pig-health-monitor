/**
 * Behavioral tests for the pure Alerts record classifier (B5).
 *
 * Regression focus:
 *   - MIC_DISCONNECTED (and other device/system rows) must NOT be classified
 *     "thermal" by substring guessing.
 *   - An unrecognised or missing type must stay visible as `unknown`, never be
 *     silently promoted to thermal.
 *   - An unrecognised severity is retained visibly, not guessed.
 *
 * Pure module — run with the repo's installed tsx, no app/React imports:
 *   node_modules/.bin/tsx src/utils/__tests__/alert-record.test.ts
 */
import {
  classifyKind,
  classifySeverity,
  mapAlert,
  alertMessage,
  kindLabel,
  typeDisplay,
} from '../alert-record';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── classifyKind ───────────────────────────────────────────────────
expectEq(classifyKind('MIC_DISCONNECTED').kind, 'system', 'MIC_DISCONNECTED is system');
expectEq(classifyKind('mic disconnected').kind, 'system', 'spaced mic disconnect is system');
expectEq(classifyKind('device_offline').kind, 'system', 'device_offline is system');
expectEq(classifyKind('node_fault').kind, 'system', 'node_fault is system');
expectEq(classifyKind('thermal').kind, 'thermal', 'thermal stays thermal');
expectEq(classifyKind('temperature').kind, 'thermal', 'temperature stays thermal');
expectEq(classifyKind('sound').kind, 'sound', 'sound is sound');
expectEq(classifyKind('cough').kind, 'sound', 'cough is sound');
// No guessing: unknown/missing must not become thermal.
expectEq(classifyKind('banana').kind, 'unknown', 'unrecognised type stays unknown');
expectEq(classifyKind('').kind, 'unknown', 'empty type stays unknown');
expectEq(classifyKind(undefined).kind, 'unknown', 'missing type stays unknown');
// Raw token is preserved for display.
expectEq(classifyKind('banana').token, 'banana', 'unknown raw token preserved');
expectEq(classifyKind('MIC_DISCONNECTED').token, 'MIC_DISCONNECTED', 'system raw token preserved');

// ── classifySeverity ───────────────────────────────────────────────
expectEq(classifySeverity('CRITICAL').status, 'alert', 'CRITICAL is alert');
expectEq(classifySeverity('critical').label, 'Critical', 'CRITICAL label');
expectEq(classifySeverity('WARNING').status, 'watch', 'WARNING is watch');
expectEq(classifySeverity('info').status, 'info', 'info is info');
expectEq(classifySeverity('CRITICAL').recognized, true, 'CRITICAL recognised');
// Unrecognised non-empty severity retained visibly, never guessed.
expectEq(classifySeverity('BANANA').recognized, false, 'BANANA not recognised');
expectEq(classifySeverity('BANANA').status, 'info', 'unrecognised severity shown as info severity');
expectEq(classifySeverity('BANANA').label, 'Unknown (BANANA)', 'unrecognised severity label retained');
// Missing severity is unclassified, not asserted as info-classified.
expectEq(classifySeverity(undefined).recognized, false, 'missing severity not recognised');
expectEq(classifySeverity(undefined).label, 'Unclassified', 'missing severity label');

// ── alertMessage ───────────────────────────────────────────────────
expectEq(alertMessage({ message: 'Fever at pen A' }), 'Fever at pen A', 'message preferred');
expectEq(alertMessage({ description: 'desc' }), 'desc', 'description fallback');
expectEq(alertMessage({ title: 'title' }), 'title', 'title fallback');
expectEq(alertMessage({ type: 'thermal' }), 'thermal event recorded', 'type fallback');
expectEq(alertMessage({}), 'Alert recorded', 'generic fallback');

// ── mapAlert ───────────────────────────────────────────────────────
const mic = mapAlert('a1', { type: 'MIC_DISCONNECTED', severity: 'CRITICAL', message: 'Mic lost' });
expectEq(mic.kind, 'system', 'mapAlert MIC_DISCONNECTED kind system');
expectEq(mic.status, 'alert', 'mapAlert CRITICAL status alert');
expectEq(mic.label, 'Critical', 'mapAlert label');
expectEq(mic.typeToken, 'MIC_DISCONNECTED', 'mapAlert retains type token');
expectEq(mic.message, 'Mic lost', 'mapAlert message');

const unknownRow = mapAlert('a2', { severity: 'BANANA' });
expectEq(unknownRow.kind, 'unknown', 'mapAlert missing type stays unknown not thermal');
expectEq(unknownRow.severityRecognized, false, 'mapAlert unknown severity flag');

// ── kindLabel / typeDisplay — the type is rendered, raw token included ──
// The Alerts screen must show the event kind/type, not hide it behind a badge.
expectEq(kindLabel('thermal'), 'Thermal', 'thermal kind label');
expectEq(kindLabel('sound'), 'Sound', 'sound kind label');
expectEq(kindLabel('system'), 'System', 'system kind label');
expectEq(kindLabel('unknown'), 'Unknown', 'unknown kind label');

expectEq(typeDisplay(mic), 'System · MIC_DISCONNECTED', 'system type display shows raw token');
const unknownTyped = mapAlert('a3', { type: 'banana' });
expectEq(typeDisplay(unknownTyped), 'Unknown · banana', 'unknown type display keeps raw token');
expectEq(typeDisplay(unknownTyped).includes('banana'), true, 'unrecognised raw token is visible');
expectEq(typeDisplay(mapAlert('a4', {})), 'Unknown', 'missing type display has no raw token');

if (failures > 0) {
  report(`${failures} alert-record assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('alert-record: all assertions passed');
