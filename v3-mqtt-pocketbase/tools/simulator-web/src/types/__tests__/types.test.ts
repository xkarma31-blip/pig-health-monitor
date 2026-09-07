import { describe, it, expect } from 'vitest';
import { 
  TOPIC_PREFIX, 
  buildTopic, 
  telemetryTopic, 
  alertsTopic, 
  statusTopic, 
  commandsTopic, 
  responseTopic,
  CMD_ENROLL_START,
  CMD_PING,
  ALERT_FEVER,
  ALERT_COUGH_CLUSTER,
  ALERT_LOW_BATTERY,
  ALERT_WEAK_WIFI,
  FEVER_WARNING,
  FEVER_CRITICAL,
  BATTERY_LOW,
  WIFI_WEAK_RSSI
} from '../canonMqtt';

describe('Canon MQTT Protocol & Topic Contract', () => {
  it('should enforce exact canon topic strings matching PigMqttTopics.h', () => {
    expect(TOPIC_PREFIX).toBe('pig');
    expect(buildTopic('esp32-001', 'telemetry')).toBe('pig/esp32-001/telemetry');
    expect(telemetryTopic('esp32-001')).toBe('pig/esp32-001/telemetry');
    expect(alertsTopic('esp32-001')).toBe('pig/esp32-001/alerts');
    expect(statusTopic('esp32-001')).toBe('pig/esp32-001/status');
    expect(commandsTopic('esp32-001')).toBe('pig/esp32-001/commands');
    expect(responseTopic('esp32-001')).toBe('pig/esp32-001/response');
  });

  it('should match canonical commands and alert types', () => {
    expect(CMD_ENROLL_START).toBe('ENROLL_START');
    expect(CMD_PING).toBe('PING');
    expect(ALERT_FEVER).toBe('FEVER');
    expect(ALERT_COUGH_CLUSTER).toBe('COUGH_CLUSTER');
    expect(ALERT_LOW_BATTERY).toBe('LOW_BATTERY');
    expect(ALERT_WEAK_WIFI).toBe('WEAK_WIFI');
  });

  it('should match canon thresholds from firmware and DECISIONS.md', () => {
    expect(FEVER_WARNING).toBe(39.5);
    expect(FEVER_CRITICAL).toBe(40.0);
    expect(BATTERY_LOW).toBe(20.0);
    expect(WIFI_WEAK_RSSI).toBe(-85);
  });
});
