/** Bounded reachability probes for the local hotspot and the Pi's tunnel. */

async function healthOk(base: string | null | undefined, timeoutMs = 2500): Promise<boolean> {
  const clean = (base ?? '').trim().replace(/\/+$/, '');
  if (!clean) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${clean}/api/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { code?: number };
    return body.code === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface AccessReachability {
  local: boolean;
  remote: boolean;
}

/** Probe both paths in parallel; neither failure may throw into the caller. */
export async function probeAccess(localBase: string | null | undefined, remoteBase: string | null | undefined): Promise<AccessReachability> {
  const [local, remote] = await Promise.all([
    healthOk(localBase),
    healthOk(remoteBase),
  ]);
  return { local, remote };
}
