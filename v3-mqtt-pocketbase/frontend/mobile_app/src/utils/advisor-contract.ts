/**
 * Pure, dependency-free advisor request/reply contract (B4 foundation).
 *
 * NOTE: this module is an isolated foundation. It is NOT wired into the app,
 * does NOT start any model or provider, and performs no I/O. It defines only
 * the typed, validated shape of a request and a reply so that any future
 * transport can be bounded and reviewed independently.
 *
 * Design rules baked in here:
 *  - A strict field allowlist means a caller cannot smuggle a provider secret
 *    (`apiKey`) or a proxy URL (`providerUrl`/`endpoint`) through the request.
 *  - Only `user`/`assistant` roles are accepted; a caller-supplied `system`
 *    role (prompt injection) is rejected.
 *  - There is NO opaque `context`/payload field in this foundation. Any farm
 *    context must be expressible as validated `messages`, so the contract never
 *    carries an unbounded, mutable, possibly cyclic object to a transport.
 */

export const ADVISOR_CONTRACT_VERSION = 1 as const;

export const ADVISOR_MODES = ['offline', 'local', 'cloud'] as const;
export type AdvisorMode = (typeof ADVISOR_MODES)[number];

/**
 * PROPOSED limits — exported so callers and reviews can disclose/tune them.
 * They are a documented starting point for bounding work, NOT a claim that any
 * production server enforces these values. Server-side enforcement is a
 * separate, still-blocked integration.
 */
export const ADVISOR_LIMITS = {
  maxMessages: 10,
  maxMessageChars: 2000,
  maxTotalChars: 8000,
  maxReplyChars: 8000,
} as const;

export type AdvisorRole = 'user' | 'assistant';

export interface AdvisorMessage {
  role: AdvisorRole;
  content: string;
}

export interface AdvisorRequest {
  mode: AdvisorMode;
  messages: AdvisorMessage[];
}

export type AdvisorErrorCode =
  | 'disabled'
  | 'unavailable'
  | 'invalid'
  | 'auth'
  | 'rate'
  | 'timeout'
  | 'cancelled'
  | 'upstream';

export interface AdvisorError {
  code: AdvisorErrorCode;
  message: string;
}

export type AdvisorRequestResult = { ok: true; request: AdvisorRequest } | { ok: false; error: AdvisorError };
export type AdvisorReplyResult = { ok: true; reply: string } | { ok: false; error: AdvisorError };

export function isAdvisorMode(value: unknown): value is AdvisorMode {
  return typeof value === 'string' && (ADVISOR_MODES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): AdvisorRequestResult {
  return { ok: false, error: { code: 'invalid', message } };
}

const REQUEST_FIELDS = ['mode', 'messages'];
const MESSAGE_FIELDS = ['role', 'content'];

/**
 * Validate an untrusted request into a bounded `AdvisorRequest`.
 * Returns a stable error code on any problem; never throws.
 */
export function validateAdvisorRequest(input: unknown): AdvisorRequestResult {
  if (!isPlainObject(input)) return invalid('A request object is required.');

  for (const key of Object.keys(input)) {
    if (!REQUEST_FIELDS.includes(key)) return invalid(`Unknown request field: ${key}`);
  }

  if (!isAdvisorMode(input.mode)) return invalid('A known mode is required.');

  const rawMessages = input.messages;
  if (!Array.isArray(rawMessages)) return invalid('messages must be an array.');
  if (rawMessages.length === 0) return invalid('At least one message is required.');
  if (rawMessages.length > ADVISOR_LIMITS.maxMessages) return invalid('Too many messages.');

  const messages: AdvisorMessage[] = [];
  let totalChars = 0;
  for (const raw of rawMessages) {
    if (!isPlainObject(raw)) return invalid('Each message must be an object.');
    for (const key of Object.keys(raw)) {
      if (!MESSAGE_FIELDS.includes(key)) return invalid(`Unknown message field: ${key}`);
    }
    if (raw.role !== 'user' && raw.role !== 'assistant') {
      return invalid('A message role must be user or assistant.');
    }
    if (typeof raw.content !== 'string') return invalid('Message content must be text.');
    const content = raw.content.trim();
    if (content.length === 0) return invalid('Message content must not be blank.');
    if (content.length > ADVISOR_LIMITS.maxMessageChars) return invalid('A message is too long.');
    totalChars += content.length;
    messages.push({ role: raw.role, content });
  }
  if (totalChars > ADVISOR_LIMITS.maxTotalChars) return invalid('The combined messages are too long.');

  return { ok: true, request: { mode: input.mode, messages } };
}

/**
 * Validate an untrusted reply body. Only a nonempty, bounded string is
 * accepted; anything else is an `upstream` error (never a fabricated reply).
 */
export function validateAdvisorReply(input: unknown): AdvisorReplyResult {
  const fail = (message: string): AdvisorReplyResult => ({ ok: false, error: { code: 'upstream', message } });
  if (!isPlainObject(input)) return fail('A reply object is required.');
  const reply = input.reply;
  if (typeof reply !== 'string') return fail('Reply must be text.');
  const trimmed = reply.trim();
  if (trimmed.length === 0) return fail('Reply was blank.');
  if (trimmed.length > ADVISOR_LIMITS.maxReplyChars) return fail('Reply is too large.');
  return { ok: true, reply: trimmed };
}
