/**
 * Integration contract for wiring the native Android widget into the Expo root.
 *
 * This test intentionally checks the small integration boundary that cannot be
 * observed from the React-free runtime alone: platform selection, root mount
 * ordering, and focused-suite registration in the unit test command.
 */
import { isWidgetSyncPlatform } from '../useWidgetSync';

interface NodeFs {
  readFileSync(file: string, encoding: string): string;
}
interface NodePath {
  resolve(...parts: string[]): string;
}

declare const __dirname: string;
declare const require: (id: string) => unknown;

const fs = require('node:fs') as unknown as NodeFs;
const path = require('node:path') as unknown as NodePath;

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const appRoot = path.resolve(__dirname, '../../..');
const rootSource = fs.readFileSync(path.resolve(appRoot, 'src/app/_layout.tsx'), 'utf8');
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(appRoot, 'package.json'), 'utf8'),
) as { scripts?: { 'test:unit'?: string } };
const appJson = JSON.parse(
  fs.readFileSync(path.resolve(appRoot, 'app.json'), 'utf8'),
) as { expo?: { plugins?: unknown[] } };

expectEq(isWidgetSyncPlatform('android'), true, 'Android enables widget synchronization');
expectEq(isWidgetSyncPlatform('ios'), false, 'iOS does not enable widget synchronization');
expectEq(isWidgetSyncPlatform('web'), false, 'web does not enable widget synchronization');

expectEq(
  /import\s*\{[^}]*\bPlatform\b[^}]*\}\s*from\s*['"]react-native['"]/.test(rootSource),
  true,
  'the root imports React Native Platform',
);
expectEq(
  /useWidgetSync\(mode,\s*Platform\.OS\)/.test(rootSource),
  true,
  'the root passes the runtime platform to the widget hook',
);

const hookMountIndex = rootSource.indexOf('useWidgetSync(mode, Platform.OS)');
const loadingGuardIndex = rootSource.indexOf('if (isLoading)');
expectEq(hookMountIndex >= 0, true, 'the root mounts the widget hook');
expectEq(loadingGuardIndex >= 0, true, 'the root retains its loading guard');
expectEq(
  hookMountIndex >= 0 && loadingGuardIndex >= 0 && hookMountIndex < loadingGuardIndex,
  true,
  'the widget hook is mounted before the loading early return',
);

const unitScript = packageJson.scripts?.['test:unit'] ?? '';
expectEq(
  unitScript.includes('src/hooks/__tests__/useWidgetSync.test.ts'),
  true,
  'the focused widget hook suite is registered',
);
expectEq(
  unitScript.includes('src/hooks/__tests__/widget-root-integration.test.ts'),
  true,
  'the root widget integration suite is registered',
);
expectEq(
  unitScript.includes('plugins/__tests__/withPigPulseWidget.test.cjs'),
  true,
  'the focused native widget plugin suite is registered',
);
expectEq(
  unitScript.includes('src/utils/__tests__/widget-plugin.test.ts'),
  true,
  'the native widget plugin acceptance suite is registered',
);

const expoPlugins = appJson.expo?.plugins ?? [];
expectEq(
  expoPlugins.some((plugin) => {
    if (typeof plugin === 'string') {
      return plugin === './plugins/withPigPulseWidget';
    }
    return Array.isArray(plugin) && plugin[0] === './plugins/withPigPulseWidget';
  }),
  true,
  'the native widget config plugin is registered with Expo',
);

if (failures > 0) {
  report(`${failures} widget root integration assertion(s) failed`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log('widget root integration: all assertions passed');
