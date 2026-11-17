/**
 * Release credential-hygiene regression for the login screen.
 *
 * Expo compiles source literals into the Android JavaScript bundle, so an email
 * placeholder can become part of the shipped APK even when `.env` is excluded
 * from the EAS archive. The login screen must therefore contain only generic
 * example addresses and must never read embedded PocketBase credential env
 * variables.
 */
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
const loginSource = fs.readFileSync(path.resolve(appRoot, 'src/app/login.tsx'), 'utf8');
const easIgnore = fs.readFileSync(path.resolve(appRoot, '.easignore'), 'utf8');
const easJsonText = fs.readFileSync(path.resolve(appRoot, 'eas.json'), 'utf8');
const easJson = JSON.parse(easJsonText) as {
  build?: Record<string, { env?: Record<string, string> }>;
};
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(appRoot, 'package.json'), 'utf8'),
) as { scripts?: { 'test:unit'?: string } };

const emailLiterals = loginSource.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];

expectEq(emailLiterals.length > 0, true, 'the login screen has an email placeholder to validate');
expectEq(
  emailLiterals.every((value) => value.toLowerCase().endsWith('@example.com')),
  true,
  'login email placeholders use only generic example.com addresses',
);
expectEq(
  /EXPO_PUBLIC_PB_(?:EMAIL|PASSWORD)/.test(loginSource),
  false,
  'the login screen does not read embedded PocketBase credential variables',
);

const easIgnoreLines = easIgnore.split(/\r?\n/);
expectEq(easIgnoreLines.includes('.env'), true, 'the EAS archive excludes the local .env file');
expectEq(easIgnoreLines.includes('.env*'), true, 'the EAS archive excludes local .env variants');

const easEnvKeys = Object.values(easJson.build ?? {}).flatMap((profile) =>
  Object.keys(profile.env ?? {}),
);
expectEq(
  easEnvKeys.every((key) => !/(?:PASSWORD|PASSWD|SECRET|TOKEN|CREDENTIAL|PB_EMAIL|POCKETBASE_EMAIL)/i.test(key)),
  true,
  'EAS profiles do not embed credential-bearing environment variables',
);

const unitScript = packageJson.scripts?.['test:unit'] ?? '';
expectEq(
  unitScript.includes('src/utils/__tests__/login-credential-hygiene.test.ts'),
  true,
  'the login credential-hygiene suite is registered',
);

if (failures > 0) {
  report(`${failures} login credential-hygiene assertion(s) failed`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log('login credential hygiene: all assertions passed');
