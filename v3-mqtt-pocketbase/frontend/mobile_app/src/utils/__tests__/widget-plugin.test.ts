/**
 * Config-plugin + native-generation tests for the PigPulse Android widget.
 *
 * These tests exercise the Expo config plugin the way prebuild does: they
 * compile the plugin's `android.manifest` and `android.dangerous` mods by hand
 * against a throwaway project root, then assert what the plugin produces.
 *
 * Locked behaviours:
 *   - the receiver is the only widget receiver, is not exported, carries the
 *     APPWIDGET_UPDATE intent filter and the android.appwidget.provider
 *     metadata nested INSIDE the receiver;
 *   - prebuild generates the Kotlin provider, the provider-info XML, the
 *     RemoteViews layout and the two official logo drawables byte-for-byte;
 *   - introspection writes nothing to disk;
 *   - the generated Kotlin/XML keep the honesty contract (exact state file
 *     name, recomputed freshness, FileObserver, no units, no polling loop);
 *   - the RemoteViews layout uses only RemoteViews-supported views and keeps
 *     every text size at or above 16sp.
 *
 * Plain tsx, no test framework — same convention as widget-state.test.ts:
 *   node_modules/.bin/tsx src/utils/__tests__/widget-plugin.test.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the app ships no
   @types/node, so the Node builtins are borrowed through the ambient
   `require` exactly as src/utils/__tests__/pcm-frames.test.ts does. */

// ── dependency-free Node surface (no `node:*` imports, no blanket `any`) ───
interface NodeBuffer {
  equals(other: NodeBuffer): boolean;
}
interface NodeFs {
  readFileSync(file: string, encoding: string): string;
  readFileSync(file: string): NodeBuffer;
  existsSync(file: string): boolean;
  mkdirSync(dir: string, options?: { recursive?: boolean }): void;
  mkdtempSync(prefix: string): string;
  rmSync(target: string, options?: { recursive?: boolean; force?: boolean }): void;
}
interface NodeOs {
  tmpdir(): string;
}
interface NodePath {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  dirname(part: string): string;
  relative(from: string, to: string): string;
}

declare const __dirname: string;

const fs = require('node:fs') as unknown as NodeFs;
const os = require('node:os') as unknown as NodeOs;
const path = require('node:path') as unknown as NodePath;

const RECEIVER = 'com.solrahk.pighealthmonitor.widget.PigPulseWidgetProvider';
const PROVIDER_INFO_RESOURCE = '@xml/pigpulse_widget_info';
const STATE_FILE_NAME = 'pigpulse_widget_state.json';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function check(condition: boolean, label: string) {
  if (!condition) {
    failures += 1;
    report(`FAIL ${label}`);
  }
}
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const PLUGIN_PATH = path.join(PROJECT_ROOT, 'plugins', 'withPigPulseWidget.js');
const TEMPLATE_DIR = path.join(PROJECT_ROOT, 'plugins', 'pigpulse-widget');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');

const KOTLIN_REL = path.join(
  'app', 'src', 'main', 'java',
  'com', 'solrahk', 'pighealthmonitor', 'widget',
  'PigPulseWidgetProvider.kt',
);

const REMOTEVIEWS_VIEWS = new Set([
  'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout', 'GridView',
  'ListView', 'StackView', 'AdapterViewFlipper', 'AdapterViewAnimator',
  'ScrollView', 'HorizontalScrollView', 'ViewFlipper', 'ViewStub',
  'TextView', 'ImageView', 'Button', 'ImageButton', 'ProgressBar', 'View',
  'Space', 'Chronometer', 'TextClock', 'AnalogClock',
]);

function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

async function main() {
  // ── plugin module ───────────────────────────────────────────────────
  check(fs.existsSync(PLUGIN_PATH), `plugin file exists at ${path.relative(PROJECT_ROOT, PLUGIN_PATH)}`);
  if (!fs.existsSync(PLUGIN_PATH)) {
    report('widget-plugin: plugin module missing; cannot verify generation');
    process.exit(1);
  }
  const withPigPulseWidget = require(PLUGIN_PATH);
  expectEq(typeof withPigPulseWidget, 'function', 'plugin exports a function');

  // ── templates are checked in, not generated ─────────────────────────
  const kotlinTemplate = path.join(TEMPLATE_DIR, 'PigPulseWidgetProvider.kt');
  const infoTemplate = path.join(TEMPLATE_DIR, 'pigpulse_widget_info.xml');
  const layoutTemplate = path.join(TEMPLATE_DIR, 'pigpulse_widget.xml');
  const backgroundLightTemplate = path.join(TEMPLATE_DIR, 'widget_background_light.xml');
  const backgroundDarkTemplate = path.join(TEMPLATE_DIR, 'widget_background_dark.xml');
  const valuesTemplate = path.join(TEMPLATE_DIR, 'widget_values.xml');
  check(fs.existsSync(kotlinTemplate), 'Kotlin provider template is checked in');
  check(fs.existsSync(infoTemplate), 'provider-info XML template is checked in');
  check(fs.existsSync(layoutTemplate), 'RemoteViews layout template is checked in');
  check(fs.existsSync(backgroundLightTemplate), 'light background drawable template is checked in');
  check(fs.existsSync(backgroundDarkTemplate), 'dark background drawable template is checked in');
  check(fs.existsSync(valuesTemplate), 'widget values template is checked in');

  const pluginConfig: any = withPigPulseWidget({
    name: 'Pig Health Monitor',
    slug: 'pig-health-monitor',
    android: { package: 'com.solrahk.pighealthmonitor' },
  });
  check(typeof pluginConfig.mods?.android?.manifest === 'function', 'registers android.manifest mod');
  check(typeof pluginConfig.mods?.android?.dangerous === 'function', 'registers android.dangerous mod');

  // ── manifest mod ────────────────────────────────────────────────────
  const fixtureManifest = {
    manifest: {
      $: {
        'xmlns:android': 'http://schemas.android.com/apk/res/android',
        package: 'com.solrahk.pighealthmonitor',
      },
      application: [
        { $: { 'android:name': '.MainApplication' } },
      ],
    },
  };
  const modRequest = {
    projectRoot: PROJECT_ROOT,
    platformProjectRoot: path.join(PROJECT_ROOT, 'android'),
    platform: 'android',
    introspect: false,
  };

  const manifestOut: any = await pluginConfig.mods.android.manifest({
    ...pluginConfig,
    modRequest,
    modResults: fixtureManifest,
  });

  const application = manifestOut.modResults.manifest.application[0];
  const receivers: any[] = application.receiver ?? [];
  const ours = receivers.filter((r) => r.$ && r.$['android:name'] === RECEIVER);
  expectEq(ours.length, 1, 'exactly one PigPulse receiver is injected');
  if (ours.length === 1) {
    const receiver = ours[0];
    expectEq(receiver.$['android:exported'], 'false', 'receiver is not exported');
    const actions = (receiver['intent-filter'] ?? [])
      .flatMap((filter: any) => filter.action ?? [])
      .map((action: any) => action.$['android:name']);
    check(
      actions.includes('android.appwidget.action.APPWIDGET_UPDATE'),
      'receiver has the APPWIDGET_UPDATE intent filter',
    );
    const metadata = receiver['meta-data'] ?? [];
    const providerMeta = metadata.find(
      (meta: any) => meta.$ && meta.$['android:name'] === 'android.appwidget.provider',
    );
    check(Boolean(providerMeta), 'receiver carries android.appwidget.provider metadata');
    expectEq(
      providerMeta?.$['android:resource'],
      PROVIDER_INFO_RESOURCE,
      'provider metadata points at the generated provider-info XML',
    );
    // The metadata must be nested inside the receiver, not a sibling of it.
    expectEq(
      application['meta-data'] === undefined ||
        (application['meta-data'] ?? []).every(
          (meta: any) => meta.$['android:name'] !== 'android.appwidget.provider',
        ),
      true,
      'provider metadata is not hoisted to <application>',
    );
  }

  // Idempotency: running the manifest mod twice must not duplicate the receiver.
  const manifestAgain: any = await pluginConfig.mods.android.manifest({
    ...pluginConfig,
    modRequest,
    modResults: manifestOut.modResults,
  });
  const receiverCount = (manifestAgain.modResults.manifest.application[0].receiver ?? []).filter(
    (r: any) => r.$ && r.$['android:name'] === RECEIVER,
  ).length;
  expectEq(receiverCount, 1, 'manifest mod is idempotent');

  // ── dangerous mod: generation ───────────────────────────────────────
  const generationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pigpulse-widget-'));
  try {
    const platformRoot = path.join(generationRoot, 'android');
    fs.mkdirSync(platformRoot, { recursive: true });

    await pluginConfig.mods.android.dangerous({
      ...pluginConfig,
      modRequest: { ...modRequest, projectRoot: generationRoot, platformProjectRoot: platformRoot },
    });

    const generated = {
      kotlin: path.join(platformRoot, KOTLIN_REL),
      info: path.join(platformRoot, 'app', 'src', 'main', 'res', 'xml', 'pigpulse_widget_info.xml'),
      layout: path.join(platformRoot, 'app', 'src', 'main', 'res', 'layout', 'pigpulse_widget.xml'),
      lightDrawable: path.join(platformRoot, 'app', 'src', 'main', 'res', 'drawable', 'logo_light.png'),
      darkDrawable: path.join(platformRoot, 'app', 'src', 'main', 'res', 'drawable', 'logo_dark.png'),
      backgroundLight: path.join(platformRoot, 'app', 'src', 'main', 'res', 'drawable', 'widget_background_light.xml'),
      backgroundDark: path.join(platformRoot, 'app', 'src', 'main', 'res', 'drawable', 'widget_background_dark.xml'),
      values: path.join(platformRoot, 'app', 'src', 'main', 'res', 'values', 'widget_values.xml'),
    };

    check(fs.existsSync(generated.kotlin), 'Kotlin provider is generated into the android package');
    check(fs.existsSync(generated.info), 'provider-info XML is generated');
    check(fs.existsSync(generated.layout), 'RemoteViews layout is generated');
    check(fs.existsSync(generated.lightDrawable), 'light logo drawable is copied');
    check(fs.existsSync(generated.darkDrawable), 'dark logo drawable is copied');
    check(fs.existsSync(generated.backgroundLight), 'light background drawable is generated');
    check(fs.existsSync(generated.backgroundDark), 'dark background drawable is generated');
    check(fs.existsSync(generated.values), 'widget values file is generated');

    // Byte-for-byte equality with the checked-in templates / official artwork.
    expectEq(
      readText(generated.kotlin),
      readText(kotlinTemplate),
      'generated Kotlin matches the template byte-for-byte',
    );
    expectEq(
      readText(generated.info),
      readText(infoTemplate),
      'generated provider-info matches the template byte-for-byte',
    );
    expectEq(
      readText(generated.layout),
      readText(layoutTemplate),
      'generated layout matches the template byte-for-byte',
    );
    expectEq(
      readText(generated.backgroundLight),
      readText(backgroundLightTemplate),
      'generated light background matches the template byte-for-byte',
    );
    expectEq(
      readText(generated.backgroundDark),
      readText(backgroundDarkTemplate),
      'generated dark background matches the template byte-for-byte',
    );
    expectEq(
      readText(generated.values),
      readText(valuesTemplate),
      'generated widget values match the template byte-for-byte',
    );
    expectEq(
      fs.readFileSync(generated.lightDrawable).equals(fs.readFileSync(path.join(ASSETS_DIR, 'logo-light.png'))),
      true,
      'light drawable is the official artwork, byte-for-byte',
    );
    expectEq(
      fs.readFileSync(generated.darkDrawable).equals(fs.readFileSync(path.join(ASSETS_DIR, 'logo-dark.png'))),
      true,
      'dark drawable is the official artwork, byte-for-byte',
    );
  } finally {
    fs.rmSync(generationRoot, { recursive: true, force: true });
  }

  // ── dangerous mod: introspection writes nothing ─────────────────────
  const introspectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pigpulse-widget-introspect-'));
  try {
    const platformRoot = path.join(introspectRoot, 'android');
    await pluginConfig.mods.android.dangerous({
      ...pluginConfig,
      modRequest: {
        ...modRequest,
        projectRoot: introspectRoot,
        platformProjectRoot: platformRoot,
        introspect: true,
      },
    });
    check(
      !fs.existsSync(path.join(platformRoot, 'app')),
      'introspection/mod compilation writes nothing to disk',
    );
  } finally {
    fs.rmSync(introspectRoot, { recursive: true, force: true });
  }

  // ── generated Kotlin keeps the honesty contract ─────────────────────
  const kotlin = readText(kotlinTemplate);
  check(kotlin.includes('package com.solrahk.pighealthmonitor.widget'), 'Kotlin package is correct');
  check(
    kotlin.includes('class PigPulseWidgetProvider : AppWidgetProvider()'),
    'Kotlin declares the AppWidgetProvider subclass',
  );
  check(kotlin.includes(`"${STATE_FILE_NAME}"`), 'Kotlin reads the exact state file name');
  check(kotlin.includes('filesDir'), 'Kotlin reads from filesDir');
  check(kotlin.includes('FRESH_MS = 90_000L'), 'Kotlin defines FRESH_MS = 90000');
  check(kotlin.includes('AGING_MS = 300_000L'), 'Kotlin defines AGING_MS = 300000');
  check(kotlin.includes('FUTURE_TOLERANCE_MS = 5_000L'), 'Kotlin defines FUTURE_TOLERANCE_MS = 5000');
  check(kotlin.includes('FileObserver'), 'Kotlin registers a FileObserver');
  check(kotlin.includes('CLOSE_WRITE'), 'Kotlin observes CLOSE_WRITE');
  check(kotlin.includes('MOVED_TO'), 'Kotlin observes MOVED_TO');
  check(kotlin.includes('DELETE'), 'Kotlin observes DELETE');
  check(kotlin.includes('AppWidgetManager'), 'Kotlin updates through AppWidgetManager');
  check(kotlin.includes('updateAppWidget('), 'Kotlin replaces the full widget hierarchy');
  check(kotlin.includes('logo_light'), 'Kotlin selects the light drawable');
  check(kotlin.includes('logo_dark'), 'Kotlin selects the dark drawable');
  check(kotlin.includes('R.drawable.widget_background_light'), 'Kotlin selects the light background drawable');
  check(kotlin.includes('R.drawable.widget_background_dark'), 'Kotlin selects the dark background drawable');
  check(kotlin.includes('R.color.widget_primary_text_light'), 'Kotlin selects the light primary text colour');
  check(kotlin.includes('R.color.widget_primary_text_dark'), 'Kotlin selects the dark primary text colour');
  check(kotlin.includes('R.color.widget_secondary_text_light'), 'Kotlin selects the light secondary text colour');
  check(kotlin.includes('R.color.widget_secondary_text_dark'), 'Kotlin selects the dark secondary text colour');
  check(kotlin.includes('recomputeFreshness'), 'Kotlin recomputes freshness from the sample time');
  // No polling loop and no invented units.
  check(!kotlin.includes('postDelayed'), 'Kotlin has no postDelayed polling loop');
  check(!kotlin.includes('Handler('), 'Kotlin has no Handler polling loop');
  check(!kotlin.includes('°C'), 'Kotlin never appends a temperature unit');
  check(!kotlin.includes('PocketBase'), 'Kotlin never relies on a PocketBase record id');

  // ── generated provider-info XML ─────────────────────────────────────
  const info = readText(infoTemplate);
  check(info.includes('<appwidget-provider'), 'provider-info root element is appwidget-provider');
  check(info.includes('android:updatePeriodMillis="1800000"'), 'updatePeriodMillis is 1800000 (30 min)');
  check(info.includes('@layout/pigpulse_widget'), 'initialLayout points at the widget layout');
  check(info.includes('android:initialLayout'), 'initialLayout attribute present');
  check(info.includes('android:minWidth'), 'minWidth is declared');
  check(info.includes('android:minHeight'), 'minHeight is declared');
  check(info.includes('android:resizeMode'), 'resizeMode is declared');
  check(info.includes('android:widgetCategory'), 'widgetCategory is declared');
  check(info.includes('@drawable/logo_light'), 'preview image uses the copied official drawable');

  // ── generated RemoteViews layout ────────────────────────────────────
  const layout = readText(layoutTemplate);
  const tagNames = Array.from(layout.matchAll(/<([A-Za-z][A-Za-z0-9_.]*)/g)).map((m) => m[1]);
  const uniqueTags = Array.from(new Set(tagNames));
  for (const tag of uniqueTags) {
    check(REMOTEVIEWS_VIEWS.has(tag), `layout view <${tag}> is RemoteViews-supported`);
    check(!tag.includes('.'), `layout does not use a custom view class <${tag}>`);
  }
  const textSizes = Array.from(layout.matchAll(/android:textSize="(\d+)sp"/g)).map((m) => Number(m[1]));
  check(textSizes.length > 0, 'layout declares explicit text sizes');
  for (const size of textSizes) {
    check(size >= 16, `layout text size ${size}sp is at least 16sp`);
  }
  check(layout.includes('android:textStyle="bold"'), 'layout has at least one bold heading');
  check(layout.includes('@drawable/widget_background_dark'), 'layout uses the generated dark background drawable');
  check(layout.includes('@color/widget_primary_text_dark'), 'layout uses generated theme colours');
  check(
    !/android:(?:background|textColor)="#[0-9A-Fa-f]{6,8}"/.test(layout),
    'layout has no hardcoded colour literals',
  );
  const ids = Array.from(layout.matchAll(/android:id="@\+id\/([A-Za-z0-9_]+)"/g)).map((m) => m[1]);
  for (const id of ['widget_root', 'widget_logo', 'widget_device', 'widget_status', 'widget_reading', 'widget_freshness', 'widget_alert']) {
    check(ids.includes(id), `layout defines id ${id}`);
    if (id !== 'widget_root' && id !== 'widget_alert') {
      check(kotlin.includes(`R.id.${id}`), `Kotlin references R.id.${id}`);
    }
  }
  check(kotlin.includes('R.id.widget_root'), 'Kotlin references R.id.widget_root (click target)');
  check(kotlin.includes('R.id.widget_alert'), 'Kotlin references R.id.widget_alert');

  // ── generated native palette ───────────────────────────────────────
  const values = readText(valuesTemplate);
  const appPalette = new Map<string, string>([
    ['widget_background_light', '#FFF2F6F1'],
    ['widget_background_dark', '#FF121314'],
    ['widget_stroke_light', '#FFE3EAE1'],
    ['widget_stroke_dark', '#FF2B2D2F'],
    ['widget_primary_text_light', '#FF1E2A20'],
    ['widget_primary_text_dark', '#FFF2F3F1'],
    ['widget_secondary_text_light', '#FF6B7C6D'],
    ['widget_secondary_text_dark', '#FFA6A9A6'],
    ['widget_status_normal', '#FF2E7D4F'],
    ['widget_status_normal_dark', '#FF3DDC84'],
    ['widget_status_watch', '#FFA9762E'],
    ['widget_status_watch_dark', '#FFD9A05B'],
    ['widget_status_alert', '#FFA14A3C'],
    ['widget_status_alert_dark', '#FFD06B5A'],
    ['widget_status_unknown', '#FF6B7C6D'],
    ['widget_status_unknown_dark', '#FFA6A9A6'],
  ]);
  for (const [name, colour] of appPalette) {
    check(
      values.includes(`<color name="${name}">${colour}</color>`),
      `native colour ${name} uses the app palette value ${colour}`,
    );
  }

  // ── result ──────────────────────────────────────────────────────────
  if (failures > 0) {
    report(`${failures} widget-plugin assertion(s) failed`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('widget-plugin: all assertions passed');
}

main().catch((error) => {
  report('widget-plugin: unexpected error', error);
  process.exit(1);
});
