/**
 * Behavioral tests for signed-in write policy. Plain import-time assertions.
 */
import { pigWritePayload, requireWriteToken } from '../pig-write-policy';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const user = { id: 'user-123', token: 'tok_123', admin: false };

// Anonymous writes are refused before any fetch.
expectEq(requireWriteToken(null), null, 'anonymous token');
expectEq(requireWriteToken({ id: 'u', token: '', admin: false }), null, 'empty token');

// Admin-session writes are refused on the end-user roster path.
expectEq(requireWriteToken({ id: 'a', token: 'tok_admin', admin: true }), null, 'admin token');

// A signed-in end user can write and the payload carries their owner id.
expectEq(requireWriteToken(user), 'tok_123', 'user token');
const payload = pigWritePayload('  Sow 04  ', user);
expectEq(payload.ownerId, 'user-123', 'owner id');
expectEq(payload.name, 'Sow 04', 'trimmed name');
expectEq(payload.healthStatus, 'NORMAL', 'default health');
expectEq(Array.isArray(payload.tags), true, 'tags array');

if (failures === 0) {
  // eslint-disable-next-line no-console
  console.log('pig-write-policy: 8 assertions passed');
} else {
  process.exitCode = 1;
}
