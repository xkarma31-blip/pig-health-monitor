// Regression: execute the actual sketch expression on left-aligned I2S words.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/src/esp32s3_telemetry.ino`, 'utf8');
const shift = Number(source.match(/int16_t sample = \(int16_t\)\(rawBuffer\[i\] >> (\d+)\)/)[1]);
for (const sample of [-32768, -20000, -1, 0, 1, 20000, 32767]) {
  const raw = sample * 65536;
  const actual = ((raw >> shift) << 16) >> 16;
  assert.equal(actual, sample, `I2S conversion must preserve signed sample ${sample}`);
}
console.log('PASS: signed PCM conversion preserves amplitude without wrapping');
