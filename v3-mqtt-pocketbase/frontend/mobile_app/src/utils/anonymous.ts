/**
 * Anonymous identity for the demoted research log.
 *
 * Research-ethics rule for this track: the UI never shows a pig name. A record
 * is identified by its `P-####` code when the backend stored one, otherwise by
 * a deterministic code derived from the PocketBase record id.
 *
 * Deterministic matters: a hash that changes between renders would make the
 * same animal look like two. FNV-1a is stable, dependency-free, and good enough
 * for a 4-digit display code.
 */

const DECLARED_CODE = /^P-\d{1,6}$/;

/** FNV-1a 32-bit — stable, no dependencies. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Display code for a roster record.
 * - honours an already-anonymous `pigId` (P-1 … P-999999)
 * - otherwise derives `P-####` from the record id
 * A stored human name is never read, so it can never leak into the UI.
 */
export function anonymousCode(record: { id?: unknown; pigId?: unknown }): string {
  const declared = String(record.pigId ?? '').trim().toUpperCase();
  if (DECLARED_CODE.test(declared)) return declared;

  const seed = String(record.id ?? '').trim();
  if (!seed) return 'P-0000';
  return `P-${String(fnv1a(seed) % 10000).padStart(4, '0')}`;
}
