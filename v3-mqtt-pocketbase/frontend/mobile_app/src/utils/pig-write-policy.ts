/**
 * Signed-in write policy for end-user herd records.
 *
 * Reads (including skip/guest mode) stay open. Writes require a real
 * end-user session and stamp the owner id into the record so PocketBase rules
 * can enforce ownership server-side.
 */

export interface WriteIdentity {
  id: string;
  token: string;
  admin: boolean;
}

/** Return the bearer token for an allowed write, or null for anonymous/admin. */
export function requireWriteToken(user: WriteIdentity | null | undefined): string | null {
  if (!user || user.admin || !user.id || !user.token) return null;
  return user.token;
}

export type PigWritePayload = Record<string, unknown> & {
  pigId: string;
  name: string;
  healthStatus: string;
  tags: string[];
  ownerId: string;
};

/** Build a pig create payload with a stable owner id and trimmed name. */
export function pigWritePayload(name: string, user: WriteIdentity): PigWritePayload {
  return {
    pigId: `pig-${Date.now().toString(36)}`,
    name: name.trim(),
    healthStatus: 'NORMAL',
    tags: [],
    ownerId: user.id,
  };
}
