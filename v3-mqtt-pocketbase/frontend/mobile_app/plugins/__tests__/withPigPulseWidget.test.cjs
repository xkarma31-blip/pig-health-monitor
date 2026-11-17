'use strict';

/* eslint-disable @typescript-eslint/no-require-imports -- This Node test is CommonJS. */

/**
 * Generation tests for the PigPulse Android widget config plugin.
 *
 * These tests own the plugin's on-disk contract: prebuild must regenerate the
 * Kotlin provider, the provider-info XML, the RemoteViews layout, the two
 * background drawables and the values file, and must copy the two official
 * logo drawables byte-for-byte. They also pin the manifest shape (the metadata
 * nested INSIDE the receiver) and the introspection side-effect ban.
 *
 * The authoritative end-to-end acceptance test lives beside the app source at
 * `src/utils/__tests__/widget-plugin.test.ts`; run this focused plugin test
 * with:
 *   node --test plugins/__tests__/withPigPulseWidget.test.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const plugin = require('../withPigPulseWidget');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const RECEIVER = 'com.solrahk.pighealthmonitor.widget.PigPulseWidgetProvider';

const GENERATED = {
  kotlin: 'app/src/main/java/com/solrahk/pighealthmonitor/widget/PigPulseWidgetProvider.kt',
  layout: 'app/src/main/res/layout/pigpulse_widget.xml',
  info: 'app/src/main/res/xml/pigpulse_widget_info.xml',
  backgroundLight: 'app/src/main/res/drawable/widget_background_light.xml',
  backgroundDark: 'app/src/main/res/drawable/widget_background_dark.xml',
  values: 'app/src/main/res/values/widget_values.xml',
  logoLight: 'app/src/main/res/drawable/logo_light.png',
  logoDark: 'app/src/main/res/drawable/logo_dark.png',
};

const REMOTEVIEWS_VIEWS = new Set([
  'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout', 'GridView',
  'ListView', 'StackView', 'AdapterViewFlipper', 'AdapterViewAnimator',
  'ScrollView', 'HorizontalScrollView', 'ViewFlipper', 'ViewStub',
  'TextView', 'ImageView', 'Button', 'ImageButton', 'ProgressBar', 'View',
  'Space', 'Chronometer', 'TextClock', 'AnalogClock',
]);

const LAYOUT_IDS = [
  'widget_root', 'widget_logo', 'widget_device', 'widget_status',
  'widget_reading', 'widget_freshness', 'widget_alert',
];

function makeProjectRoot(label) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `pigpulse-widget-${label}-`));
  return base;
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

// Remove Kotlin comments while preserving string/char literals so the
// forbidden-token scan inspects executable code only.
function stripKotlinComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i += 1;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') {
          out += source[i];
          i += 1;
          if (i < source.length) {
            out += source[i];
            i += 1;
          }
          continue;
        }
        out += source[i];
        i += 1;
      }
      if (i < source.length) {
        out += source[i];
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

test('generates every native widget file deterministically and copies official artwork', () => {
  const first = makeProjectRoot('first');
  const second = makeProjectRoot('second');
  try {
    plugin.writePigPulseWidgetFiles(first);
    plugin.writePigPulseWidgetFiles(second);

    for (const relative of Object.values(GENERATED)) {
      const a = path.join(first, relative);
      const b = path.join(second, relative);
      assert.equal(fs.existsSync(a), true, `missing ${relative}`);
      assert.deepEqual(fs.readFileSync(a), fs.readFileSync(b), `non-deterministic ${relative}`);
    }

    // Generated XML/Kotlin must be byte-identical to the checked-in templates.
    const templateDir = path.join(PROJECT_ROOT, 'plugins', 'pigpulse-widget');
    const pairs = [
      ['PigPulseWidgetProvider.kt', GENERATED.kotlin],
      ['pigpulse_widget.xml', GENERATED.layout],
      ['pigpulse_widget_info.xml', GENERATED.info],
      ['widget_background_light.xml', GENERATED.backgroundLight],
      ['widget_background_dark.xml', GENERATED.backgroundDark],
      ['widget_values.xml', GENERATED.values],
    ];
    for (const [template, relative] of pairs) {
      assert.deepEqual(
        fs.readFileSync(path.join(first, relative)),
        fs.readFileSync(path.join(templateDir, template)),
        `${relative} must match its checked-in template`
      );
    }

    assert.deepEqual(
      fs.readFileSync(path.join(first, GENERATED.logoLight)),
      fs.readFileSync(path.join(ASSETS_DIR, 'logo-light.png')),
      'light logo drawable must be the official artwork'
    );
    assert.deepEqual(
      fs.readFileSync(path.join(first, GENERATED.logoDark)),
      fs.readFileSync(path.join(ASSETS_DIR, 'logo-dark.png')),
      'dark logo drawable must be the official artwork'
    );
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

test('generated Kotlin keeps the widget honesty contract', () => {
  const root = makeProjectRoot('kotlin');
  try {
    plugin.writePigPulseWidgetFiles(root);
    const kotlin = read(root, GENERATED.kotlin);

    assert.match(kotlin, /^package com\.solrahk\.pighealthmonitor\.widget$/m);
    assert.match(kotlin, /import com\.solrahk\.pighealthmonitor\.R/);
    assert.match(kotlin, /class PigPulseWidgetProvider : AppWidgetProvider\(\)/);
    assert.match(kotlin, /"pigpulse_widget_state\.json"/);
    assert.match(kotlin, /File\(context\.filesDir,\s*STATE_FILE_NAME\)/);
    assert.match(kotlin, /FRESH_MS\s*=\s*90_000L/);
    assert.match(kotlin, /AGING_MS\s*=\s*300_000L/);
    assert.match(kotlin, /FUTURE_TOLERANCE_MS\s*=\s*5_000L/);
    assert.match(kotlin, /FileObserver/);
    assert.match(
      kotlin,
      /CLOSE_WRITE\s*or\s*FileObserver\.MOVED_TO\s*or\s*FileObserver\.DELETE/
    );
    assert.match(kotlin, /path\s*!=\s*STATE_FILE_NAME/);
    assert.match(kotlin, /AppWidgetManager/);
    assert.match(kotlin, /updateAppWidget\(/);
    assert.match(kotlin, /recomputeFreshness/);
    assert.match(kotlin, /logo_light/);
    assert.match(kotlin, /logo_dark/);
    assert.match(kotlin, /lastValidState/);
    assert.match(
      kotlin,
      /setTextColor\(R\.id\.widget_alert,\s*context\.getColor\(if \(dark\) R\.color\.widget_status_alert_dark else R\.color\.widget_status_alert\)\)/,
      'the alert line must use the active light/dark palette',
    );

    for (const name of LAYOUT_IDS) {
      assert.match(kotlin, new RegExp(`R\\.id\\.${name}\\b`), `Kotlin must reference R.id.${name}`);
    }

    const code = stripKotlinComments(kotlin);
    assert.doesNotMatch(code, /Handler\(|postDelayed/, 'no polling loop');
    assert.doesNotMatch(code, /°C/, 'no invented temperature unit');
    assert.doesNotMatch(code, /PocketBase/, 'no PocketBase record identity');
    assert.doesNotMatch(code, /FEVER|HYPERTHERMIA/i, 'no clinical verdict vocabulary');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generated provider-info declares the appwidget contract', () => {
  const root = makeProjectRoot('info');
  try {
    plugin.writePigPulseWidgetFiles(root);
    const info = read(root, GENERATED.info);
    assert.match(info, /<appwidget-provider/);
    assert.match(info, /android:updatePeriodMillis="1800000"/);
    assert.match(info, /android:initialLayout="@layout\/pigpulse_widget"/);
    assert.match(info, /android:minWidth="/);
    assert.match(info, /android:minHeight="/);
    assert.match(info, /android:resizeMode="/);
    assert.match(info, /android:widgetCategory="/);
    assert.match(info, /@drawable\/logo_light/);
    assert.match(
      info,
      /android:description="@string\/widget_description"/,
      'the widget provider must expose its accessibility description',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generated layout uses only RemoteViews views with accessible sizes', () => {
  const root = makeProjectRoot('layout');
  try {
    plugin.writePigPulseWidgetFiles(root);
    const layout = read(root, GENERATED.layout);

    const tags = new Set(Array.from(layout.matchAll(/<([A-Za-z][A-Za-z0-9_.]*)/g)).map((m) => m[1]));
    for (const tag of tags) {
      assert.equal(REMOTEVIEWS_VIEWS.has(tag), true, `<${tag}> is not RemoteViews-supported`);
      assert.equal(tag.includes('.'), false, `<${tag}> is a custom view class`);
    }

    const sizes = Array.from(layout.matchAll(/android:textSize="(\d+)sp"/g)).map((m) => Number(m[1]));
    assert.equal(sizes.length > 0, true, 'layout must declare explicit text sizes');
    for (const size of sizes) {
      assert.equal(size >= 16, true, `text size ${size}sp is below 16sp`);
    }
    assert.match(layout, /android:textStyle="bold"/);

    const ids = Array.from(layout.matchAll(/android:id="@\+id\/([A-Za-z0-9_]+)"/g)).map((m) => m[1]);
    for (const id of LAYOUT_IDS) {
      assert.equal(ids.includes(id), true, `layout must define id ${id}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manifest receives exactly one non-exported receiver with nested metadata', async () => {
  const config = plugin.withPigPulseWidget({
    name: 'Pig Health Monitor',
    slug: 'pig-health-monitor',
    android: { package: 'com.solrahk.pighealthmonitor' },
  });

  assert.equal(typeof config.mods.android.manifest, 'function');
  assert.equal(typeof config.mods.android.dangerous, 'function');

  const fixture = {
    manifest: {
      $: { package: 'com.solrahk.pighealthmonitor' },
      application: [{ $: { 'android:name': '.MainApplication' } }],
    },
  };
  const modRequest = {
    platform: 'android',
    projectRoot: PROJECT_ROOT,
    platformProjectRoot: path.join(PROJECT_ROOT, 'android'),
    introspect: false,
  };

  const out = await config.mods.android.manifest({ ...config, modRequest, modResults: fixture });
  const application = out.modResults.manifest.application[0];
  const ours = (application.receiver ?? []).filter((r) => r.$ && r.$['android:name'] === RECEIVER);
  assert.equal(ours.length, 1, 'exactly one PigPulse receiver');

  const receiver = ours[0];
  assert.equal(receiver.$['android:exported'], 'false');
  const actions = (receiver['intent-filter'] ?? [])
    .flatMap((filter) => filter.action ?? [])
    .map((action) => action.$['android:name']);
  assert.equal(actions.includes('android.appwidget.action.APPWIDGET_UPDATE'), true);

  const meta = (receiver['meta-data'] ?? []).find(
    (m) => m.$ && m.$['android:name'] === 'android.appwidget.provider'
  );
  assert.ok(meta, 'nested android.appwidget.provider metadata');
  assert.equal(meta.$['android:resource'], '@xml/pigpulse_widget_info');
  assert.equal(
    (application['meta-data'] ?? []).some(
      (m) => m.$['android:name'] === 'android.appwidget.provider'
    ),
    false,
    'metadata must not be hoisted to <application>'
  );

  // Idempotency: a second pass must not duplicate the receiver.
  const again = await config.mods.android.manifest({
    ...config,
    modRequest,
    modResults: out.modResults,
  });
  const count = (again.modResults.manifest.application[0].receiver ?? []).filter(
    (r) => r.$ && r.$['android:name'] === RECEIVER
  ).length;
  assert.equal(count, 1, 'manifest mod is idempotent');
});

test('dangerous mod writes nothing during introspection', async () => {
  const root = makeProjectRoot('introspect');
  try {
    const config = plugin.withPigPulseWidget({ name: 'PigPulse', slug: 'pigpulse' });
    await config.mods.android.dangerous({
      ...config,
      modRequest: {
        platform: 'android',
        projectRoot: root,
        platformProjectRoot: path.join(root, 'android'),
        introspect: true,
      },
    });
    assert.equal(fs.existsSync(path.join(root, 'android')), false, 'introspection must not write');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
