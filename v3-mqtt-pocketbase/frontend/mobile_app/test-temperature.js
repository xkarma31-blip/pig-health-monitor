/**
 * Temperature Telemetry Test
 * Quick verification of temperature system functionality
 */

import { TemperatureTelemetry } from './src/utils/temperature';

// Test cases for temperature readings
const testCases = [
  { temperature: 38.9, type: 'surface', expected: 'elevated' },
  { temperature: 39.5, type: 'surface', expected: 'high' },
  { temperature: 40.2, type: 'surface', expected: 'critical' },
  { temperature: 39.0, type: 'core', expected: 'normal' },
  { temperature: 39.8, type: 'core', expected: 'elevated' },
  { temperature: 40.5, type: 'core', expected: 'high' },
];

if (typeof console !== 'undefined') {
  console.log('🌡️ Temperature Telemetry System Test');
  console.log('=====================================');
}

testCases.forEach((testCase, index) => {
  const result = TemperatureTelemetry.getStatus(testCase.temperature, testCase.type);
  const statusText = result.status === testCase.expected ? '✅ PASS' : '❌ FAIL';
  
  if (typeof console !== 'undefined') {
    console.log(`Test ${index + 1}: ${statusText}`);
    console.log(`  Temperature: ${testCase.temperature}°C (${testCase.type})`);
    console.log(`  Expected: ${testCase.expected}, Got: ${result.status}`);
    console.log(`  Alert: ${result.alert}`);
    console.log('');
  }
});

// Test accessibility labels
if (typeof console !== 'undefined') {
  console.log('🔊 Accessibility Labels Test');
  console.log('============================');
}

const accessibilityTest = TemperatureTelemetry.getAccessibilityLabel(
  39.2, 
  'core', 
  'elevated'
);

if (typeof console !== 'undefined') {
  console.log('Accessibility Label:', accessibilityTest);
  console.log('✅ Accessibility test completed');
}