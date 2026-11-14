/**
 * Reviewed, deterministic OFFLINE help (B4 foundation).
 *
 * This is NOT a model and performs no I/O. It returns fixed, human-reviewed
 * general guidance selected by simple keyword routing. It must never fabricate
 * live farm data, declare a herd "all clear", or offer a diagnosis. Every reply
 * therefore appends a vet-referral line and a limitation notice.
 */

export interface OfflineHelpTopic {
  id: string;
  keywords: string[];
  text: string;
}

/**
 * Present on every reply. States plainly that this is reviewed guidance, not a
 * model, cannot see the farm's data, and is not a diagnosis.
 */
export const OFFLINE_HELP_NOTICE =
  'Offline help is reviewed general guidance. It is not an AI model, it cannot see your farm data, and it is not a diagnosis.';

const VET_GUIDANCE =
  'For any animal health concern, contact a licensed veterinarian rather than relying on this app.';

/** Reviewed topic table. Order matters: the first keyword match wins. */
export const OFFLINE_HELP_TOPICS: OfflineHelpTopic[] = [
  {
    id: 'temperature',
    keywords: ['temperature', 'fever', 'warm', 'hot', 'thermal', 'heat'],
    text:
      'Temperature here refers to the monitored environment or surface reading, not a clinical body temperature. A single reading is affected by sensor placement, airflow and contact. Record several readings over time and compare against your own normal range before drawing any conclusion.',
  },
  {
    id: 'respiratory',
    keywords: ['cough', 'respirat', 'breath', 'sneeze', 'lung', 'wheeze'],
    text:
      'Coughing or breathing signs can have many causes, from dust and ventilation to infection. Environment quality, stocking density and air movement all matter. Keep a written log of when and how often the sign occurs; a repeated pattern is worth a professional look.',
  },
  {
    id: 'sensors',
    keywords: ['sensor', 'connect', 'node', 'device', 'setup', 'install', 'pair'],
    text:
      'Each monitoring node reports its own device id, firmware and signal. Check that the node is powered, in range, and that its last timestamp is recent; an old timestamp means the reading is stale. If a node reports nothing, treat that gap as unknown rather than healthy.',
  },
  {
    id: 'offline',
    keywords: ['offline', 'without internet', 'no internet', 'cloud', 'local mode'],
    text:
      'Offline help needs no internet and never contacts a server. Local and cloud AI are separate, optional destinations that must each be explicitly enabled and consented to; nothing falls back to them on its own.',
  },
  {
    id: 'roster',
    keywords: ['add pig', 'pig', 'enroll', 'roster', 'animal', 'register'],
    text:
      'Animals are managed from the Roster. Adding or editing a record only stores local information about that animal; it does not measure or interpret any health signal by itself.',
  },
];

const FALLBACK_TOPIC: OfflineHelpTopic = {
  id: 'general',
  keywords: [],
  text:
    'I can only offer general, reviewed guidance offline. Tell me which area you need help with — temperature, respiratory signs, sensors, working offline, or the roster — and I will share the reviewed notes for it.',
};

/**
 * Deterministic keyword routing. Unknown or empty input returns the same
 * general fallback. Output is stable for a given input.
 */
export function getOfflineHelp(query: unknown): string {
  const text = typeof query === 'string' ? query.toLowerCase() : '';
  const topic = OFFLINE_HELP_TOPICS.find((entry) => entry.keywords.some((keyword) => text.includes(keyword))) ?? FALLBACK_TOPIC;
  return `${topic.text}\n\n${VET_GUIDANCE}\n\n${OFFLINE_HELP_NOTICE}`;
}
