/**
 * Behavioral tests for reviewed offline help (B4).
 *
 * RED-first: imports a module that does not exist yet. Plain import-time
 * assertions, run with canonical local tsx.
 *
 * Guarantees under test: deterministic general guidance that never fabricates
 * live data, never declares a herd "all clear", never diagnoses, never claims
 * to be a model, and always discloses its limits + vet guidance.
 */
import { getOfflineHelp, OFFLINE_HELP_NOTICE, OFFLINE_HELP_TOPICS } from '../offline-advisor';

let failures = 0;
const report = (...args: unknown[]) => console.error(...args);
function expectTrue(value: boolean, label: string) {
  if (!value) {
    failures += 1;
    report(`FAIL ${label}`);
  }
}

// Forbidden fabrications: a deterministic offline helper cannot know these.
const FORBIDDEN = [
  'all clear',
  'all-clear',
  'no alerts',
  'no active alerts',
  'your herd is',
  'i can see your',
  'i can see the',
  'as an ai',
  'i am the model',
  'my diagnosis',
  'you should dose',
];

const queries = [
  '',
  'hi',
  'help',
  'what can you do',
  'temperature',
  'is my pig feverish?',
  'coughing',
  'respiratory',
  'sensor setup',
  'how do I connect a node',
  'work offline',
  'cloud',
  'add pig',
  'enroll',
  'any alerts?',
  'how is my herd doing?',
  'random unknown question zzz',
];

for (const q of queries) {
  const reply = getOfflineHelp(q);
  expectTrue(typeof reply === 'string' && reply.trim().length > 0, `reply nonempty for ${JSON.stringify(q)}`);
  expectTrue(reply.includes(OFFLINE_HELP_NOTICE), `reply discloses offline limitation for ${JSON.stringify(q)}`);
  expectTrue(reply.toLowerCase().includes('veterinarian'), `reply points to a veterinarian for ${JSON.stringify(q)}`);
  const lower = reply.toLowerCase();
  for (const bad of FORBIDDEN) {
    expectTrue(!lower.includes(bad), `reply avoids "${bad}" for ${JSON.stringify(q)}`);
  }
  expectTrue(getOfflineHelp(q) === reply, `reply deterministic for ${JSON.stringify(q)}`);
}

// Distinct topics route to distinct reviewed text; unknown input falls back.
const distinct = new Set(
  ['temperature', 'coughing', 'sensor setup', 'work offline', 'add pig', 'random unknown zzz'].map(getOfflineHelp),
);
expectTrue(distinct.size >= 4, `distinct queries reach distinct reviewed topics (got ${distinct.size})`);
expectTrue(
  getOfflineHelp('random unknown zzz') === getOfflineHelp(''),
  'unknown input shares the general fallback',
);
expectTrue(OFFLINE_HELP_TOPICS.length >= 5, 'reviewed topic table is populated');
expectTrue(OFFLINE_HELP_TOPICS.every((t) => t.id && t.keywords.length > 0 && t.text.length > 0), 'topic table entries complete');

// The notice itself must state it is not a model and not a diagnosis.
const notice = OFFLINE_HELP_NOTICE.toLowerCase();
expectTrue(notice.includes('not') && (notice.includes('model') || notice.includes('ai')), 'notice disclaims being a model');
expectTrue(notice.includes('diagnos'), 'notice disclaims diagnosis');

if (failures > 0) {
  report(`${failures} advisor-offline assertion(s) failed`);
  process.exit(1);
}
console.log('advisor-offline: all assertions passed');
