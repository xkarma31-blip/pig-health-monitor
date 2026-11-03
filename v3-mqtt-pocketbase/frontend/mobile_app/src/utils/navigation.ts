/**
 * Deep-link-safe back navigation.
 *
 * `router.back()` is a no-op when a screen was opened directly (a fresh tab or
 * a shared URL has no history) — the user taps Back and nothing happens.
 * `goBackOrHome` falls back to a concrete route so every back affordance works.
 */
import { router as expoRouter } from 'expo-router';

export type NavRouter = Pick<typeof expoRouter, 'canGoBack' | 'back' | 'replace'>;

export function goBackOrHome(router: NavRouter, fallback?: Parameters<NavRouter['replace']>[0]): void {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    /* fall through to the fallback route */
  }
  router.replace(fallback ?? '/tabs');
}
