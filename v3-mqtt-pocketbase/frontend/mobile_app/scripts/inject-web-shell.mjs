/**
 * Post-export: patch dist/index.html with the two document-level declarations
 * Expo Router's SPA export does not let us template (it ignores `+html.tsx`
 * when `web.output` is `single`).
 *
 * 1. `<meta name="color-scheme" content="only light">` + a matching CSS rule.
 *    This is the documented opt-out of the browser's *automatic* dark mode
 *    (Chromium Auto Dark Mode; on Brave for Android it is
 *    Settings → Appearance → Night mode). Without it a browser can re-darken
 *    our own light theme, which on a phone looks like "white page, black
 *    translucent panels" while the same build is correct in Firefox.
 *
 * 2. An explicit canvas colour on html/body. Previously they had no background
 *    at all, so every pixel React did not paint fell through to the browser
 *    default — white. That is the white that shows through dark panels.
 *
 * Idempotent: running it twice changes nothing. If the markers are already
 * present it exits 0 without touching the file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = join(here, '..', 'dist', 'index.html');

if (!existsSync(indexPath)) {
  console.error(`inject-web-shell: no ${indexPath} — run expo export first`);
  process.exit(1);
}

const MARK = 'pigpulse-document-shell';
let html = readFileSync(indexPath, 'utf8');

if (html.includes(MARK)) {
  console.log('inject-web-shell: already applied');
  process.exit(0);
}

const head = [
  `<meta name="color-scheme" content="only light">`,
  `<meta name="pigpulse-build" content="${new Date().toISOString()}">`,
  `<style id="${MARK}">`,
  'html,body{height:100%;background-color:#121314;color-scheme:only light}',
  '@media (prefers-color-scheme:light){html,body{background-color:#F2F6F1}}',
  'body{overflow:hidden}',
  '#root{display:flex;height:100%;flex:1}',
  '</style>',
].join('');

// Keep <meta charset> first: it must appear within the first 1024 bytes for the
// document to be decoded correctly.
const charset = html.match(/<meta\s+charset=["']?utf-8["']?\s*\/?>/i);
if (charset) {
  html = html.replace(charset[0], charset[0] + head);
} else if (/<head[^>]*>/i.test(html)) {
  html = html.replace(/<head([^>]*)>/i, `<head$1>${head}`);
} else {
  console.error('inject-web-shell: no <head> in index.html — refusing to guess');
  process.exit(1);
}

// The generated reset duplicates the layout rules we just wrote; harmless, but
// keeping one copy avoids two sources of truth drifting apart.
html = html.replace(/<style id="expo-reset">[\s\S]*?<\/style>/, '');

writeFileSync(indexPath, html);
console.log(`inject-web-shell: patched ${indexPath}`);
