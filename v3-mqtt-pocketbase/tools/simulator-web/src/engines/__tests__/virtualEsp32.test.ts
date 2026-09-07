import { describe, it, expect } from 'vitest';
import { VirtualEsp32Node } from '../virtualEsp32';
import { PROFILE_D0WD, PROFILE_S3 } from '../../types/virtualNode';
import {
  CanonTelemetryPayload,
  CanonAlertPayload,
  ALERT_LOW_BATTERY,
  ALERT_FEVER,
  TREND_STABLE,
  TREND_ELEVATED,
  TREND_CLUSTER,
  POWER_NORMAL,
  POWER_LOW,
  POWER_CRITICAL,
  POWER_HIBERNATE
} from '../../types/canonMqtt';

const TRENDS = [TREND_STABLE, TREND_ELEVATED, TREND_CLUSTER];
const POWER_STATES = [POWER_NORMAL, POWER_LOW, POWER_CRITICAL, POWER_HIBERNATE];

function runUntilTelemetry(node: VirtualEsp32Node, maxTicks = 60): CanonTelemetryPayload {
  for (let i = 0; i < maxTicks; i++) {
    const result = node.tick();
    if (result.telemetry) return result.telemetry;
  }
  throw new Error(`No telemetry emitted within ${maxTicks} ticks`);
}

describe('Virtual ESP32 D0WD State Machine & Chaos Engine', () => {
  it('boots from BOOT into IDLE with healthy hardware readings', () => {
    const node = new VirtualEsp32Node({ profile: PROFILE_D0WD, seed: 1 });
    // Constructor state = BOOT; boot sequence completes after 2 ticks
    expect(node.snapshot().state).toBe('BOOT');
    node.tick();
    expect(node.snapshot().state).toBe('BOOT');
    node.tick();
    expect(node.snapshot().state).toBe('IDLE');
    const snap = node.snapshot();
    expect(snap.batteryMv).toBeGreaterThanOrEqual(2800);
    expect(snap.batteryMv).toBeLessThanOrEqual(4200);
    expect(snap.freeHeapBytes).toBeGreaterThan(100 * 1024);
    expect(snap.uptimeSeconds).toBeGreaterThan(0);
    expect(snap.wifiConnected).toBe(true);
  });

  it('emits a canonical 15-field telemetry payload within 60 ticks', () => {
    const node = new VirtualEsp32Node({ profile: PROFILE_D0WD, seed: 7 });
    const telemetry = runUntilTelemetry(node);
    expect(telemetry.pigId).toBe(PROFILE_D0WD.id);
    expect(typeof telemetry.temperature).toBe('number');
    expect(typeof telemetry.bodyTemp).toBe('number');
    expect(typeof telemetry.targetX).toBe('number');
    expect(typeof telemetry.targetY).toBe('number');
    expect(telemetry.thermalFrame).toHaveLength(1024); // base64 of 768 bytes
    expect(typeof telemetry.coughRate).toBe('number');
    expect(typeof telemetry.coughCluster).toBe('boolean');
    expect(TRENDS).toContain(telemetry.healthTrend);
    expect(POWER_STATES).toContain(telemetry.powerState);
    expect(telemetry.batteryPct).toBeGreaterThanOrEqual(0);
    expect(telemetry.batteryPct).toBeLessThanOrEqual(100);
    expect(typeof telemetry.batteryV).toBe('number');
    expect(typeof telemetry.wifiRssi).toBe('number');
    expect(telemetry.timestamp).toBeGreaterThan(0);
  });

  it('drains free heap during sampling and records a min watermark', () => {
    const node = new VirtualEsp32Node({ profile: PROFILE_D0WD, seed: 3 });
    const initialFree = node.snapshot().freeHeapBytes;
    node.tick();
    node.tick();
    for (let i = 0; i < 8; i++) node.tick();
    const snap = node.snapshot();
    expect(snap.freeHeapBytes).toBeLessThan(initialFree);
    expect(snap.minFreeHeapBytes).toBeLessThanOrEqual(snap.freeHeapBytes);
  });

  it('applies 150–250 mV TX sag on battery during publish, then recovers', () => {
    const node = new VirtualEsp32Node({ profile: PROFILE_D0WD, seed: 11, keepaliveTicks: 60 });
    // Track the last pre-TX IDLE voltage; break on the tick where sag is active
    let preTxMv = -1;
    let sagMv = 0;
    for (let i = 0; i < 80; i++) {
      const before = node.snapshot();
      const result = node.tick();
      if (result.snapshot.txSagActive && preTxMv > 0) {
        sagMv = preTxMv - result.snapshot.batteryMv;
        break;
      }
      if (before.state === 'IDLE') preTxMv = before.batteryMv;
    }
    expect(sagMv).toBeGreaterThanOrEqual(140);
    expect(sagMv).toBeLessThanOrEqual(280);
  });

  it('emits a LOW_BATTERY alert once and enters HIBERNATE at critical charge', () => {
    const node = new VirtualEsp32Node({ profile: PROFILE_D0WD, seed: 5, initialBatteryPct: 8 });
    let lowBatteryAlerts = 0;
    let sawHibernate = false;
    for (let i = 0; i < 40; i++) {
      const result = node.tick();
      if (result.alert) {
        for (const alert of result.alert) {
          if (alert.type === ALERT_LOW_BATTERY) lowBatteryAlerts++;
        }
      }
      if (result.snapshot.state === 'HIBERNATE') sawHibernate = true;
    }
    expect(lowBatteryAlerts).toBeGreaterThanOrEqual(1);
    expect(sawHibernate).toBe(true);
    expect(node.snapshot().powerState).toBe(POWER_HIBERNATE);
  });

  it('brownouts on forced under-voltage and warm-reboots with persistent I2C lock', () => {
    const node = new VirtualEsp32Node({
      profile: PROFILE_D0WD,
      seed: 2,
      chaos: { forceBrownout: true, i2cLockupTrigger: true }
    });
    let sawBrownout = false;
    for (let i = 0; i < 20; i++) {
      const { snapshot } = node.tick();
      if (snapshot.state === 'BROWNOUT') sawBrownout = true;
    }
    expect(sawBrownout).toBe(true);
    // Warm reboot: back to BOOT/IDLE with battery restored, I2C lock persisted
    expect(node.snapshot().i2cLocked).toBe(true);
    expect(node.snapshot().batteryMv).toBeGreaterThan(3000);
  });

  it('drops all publishes under 100% packet loss and keeps counting drops', () => {
    const node = new VirtualEsp32Node({
      profile: PROFILE_D0WD,
      seed: 4,
      chaos: { packetLossRate: 1.0 }
    });
    let emits = 0;
    for (let i = 0; i < 50; i++) {
      const result = node.tick();
      if (result.telemetry) emits++;
    }
    expect(emits).toBe(0);
    expect(node.snapshot().overflowDrops + node.droppedPackets()).toBeGreaterThan(0);
  });

  it('goes offline on beacon loss (deferred LWT) and recovers with online status', () => {
    const node = new VirtualEsp32Node({
      profile: PROFILE_D0WD,
      seed: 8,
      keepaliveTicks: 6,
      beaconLossForTicks: 10
    });
    let sawOffline = false;
    let sawOnline = false;
    for (let i = 0; i < 80; i++) {
      const result = node.tick();
      if (result.status) {
        if (result.status.online === false) sawOffline = true;
        if (result.status.online === true) sawOnline = true;
      }
    }
    expect(sawOffline).toBe(true);
    expect(sawOnline).toBe(true);
    expect(node.snapshot().mqttConnected).toBe(true);
  });

  it('fires task watchdog PANIC when a persistent beacon storm starves the sampler', () => {
    const node = new VirtualEsp32Node({
      profile: PROFILE_D0WD,
      seed: 9,
      beaconLossForTicks: 500
    });
    let panicked = false;
    for (let i = 0; i < 300; i++) {
      if (node.snapshot().state === 'PANIC_WDT') {
        panicked = true;
        break;
      }
      node.tick();
    }
    expect(panicked).toBe(true);
  });

  it('injectChaos bumps epochId and applies new settings mid-run', () => {
    const node = new VirtualEsp32Node({ profile: PROFILE_S3, seed: 13 });
    const before = node.epochId();
    node.injectChaos({ packetLossRate: 0.5 });
    expect(node.epochId()).toBe(before + 1);
    expect(node.chaosSnapshot().packetLossRate).toBe(0.5);
  });

  it('emits a FEVER alert when bodyTemp crosses the 39.5 C warning threshold', () => {
    const node = new VirtualEsp32Node({ profile: PROFILE_D0WD, seed: 6, pigBaseTemp: 39.8 });
    let feverAlert: CanonAlertPayload | undefined;
    for (let i = 0; i < 60; i++) {
      const result = node.tick();
      if (result.alert) {
        const found = result.alert.find((a) => a.type === ALERT_FEVER);
        if (found) {
          feverAlert = found;
          break;
        }
      }
    }
    expect(feverAlert).toBeDefined();
    expect(feverAlert!.value).toBeGreaterThanOrEqual(39.5);
    expect(feverAlert!.threshold).toBe(39.5);
  });
});