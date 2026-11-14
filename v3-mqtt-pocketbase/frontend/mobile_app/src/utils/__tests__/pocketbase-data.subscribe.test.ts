/**
 * Typed entry point for the B5 PocketBase subscriber ordering matrix.
 *
 * The ACTUAL request-ordering / error / unsubscribe behaviour of the real
 * `../pocketbase-data.ts` is exercised by a minimal in-process vm/transpile
 * harness with a synthetic PB transport. That harness needs `node:` builtins
 * (`fs` / `path` / `vm` / `assert` / `module`), which the canonical Expo
 * tsconfig cannot type-check: the app ships no `@types/node`, so a `.ts` file
 * importing them reports TS2591 under `check-app-overlay.cjs overlay`.
 *
 * To stay honest AND diagnostic-free we use the same split as lane B8: the
 * harness lives in the sibling CommonJS companion
 * `pocketbase-data.subscribe.test.cjs` (`allowJs: true`, `checkJs` unset ⇒ no
 * semantic diagnostics), and this file is a thin, dependency-free typed entry
 * that pulls that harness in. Both paths run the SAME matrix against the REAL
 * module — nothing is skipped.
 *
 * Bug this pins (reviewer + parent adapter probe):
 *   Two realtime-triggered reads can be in flight at once. If the OLDER request
 *   settles last, it must not overwrite the NEWER result — on success OR on
 *   failure. Superseded reads are ignored; only the newest in-flight read wins.
 *
 * Run with the repo's installed tsx (needs the canonical app's `typescript`):
 *   ./node_modules/.bin/tsx <this file>
 * or the harness directly:
 *   node <this file's .cjs sibling>
 *
 * The canonical app path is only used to locate the TypeScript compiler — the
 * module under test is the candidate file next to this test. The harness
 * resolves that compiler portably (env `PIGPULSE_APP_DIR` → cwd → walk-up).
 */
import './pocketbase-data.subscribe.test.cjs';
