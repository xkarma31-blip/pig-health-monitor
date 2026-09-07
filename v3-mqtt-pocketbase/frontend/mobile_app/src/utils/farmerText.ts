/**
 * 🧑‍🌾 Farmer-plain language strings (English + Filipino).
 *
 * Rule: every user-facing setup/status/error string a non-tech-savvy farmer
 * can see MUST come from this table — Grade-4 reading level, no jargon
 * (no "MQTT", "gateway timeout", "dBm", "firmware", "telemetry").
 *
 * Pure module (no imports) so the contract test can assert EN/TL key parity.
 */

export type FarmerLang = 'en' | 'tl';

export const FARMER_LANGS: { code: FarmerLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'tl', label: 'Filipino' },
];

const en = {
  // Setup wizard
  setupTitle: 'Set up your PigPulse box',
  setupSubtitle: '3 quick steps. No account needed.',
  step1Title: 'Step 1 of 3: Find your box',
  step1Body: 'Your PigPulse box must be plugged in and on the same WiFi as this phone. Type its address below, or press Scan.',
  gatewayLabel: 'Box address',
  gatewayPlaceholder: 'e.g. 192.168.254.100:8099',
  scanButton: '🔍  Scan for my box',
  testButton: '✅  Test connection',
  testing: 'Testing… please wait.',
  testOk: 'Working! Your box answered. ✅',
  testFail: 'Not working. ❌ Check that the box is plugged in and on the same WiFi, then press Try again.',
  nextButton: 'Next ➜',
  backButton: '⬅ Back',
  step2Title: 'Step 2 of 3: Name your farm',
  step2Body: 'This is only shown on your screen so you know whose pigs these are.',
  farmLabel: 'Farm name',
  farmPlaceholder: 'e.g. Sundown Farm',
  penLabel: 'Pen name (optional)',
  penPlaceholder: 'e.g. Pen 1',
  step3Title: 'Step 3 of 3: Done! 🎉',
  step3BodyHealthy: 'Your pigs look healthy right now.',
  finishButton: 'See my pigs 🐷',
  skipButton: 'Skip for now',
  // Home / status
  demoBanner: 'SAMPLE DATA — connect your box in Setup to see your real pigs.',
  setupNowButton: 'Set up now',
  allClear: 'All clear — your pigs look healthy. ✅',
  needsAttention: 'Needs attention ⚠️',
  criticalAlert: 'Sick pigs possible! 🚨 Tap to see which pen.',
  cantReachBox: "Can't reach your PigPulse box. Showing the last saved readings.",
  tryAgain: 'Try again',
  lastSaved: 'Last saved readings',
  liveFromBox: 'Live from your box',
  // Node cards (plain words, never dBm/hashes)
  earCamera: 'Thermal camera',
  microphone: 'Cough microphone',
  working: 'Working ✅',
  notWorking: 'Not working ❌',
  signalGood: 'Signal: Good',
  signalWeak: 'Signal: Weak — move the box closer to your WiFi',
  batteryLow: 'Battery low — please charge soon 🔋',
  setupDeviceButton: '＋ Set up a device',
  myDevices: 'My devices',
  detailsButton: 'Details',
  // Login (kept short; local box needs no account)
  loginNotNeeded: 'No account needed to see your pigs. Log in only for internet backup.',
} as const;

export type FarmerStrings = typeof en;

const tl: Record<keyof FarmerStrings, string> = {
  setupTitle: 'I-set up ang iyong PigPulse box',
  setupSubtitle: '3 madaling hakbang. Hindi kailangan ng account.',
  step1Title: 'Hakbang 1 sa 3: Hanapin ang iyong box',
  step1Body: 'Dapat nakasaksak ang iyong PigPulse box at nasa parehong WiFi ng teleponong ito. I-type ang address sa ibaba, o pindutin ang Scan.',
  gatewayLabel: 'Address ng box',
  gatewayPlaceholder: 'hal. 192.168.254.100:8099',
  scanButton: '🔍  Hanapin ang aking box',
  testButton: '✅  Subukan ang koneksyon',
  testing: 'Sinusubukan… sandali lang.',
  testOk: 'Gumagana! Sumagot ang iyong box. ✅',
  testFail: 'Hindi gumagana. ❌ Siguraduhing nakasaksak ang box at nasa parehong WiFi, tapos pindutin ang Subukan ulit.',
  nextButton: 'Susunod ➜',
  backButton: '⬅ Bumalik',
  step2Title: 'Hakbang 2 sa 3: Pangalanan ang iyong farm',
  step2Body: 'Sa iyong screen lang ito makikita para alam mo kung kaninong baboy ang mga ito.',
  farmLabel: 'Pangalan ng farm',
  farmPlaceholder: 'hal. Sundown Farm',
  penLabel: 'Pangalan ng kulungan (opsyonal)',
  penPlaceholder: 'hal. Kulungan 1',
  step3Title: 'Hakbang 3 sa 3: Tapos na! 🎉',
  step3BodyHealthy: 'Mukhang malusog ang iyong mga baboy ngayon.',
  finishButton: 'Tingnan ang aking mga baboy 🐷',
  skipButton: 'Laktawan muna',
  demoBanner: 'SAMPLE LANG ITO — ikonekta ang iyong box sa Setup para makita ang tunay mong mga baboy.',
  setupNowButton: 'Mag-set up na',
  allClear: 'Ayos lahat — mukhang malusog ang iyong mga baboy. ✅',
  needsAttention: 'Kailangang tingnan ⚠️',
  criticalAlert: 'Posibleng may sakit na baboy! 🚨 Pindutin para makita kung aling kulungan.',
  cantReachBox: 'Hindi maabot ang iyong PigPulse box. Ipinapakita ang huling na-save na datos.',
  tryAgain: 'Subukan ulit',
  lastSaved: 'Huling na-save na datos',
  liveFromBox: 'Live mula sa iyong box',
  earCamera: 'Thermal camera',
  microphone: 'Mikropono ng ubo',
  working: 'Gumagana ✅',
  notWorking: 'Hindi gumagana ❌',
  signalGood: 'Signal: Malakas',
  signalWeak: 'Signal: Mahina — ilapit ang box sa iyong WiFi',
  batteryLow: 'Low batt na — pakicharge agad 🔋',
  setupDeviceButton: '＋ Mag-set up ng device',
  myDevices: 'Mga device ko',
  detailsButton: 'Detalye',
  loginNotNeeded: 'Hindi kailangan ng account para makita ang iyong mga baboy. Mag-log in lang para sa internet backup.',
};

const TABLES: Record<FarmerLang, Record<keyof FarmerStrings, string>> = { en, tl };

export function getFarmerText(lang: FarmerLang): Record<keyof FarmerStrings, string> {
  return TABLES[lang] ?? TABLES.en;
}

/** Every key in EN must exist in TL (asserted by contract test). */
export function farmerStringKeys(): (keyof FarmerStrings)[] {
  return Object.keys(en) as (keyof FarmerStrings)[];
}
