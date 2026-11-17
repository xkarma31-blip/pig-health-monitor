'use strict';

/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins use CommonJS. */

/**
 * Expo config plugin for the native PigPulse Android home-screen widget.
 *
 * The generated Android project is disposable: `expo prebuild --clean`
 * recreates `android/` from scratch, so every native file the widget needs is
 * copied from checked-in templates on every build. Nothing under `android/` is
 * ever committed.
 *
 * Two mods are registered:
 *
 *   - `android.manifest` merges a single, non-exported AppWidgetProvider
 *     receiver into the app manifest (idempotently, so re-running is safe);
 *   - `android.dangerous` copies the Kotlin provider, the provider-info XML,
 *     the RemoteViews layout, the widget resources and the two official logo
 *     drawables into the generated project.
 *
 * Introspection (`expo prebuild --introspect`-style dry runs) must never touch
 * the filesystem, so the dangerous mod is a no-op when the request is marked
 * introspective.
 */

const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const PLUGIN_DIR = __dirname;
const TEMPLATE_DIR = path.join(PLUGIN_DIR, 'pigpulse-widget');
const ASSETS_DIR = path.resolve(PLUGIN_DIR, '..', 'assets');

const RECEIVER_NAME = 'com.solrahk.pighealthmonitor.widget.PigPulseWidgetProvider';
const PROVIDER_INFO_RESOURCE = '@xml/pigpulse_widget_info';
const APPWIDGET_UPDATE = 'android.appwidget.action.APPWIDGET_UPDATE';
const APPWIDGET_PROVIDER_META = 'android.appwidget.provider';

/**
 * Template file name -> destination path relative to the Android project root
 * (`platformProjectRoot`, the directory that contains `app/`). Paths are
 * intentionally relative so the plugin never assumes where prebuild put the
 * project.
 *
 * The Kotlin provider, the RemoteViews layout, the provider-info XML, the two
 * container backgrounds and the widget values file are all checked in beside
 * the plugin and copied verbatim, so a clean prebuild always regenerates the
 * exact same native sources.
 */
const FILE_TARGETS = [
  [
    'PigPulseWidgetProvider.kt',
    'app/src/main/java/com/solrahk/pighealthmonitor/widget/PigPulseWidgetProvider.kt',
  ],
  [
    'pigpulse_widget.xml',
    'app/src/main/res/layout/pigpulse_widget.xml',
  ],
  [
    'pigpulse_widget_info.xml',
    'app/src/main/res/xml/pigpulse_widget_info.xml',
  ],
  [
    'widget_background_light.xml',
    'app/src/main/res/drawable/widget_background_light.xml',
  ],
  [
    'widget_background_dark.xml',
    'app/src/main/res/drawable/widget_background_dark.xml',
  ],
  [
    'widget_values.xml',
    'app/src/main/res/values/widget_values.xml',
  ],
];

/**
 * Official artwork (checked into `assets/`) -> Android drawable resource. The
 * widget picks between the two by the JSON `state.theme`; no artwork is drawn
 * or recoloured here, the bytes are copied verbatim.
 */
const ARTWORK_TARGETS = [
  ['logo-light.png', 'app/src/main/res/drawable/logo_light.png'],
  ['logo-dark.png', 'app/src/main/res/drawable/logo_dark.png'],
];

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

/**
 * Generate every native file needed by the widget.
 *
 * `platformProjectRoot` is Expo's generated Android project directory (the
 * directory that contains `app/`). The files land under
 * `<platformProjectRoot>/app/src/main/...`. Keeping the root explicit means
 * callers can generate into a throwaway directory — the tests do exactly that
 * — without the plugin knowing where prebuild put the project.
 */
function writePigPulseWidgetFiles(platformProjectRoot) {
  for (const [templateName, relativeTarget] of FILE_TARGETS) {
    copyFile(
      path.join(TEMPLATE_DIR, templateName),
      path.join(platformProjectRoot, relativeTarget)
    );
  }

  for (const [assetName, relativeTarget] of ARTWORK_TARGETS) {
    copyFile(
      path.join(ASSETS_DIR, assetName),
      path.join(platformProjectRoot, relativeTarget)
    );
  }
}

/** Merge the widget receiver into an Android manifest object exactly once. */
function addPigPulseWidgetReceiver(manifest) {
  const application = manifest?.manifest?.application?.[0];
  if (!application) {
    throw new Error(
      'PigPulse widget plugin could not find the Android application element.'
    );
  }

  const receivers = Array.isArray(application.receiver) ? application.receiver : [];
  const withoutPigPulse = receivers.filter(
    (receiver) => receiver?.$?.['android:name'] !== RECEIVER_NAME
  );

  withoutPigPulse.push({
    $: {
      'android:name': RECEIVER_NAME,
      'android:exported': 'false',
    },
    'intent-filter': [
      {
        action: [
          {
            $: {
              'android:name': APPWIDGET_UPDATE,
            },
          },
        ],
      },
    ],
    'meta-data': [
      {
        $: {
          'android:name': APPWIDGET_PROVIDER_META,
          'android:resource': PROVIDER_INFO_RESOURCE,
        },
      },
    ],
  });

  application.receiver = withoutPigPulse;
  return manifest;
}

/** Add the PigPulse widget to an Expo Android project. */
function withPigPulseWidget(config) {
  config = withAndroidManifest(config, (pluginConfig) => {
    pluginConfig.modResults = addPigPulseWidgetReceiver(pluginConfig.modResults);
    return pluginConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (pluginConfig) => {
      // Introspection must remain side-effect free.
      if (pluginConfig.modRequest?.introspect) {
        return pluginConfig;
      }
      const { projectRoot, platformProjectRoot } = pluginConfig.modRequest;
      // Expo defines platformProjectRoot as the generated Android project
      // directory (the one containing `app/`). Fall back to the conventional
      // project-root layout only when a caller supplies no platform root.
      const androidRoot =
        platformProjectRoot ?? path.join(projectRoot ?? PLUGIN_DIR, 'android');
      writePigPulseWidgetFiles(androidRoot);
      return pluginConfig;
    },
  ]);

  return config;
}

module.exports = withPigPulseWidget;
module.exports.withPigPulseWidget = withPigPulseWidget;
module.exports.writePigPulseWidgetFiles = writePigPulseWidgetFiles;
module.exports.addPigPulseWidgetReceiver = addPigPulseWidgetReceiver;
