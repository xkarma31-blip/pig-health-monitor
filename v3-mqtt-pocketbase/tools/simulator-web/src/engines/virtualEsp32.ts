/**
 * Virtual ESP32 D0WD State Machine & Chaos Engine
 *
 * Models the firmware loop (firmware/src/main.cpp) on a virtual D0WD:
 *  - Dual-core FreeRTOS: core0 = sampler, core1 = WiFi/MQTT
 *  - Tick-based TWDT -> ESP_RST_TASK_WDT when the sampler is starved
 *  - Persistent I2C SDA-clamp across warm reboot (hardware latch)
 *  - 4096-byte MQTT TX budget, LiPo TX sag 150-250 mV, brownout <2.8 V
 *  - Artificial free-heap model (-12 KB/frame during SAMPLE, alloc-fail <32 KB)
 *  - 802.11 beacon-loss reconnect storm with full-jitter exponential backoff
 *  - Deferred LWT at 1.5 * keepalive, chaosEpoch tagging
 */

import { PROFILE_D0WD, PROFILE_S3, VirtualNodeProfile, FreeRtosState, VirtualHardwareState, PowerState } from '../types/virtualNode';
import { ChaosSettings, DEFAULT_CHAOS_SETTINGS } from '../types/chaos';
import {
  CanonTelemetryPayload,
  CanonAlertPayload,
  CanonStatusPayload,
  FEVER_WARNING,
  FEVER_CRITICAL,
  BATTERY_LOW,
  BATTERY_CRITICAL,
  WIFI_WEAK_RSSI,
  ALERT_LOW_BATTERY,
  ALERT_WEAK_WIFI,
  ALERT_FEVER,
  SEVERITY_WARNING,
  SEVERITY_CRITICAL,
  TREND_STABLE,
  TREND_ELEVATED,
  TREND_CLUSTER,
  POWER_NORMAL,
  POWER_LOW,
  POWER_HIBERNATE
} from '../types/canonMqtt';
import { generateThermalFrame, extractFirmwareHotspot, encodeBase64Frame, SimulatedPig } from './thermalEngine';

// Deterministic RNG (mulberry32) for reproducible chaos
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Timing & power constants (per firmware & red-team review)
const BOOT_TICKS = 2;
const SAMPLE_TICKS = 3;
const TX_TICKS = 2;
const IDLE_MIN_TICKS = 2;
const IDLE_MAX_TICKS = 5;
const HEAP_SAMPLE_DRAIN = 12 * 1024;
const HEAP_IDLE_RECOVERY = 1024;
const HEAP_ALLOC_MIN = 32 * 1024;
const TX_SAG_MIN_MV = 150;
const TX_SAG_MAX_MV = 250;
const STARVE_WDT_TICKS = 50;
const BATTERY_DRAIN_PER_PUBLISH_PCT = 0.05;
const VOLTS_FULL = 4.0;
const VOLTS_EMPTY = 2.8;
const BACKOFF_MIN_TICKS = 2;
const BACKOFF_MAX_TICKS = 64;

export interface VirtualNodeOptions {
  profile?: VirtualNodeProfile;
  chaos?: Partial<ChaosSettings>;
  seed?: number;
  initialBatteryPct?: number;
  keepaliveTicks?: number;      // virtual keepalive cadence (default 60)
  beaconLossForTicks?: number;  // force beacon loss for the first N ticks
  pigBaseTemp?: number;         // core temp for the simulated pig (default 38.6)
}

/** Runtime host-driven vitals overrides (barn environment → node). */
export interface SimEnvironmentOverride {
  bodyTemp?: number;                       // °C — authoritative sensed core temp
  coughRate?: number;                      // coughs/min — overrides random model
  trend?: CanonTelemetryPayload['healthTrend']; // overrides derived trend
  position?: { x: number; y: number };     // normalized 0..1 → 32x24 thermal grid
}

export interface VirtualTickResult {
  snapshot: VirtualHardwareState;
  telemetry?: CanonTelemetryPayload;
  alert?: CanonAlertPayload[];
  status?: CanonStatusPayload;
  dropped: boolean;             // true when chaos packet loss dropped the publish
  transitions: Array<{ from: FreeRtosState; to: FreeRtosState; reason: string; tick: number }>;
}


export class VirtualEsp32Node {
  private chaos: ChaosSettings;
  private rng: () => number;
  private tickCount = 0;
  private state: FreeRtosState;
  private stateTicks = 0;
  private transitions: VirtualTickResult['transitions'] = [];
  private lowBatteryWarned = false;
  private lowBatteryCriticalWarned = false;
  private feverWarned = false;
  private weakWifiWarned = false;
  private drops = 0;
  private epoch = 1;
  private beaconLossRemaining: number;
  private backoffTicks = BACKOFF_MIN_TICKS;
  private ticksSinceLastSample = 0;
  private pendingStatuses: CanonStatusPayload[] = [];
  private prevForceBrownout = false;

  private hardware: VirtualHardwareState;

  constructor(private opts: VirtualNodeOptions = {}) {
    const profile = opts.profile ?? PROFILE_D0WD;
    this.chaos = { ...DEFAULT_CHAOS_SETTINGS, ...opts.chaos };
    this.rng = createRng(opts.seed ?? 0x50A5EED);
    this.state = 'BOOT';
    this.beaconLossRemaining = opts.beaconLossForTicks ?? 0;

    const batteryPct = Math.max(0, Math.min(100, opts.initialBatteryPct ?? 100));
    this.hardware = {
      state: this.state as FreeRtosState,
      uptimeSeconds: 0,
      freeHeapBytes: Math.floor(profile.sramBytes * 0.75),
      minFreeHeapBytes: Math.floor(profile.sramBytes * 0.75),
      batteryMv: this.voltsForPct(batteryPct),
      batteryPct,
      powerState: this.powerStateForPct(batteryPct),
      wifiRssiDbm: -64,
      wifiConnected: true,
      mqttConnected: false,
      i2cLocked: this.chaos.i2cLockupTrigger,
      txSagActive: false,
      flashWriteCycles: 0,
      overflowDrops: 0
    };
  }

  // ---- public API -------------------------------------------------------

  tick(): VirtualTickResult {
    this.tickCount++;
    this.stateTicks++;
    this.hardware.uptimeSeconds = Math.round(this.tickCount * 0.25 * 100) / 100;
    this.transitions = [];
    this.pendingStatuses = [];

    // Chaos monkey: one-shot forced under-voltage (acts as a pulse, not a latch)
    if (this.chaos.forceBrownout && !this.prevForceBrownout) {
      this.hardware.batteryMv = 2600;
      this.transition('BROWNOUT', 'forced under-voltage (chaos monkey)');
    }
    this.prevForceBrownout = this.chaos.forceBrownout;

    const result: VirtualTickResult = {
      snapshot: this.snapshot(),
      dropped: false,
      transitions: []
    };

    this.stepNetwork();
    this.checkBatteryState(result);

    switch (this.state) {
      case 'BOOT':
        this.stepBoot(result);
        break;
      case 'IDLE':
        this.stepIdle(result);
        break;
      case 'SAMPLE':
        this.stepSample(result);
        break;
      case 'TX':
        this.stepTx(result);
        break;
      case 'HIBERNATE':
        this.stepHibernate(result);
        break;
      case 'BROWNOUT':
        this.stepBrownout(result);
        break;
      case 'PANIC_WDT':
        this.stepPanic(result);
        break;
    }

    result.snapshot = this.snapshot();
    result.transitions = [...this.transitions];
    if (this.pendingStatuses.length > 0) result.status = this.pendingStatuses[0];
    return result;
  }

  snapshot(): VirtualHardwareState {
    return {
      ...this.hardware,
      state: this.state,
      powerState: this.powerStateForPct(this.hardware.batteryPct)
    };
  }

  injectChaos(settings: Partial<ChaosSettings>): void {
    this.epoch++;
    this.chaos = { ...this.chaos, ...settings };
    this.hardware.i2cLocked = this.chaos.i2cLockupTrigger;
  }

  chaosSnapshot(): ChaosSettings {
    return { ...this.chaos };
  }

  epochId(): number {
    return this.epoch;
  }

  droppedPackets(): number {
    return this.drops;
  }

  // ---- internals --------------------------------------------------------

  private voltsForPct(pct: number): number {
    // Returns MILLIVOLTS for batteryMv (SOC curve: 2.8V empty .. 4.0V full)
    return (VOLTS_EMPTY + (Math.max(0, pct) / 100) * (VOLTS_FULL - VOLTS_EMPTY)) * 1000;
  }

  private powerStateForPct(pct: number): PowerState {
    if (pct <= BATTERY_CRITICAL) return POWER_HIBERNATE;
    if (pct <= BATTERY_LOW) return POWER_LOW;
    return POWER_NORMAL;
  }

  private checkBatteryState(result: VirtualTickResult): void {
    const batteryPct = this.hardware.batteryPct;
    if (this.state === 'BOOT' || this.state === 'HIBERNATE' || this.state === 'BROWNOUT' || this.state === 'PANIC_WDT') {
      return; // only evaluate from normal running states
    }
    if (!this.lowBatteryWarned && batteryPct <= BATTERY_LOW) {
      this.lowBatteryWarned = true;
      this.pushAlert(result, {
        type: ALERT_LOW_BATTERY,
        severity: SEVERITY_WARNING,
        pigId: this.opts.profile?.id ?? PROFILE_D0WD.id,
        value: Math.round(batteryPct * 10) / 10,
        threshold: BATTERY_LOW,
        message: `Battery at ${batteryPct.toFixed(1)}%`,
        timestamp: Date.now()
      });
    }
    if (!this.lowBatteryCriticalWarned && batteryPct <= BATTERY_CRITICAL) {
      this.lowBatteryCriticalWarned = true;
      this.pushAlert(result, {
        type: ALERT_LOW_BATTERY,
        severity: SEVERITY_CRITICAL,
        pigId: this.opts.profile?.id ?? PROFILE_D0WD.id,
        value: Math.round(batteryPct * 10) / 10,
        threshold: BATTERY_CRITICAL,
        message: `Critical battery ${batteryPct.toFixed(1)}%, entering hibernation`,
        timestamp: Date.now()
      });
      this.transition('HIBERNATE', 'critical battery');
    }
  }

  private transition(to: FreeRtosState, reason: string): void {
    this.transitions.push({ from: this.state, to, reason, tick: this.tickCount });
    this.state = to;
    this.stateTicks = 0;
  }

  private stepNetwork(): void {
    if (this.beaconLossRemaining > 0) {
      this.beaconLossRemaining--;
      this.hardware.wifiConnected = false;
      this.hardware.wifiRssiDbm = -92;
    } else if (!this.hardware.wifiConnected) {
      // Attempt reconnect with full-jitter exponential backoff
      if (this.stateTicks % this.backoffTicks === 0) {
        if (this.rng() < 0.6) {
          this.hardware.wifiConnected = true;
          this.hardware.mqttConnected = true;
          this.backoffTicks = BACKOFF_MIN_TICKS;
          this.pendingStatuses.push({ online: true, timestamp: Date.now() });
        } else {
          this.backoffTicks = Math.min(this.backoffTicks * 2, BACKOFF_MAX_TICKS);
        }
      }
    } else {
      // Normal jitter on RSSI
      const wiggle = Math.floor((this.rng() - 0.5) * 16);
      this.hardware.wifiRssiDbm = Math.max(-100, Math.min(-45, -64 + wiggle));
    }
  }

  private maybeWeakWifiAlert(result: VirtualTickResult): void {
    if (this.hardware.wifiRssiDbm < WIFI_WEAK_RSSI && !this.weakWifiWarned) {
      this.weakWifiWarned = true;
      result.alert = [
        {
          type: ALERT_WEAK_WIFI,
          severity: SEVERITY_WARNING,
          pigId: this.opts.profile?.id ?? PROFILE_D0WD.id,
          value: this.hardware.wifiRssiDbm,
          threshold: WIFI_WEAK_RSSI,
          message: 'WiFi signal degraded below -85 dBm',
          timestamp: Date.now()
        }
      ];
    }
  }

  private stepBoot(result: VirtualTickResult): void {
    this.hardware.mqttConnected = false;
    if (this.stateTicks >= BOOT_TICKS) {
      this.hardware.mqttConnected = this.hardware.wifiConnected;
      this.transition('IDLE', 'boot complete');
      this.pendingStatuses.push({ online: this.hardware.wifiConnected, timestamp: Date.now() });
    }
    void result;
  }

  private stepIdle(result: VirtualTickResult): void {
    this.hardware.txSagActive = false;
    // Heap recovery while idle
    this.hardware.freeHeapBytes = Math.min(
      Math.floor((this.opts.profile ?? PROFILE_D0WD).sramBytes * 0.75),
      this.hardware.freeHeapBytes + HEAP_IDLE_RECOVERY
    );
    this.maybeWeakWifiAlert(result);

    const sampleDelay = IDLE_MIN_TICKS + Math.floor(this.rng() * (IDLE_MAX_TICKS - IDLE_MIN_TICKS + 1));
    if (this.stateTicks >= sampleDelay && this.hardware.freeHeapBytes > HEAP_ALLOC_MIN) {
      this.transition('SAMPLE', 'sample window open');
    }
  }

  private stepSample(result: VirtualTickResult): void {
    this.ticksSinceLastSample++;

    // Task watchdog: sampler starved too long by the network reconnect storm
    if (this.ticksSinceLastSample > STARVE_WDT_TICKS) {
      this.transition('PANIC_WDT', 'task watchdog timeout: sampler starved by network task');
      return;
    }

    // During an active beacon storm the network task runs a tight reconnect
    // loop and does NOT yield, starving the sampler (no progress, no WDT feed).
    if (this.beaconLossRemaining > 0) {
      return; // starved tick — sampler task never runs
    }

    // On each SAMPLE tick, consumption of heap; if below floor, allocation failure
    if (this.hardware.freeHeapBytes - HEAP_SAMPLE_DRAIN < HEAP_ALLOC_MIN) {
      this.hardware.overflowDrops++;
      this.hardware.freeHeapBytes = Math.max(0, this.hardware.freeHeapBytes - 1024);
      this.transition('IDLE', 'allocation failure (<32KB free heap)');
      return;
    }
    this.hardware.freeHeapBytes -= HEAP_SAMPLE_DRAIN;
    this.hardware.minFreeHeapBytes = Math.min(this.hardware.minFreeHeapBytes, this.hardware.freeHeapBytes);

    // I2C lock-up detection
    if (this.hardware.i2cLocked) {
      this.hardware.overflowDrops++;
      this.transition('IDLE', 'I2C SDA clamp: sensor read failed');
      return;
    }

    if (this.stateTicks >= SAMPLE_TICKS) {
      this.ticksSinceLastSample = 0;
      this.transition('TX', 'frame ready');
    }
    void result;
  }

  private stepTx(result: VirtualTickResult): void {
    if (this.stateTicks === 1) {
      // TX sag transient from radio burst (voltage dips, SOC unchanged)
      this.hardware.txSagActive = true;
      const sag =
        this.chaos.batterySagMv ??
        TX_SAG_MIN_MV + Math.floor(this.rng() * (TX_SAG_MAX_MV - TX_SAG_MIN_MV));
      this.hardware.batteryMv = Math.max(2500, this.voltsForPct(this.hardware.batteryPct) - sag);
    }

    if (this.hardware.batteryMv < 2800) {
      this.transition('BROWNOUT', 'battery below 2.8V during TX burst');
      return;
    }

    if (this.stateTicks >= TX_TICKS) {
      // Publish attempt: chaos packet loss drops it
      if (this.rng() < this.chaos.packetLossRate) {
        this.drops++;
        result.dropped = true;
      } else {
        result.telemetry = this.buildTelemetry();
        this.checkFeverAlert(result);
        this.hardware.batteryPct = Math.max(0, this.hardware.batteryPct - BATTERY_DRAIN_PER_PUBLISH_PCT);
      }
      this.hardware.txSagActive = false;
      this.hardware.batteryMv = this.voltsForPct(this.hardware.batteryPct);
      this.transition('IDLE', 'publish complete');
    }
  }

  private stepHibernate(result: VirtualTickResult): void {
    this.hardware.txSagActive = false;
    this.hardware.mqttConnected = false;
    this.hardware.freeHeapBytes = Math.floor((this.opts.profile ?? PROFILE_D0WD).sramBytes * 0.75);
    void result;
  }

  private stepBrownout(result: VirtualTickResult): void {
    this.hardware.batteryMv = 2600;
    this.hardware.batteryPct = 0;
    this.hardware.mqttConnected = false;
    if (this.stateTicks >= 1) {
      // Warm reboot: battery restored, I2C lock persists
      const restored = this.opts.initialBatteryPct ?? 98;
      this.hardware.batteryPct = restored;
      this.hardware.batteryMv = this.voltsForPct(restored);
      this.hardware.freeHeapBytes = Math.floor((this.opts.profile ?? PROFILE_D0WD).sramBytes * 0.75);
      this.hardware.i2cLocked = this.chaos.i2cLockupTrigger; // hardware latch survives
      this.lowBatteryWarned = false;
      this.lowBatteryCriticalWarned = false;
      this.transition('BOOT', 'warm reboot after brownout');
    }
    void result;
  }

  private stepPanic(result: VirtualTickResult): void {
    this.hardware.mqttConnected = false;
    if (this.stateTicks >= 2) {
      const restored = this.opts.initialBatteryPct ?? 98;
      this.hardware.batteryPct = restored;
      this.hardware.batteryMv = this.voltsForPct(restored);
      this.hardware.freeHeapBytes = Math.floor((this.opts.profile ?? PROFILE_D0WD).sramBytes * 0.75);
      this.ticksSinceLastSample = 0;
      this.transition('BOOT', 'task watchdog reset');
    }
    void result;
  }

  private checkFeverAlert(result: VirtualTickResult): void {
    const bodyTemp = this.lastBodyTemp ?? 38.6;
    if (!this.feverWarned && bodyTemp >= FEVER_WARNING) {
      this.feverWarned = true;
      this.pushAlert(result, {
        type: ALERT_FEVER,
        severity: bodyTemp >= FEVER_CRITICAL ? SEVERITY_CRITICAL : SEVERITY_WARNING,
        pigId: this.opts.profile?.id ?? PROFILE_D0WD.id,
        value: bodyTemp,
        threshold: FEVER_WARNING,
        message: `Body temp ${bodyTemp.toFixed(1)}C exceeds fever threshold`,
        timestamp: Date.now()
      });
    }
  }

  private lastBodyTemp = 38.6;

  /** Runtime host-driven overrides (barn environment → node). */
  private envOverride: SimEnvironmentOverride = {};

  /**
   * Let the barn environment drive the node's vitals instead of the internal
   * random model. Backward compatible: leaving fields unset falls back to the
   * original simulated path.
   */
  setEnvironment(env: SimEnvironmentOverride): void {
    this.envOverride = env;
  }

  private pushAlert(result: VirtualTickResult, alert: CanonAlertPayload): void {
    if (!result.alert) result.alert = [];
    result.alert.push(alert);
  }

  private buildTelemetry(): CanonTelemetryPayload {
    const profile = this.opts.profile ?? PROFILE_D0WD;
    const baseTemp = this.opts.pigBaseTemp ?? 38.6;

    // Environment override wins; otherwise internal base + noise.
    const bodyTemp =
      typeof this.envOverride.bodyTemp === 'number'
        ? Math.round(this.envOverride.bodyTemp * 10) / 10
        : Math.round((baseTemp + (this.rng() - 0.5) * 0.6) * 10) / 10;
    this.lastBodyTemp = bodyTemp;

    // Thermal frame from the 32x24 engine (pig position driven or center).
    const pos = this.envOverride.position;
    const pig: SimulatedPig = {
      id: profile.id,
      name: profile.name,
      x: pos ? Math.max(0, Math.min(31, Math.round(pos.x * 31))) : 16,
      y: pos ? Math.max(0, Math.min(23, Math.round(pos.y * 23))) : 12,
      baseTemp: bodyTemp,
      angleRad: 0,
      inFov: true
    };
    const ambient = this.chaos.ambientTempDrift;
    const frame = generateThermalFrame([pig], ambient, {
      mudBlotches: this.chaos.simulatedMudBlotches,
      noiseSigma: 0.15
    });
    const hotspot = extractFirmwareHotspot(frame);

    const ambientNoise = (this.rng() - 0.5) * 1.0;

    // Cough + trend: environment override wins over the random model.
    const coughRate =
      typeof this.envOverride.coughRate === 'number'
        ? Math.max(0, Math.round(this.envOverride.coughRate))
        : Math.max(0, Math.round(6 + (this.rng() - 0.5) * 6));
    const coughCluster = this.envOverride.trend ? this.envOverride.trend === TREND_CLUSTER : this.rng() > 0.85;
    const healthTrend =
      this.envOverride.trend ??
      (coughCluster ? TREND_CLUSTER : coughRate > 10 ? TREND_ELEVATED : TREND_STABLE);

    const batteryPct = Math.round(this.hardware.batteryPct * 10) / 10;
    const batteryV = this.hardware.batteryMv / 1000;
    const powerState: CanonTelemetryPayload['powerState'] =
      batteryPct <= BATTERY_CRITICAL ? POWER_HIBERNATE : batteryPct <= BATTERY_LOW ? POWER_LOW : POWER_NORMAL;

    const status: CanonTelemetryPayload['status'] = bodyTemp >= FEVER_CRITICAL || batteryPct <= BATTERY_CRITICAL
      ? SEVERITY_CRITICAL
      : bodyTemp >= FEVER_WARNING || batteryPct <= BATTERY_LOW || this.hardware.wifiRssiDbm < WIFI_WEAK_RSSI
        ? SEVERITY_WARNING
        : 'NORMAL';

    return {
      temperature: Math.round((ambient + ambientNoise) * 10) / 10,
      bodyTemp,
      pigId: profile.id,
      targetX: hotspot.targetX,
      targetY: hotspot.targetY,
      thermalFrame: encodeBase64Frame(frame),
      coughRate,
      coughCluster,
      healthTrend,
      batteryPct,
      batteryV: Math.round(batteryV * 100) / 100,
      powerState,
      wifiRssi: this.hardware.wifiRssiDbm,
      status,
      timestamp: Date.now()
    };
  }
}

export { PROFILE_D0WD, PROFILE_S3 };