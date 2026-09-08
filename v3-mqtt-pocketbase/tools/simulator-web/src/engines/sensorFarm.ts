/**
 * Sensor farm — the hardware layer of the capstone emulation.
 *
 * Grounded in the live deployment (measured 2026-09-08):
 *   - Devices collection has esp32-001 / esp32-002 (online 78% / 77% battery)
 *   - Bridge writes telemetry to PocketBase `telemetry` collection with the
 *     real 8 columns: deviceId, timestamp, temperature, bodyTemp, pigId,
 *     status, batteryPct, wifiRssi
 *   - Firmware DEVICE_ID is the MQTT client identity (pig/esp32-001/...)
 *
 * The farm is the "place and replace hardware" surface:
 *   - Nodes have a position + coverage radius in pen units
 *   - A node watches the NEAREST pig inside its coverage radius
 *   - RSSI is derived from geometry (free-space-ish path loss) so moving a
 *     node closer to its pig measurably improves the link
 *   - RSSI below the firmware weak threshold feeds packet loss
 *   - Powered-off / removed nodes stop producing telemetry
 *
 * Each node owns a VirtualEsp32Node whose vitals are overridden from the
 * watched pig's BarnEnvironment state (same causal direction as the live
 * bridge: env → firmware → MQTT → DB).
 */

import { VirtualEsp32Node, VirtualTickResult } from './virtualEsp32';
import { ChaosSettings } from '../types/chaos';
import { PigActorState } from './environment';
import { CanonAlertPayload, CanonTelemetryPayload, WIFI_WEAK_RSSI } from '../types/canonMqtt';

export interface SensorNodeConfig {
  id: string; // matches live `devices` deviceId (esp32-001 …)
  x?: number; // pen units 0..1
  y?: number;
  coverageRadius?: number; // pen units; default covers the whole pen
  powered?: boolean;
  batteryPct?: number;
  chaos?: Partial<ChaosSettings>;
  seed?: number;
}

export interface SensorNodeState {
  id: string;
  x: number;
  y: number;
  coverageRadius: number;
  powered: boolean;
  batteryPct: number;
  online: boolean; // powered && battery above hibernation threshold
  watchedPigId: string | null;
  rssiDbm: number;
  packetLossRate: number; // effective loss fed to the node's chaos engine
}

/** Real PocketBase `telemetry` record shape (8 columns). */
export interface FarmTelemetryRecord {
  deviceId: string;
  timestamp: number;
  temperature: number;
  bodyTemp: number;
  pigId: string;
  status: CanonTelemetryPayload['status'];
  batteryPct: number;
  wifiRssi: number;
}

export interface FarmTickResult {
  nodes: SensorNodeState[];
  telemetry: FarmTelemetryRecord[];
  /** Firmware alerts issued by nodes (deviceId + canonical payload). */
  alerts: Array<{ deviceId: string; alert: CanonAlertPayload }>;
  /** Publish attempts that chaos dropped (deviceId, reason). */
  drops: Array<{ deviceId: string; reason: string }>;
  raw: Array<{ deviceId: string; telemetry?: CanonTelemetryPayload; dropped: boolean }>;
}

const DEFAULT_COVERAGE_RADIUS = 0.5;
const RSSI_REF_DIST = 0.08; // pen units at which RSSI ≈ -55 dBm
const RSSI_REF_DBM = -55;
const RSSI_PATH_LOSS_EXP = 30; // dB per decade

/** Free-space-ish path loss: rssi(dBm) = ref - 30·log10(d/ref). */
export function rssiForDistance(dist: number): number {
  const d = Math.max(dist, 0.01);
  return Math.round(
    Math.max(-100, Math.min(-40, RSSI_REF_DBM - RSSI_PATH_LOSS_EXP * Math.log10(d / RSSI_REF_DIST)))
  );
}

/** Nearest-neighbor geometry, bounded by coverage radius. */
export function resolveWatchedPig(
  node: { x: number; y: number; coverageRadius: number },
  pigs: PigActorState[]
): { pigId: string | null; dist: number } {
  let best: string | null = null;
  let bestDist = node.coverageRadius;
  for (const pig of pigs) {
    const d = Math.hypot(pig.x - node.x, pig.y - node.y);
    if (d <= bestDist) {
      bestDist = d;
      best = pig.id;
    }
  }
  return { pigId: best, dist: bestDist };
}

export class SensorFarm {
  private nodes: Map<string, { cfg: SensorNodeConfig; node: VirtualEsp32Node }> = new Map();

  constructor(configs: SensorNodeConfig[] = [], readonly defaultSeed = 0x5EED) {
    for (const cfg of configs) this.addNode(cfg);
  }

  /** Place new hardware (throws on duplicate device id). */
  addNode(cfg: SensorNodeConfig): SensorNodeState {
    if (this.nodes.has(cfg.id)) throw new Error(`Duplicate node ${cfg.id}`);
    const seed =
      cfg.seed ?? (defaultSeedFrom(cfg.id, this.defaultSeed));
    const node = new VirtualEsp32Node({
      seed,
      initialBatteryPct: cfg.batteryPct ?? 100,
      chaos: cfg.chaos
    });
    this.nodes.set(cfg.id, { cfg: { ...cfg }, node });
    return this.nodeView(this.nodes.get(cfg.id)!, []);
  }

  /** Remove hardware (device leaves the network). */
  removeNode(nodeId: string): void {
    if (!this.nodes.delete(nodeId)) throw new Error(`Unknown node ${nodeId}`);
  }

  /** Move hardware; RSSI to the watched pig follows the geometry. */
  moveNode(nodeId: string, x: number, y: number): void {
    const entry = this.nodes.get(nodeId);
    if (!entry) throw new Error(`Unknown node ${nodeId}`);
    entry.cfg.x = x;
    entry.cfg.y = y;
  }

  setPowered(nodeId: string, powered: boolean): void {
    const entry = this.nodes.get(nodeId);
    if (!entry) throw new Error(`Unknown node ${nodeId}`);
    entry.cfg.powered = powered;
  }

  setCoverage(nodeId: string, radius: number): void {
    const entry = this.nodes.get(nodeId);
    if (!entry) throw new Error(`Unknown node ${nodeId}`);
    entry.cfg.coverageRadius = radius;
  }

  nodeState(nodeId: string, pigs: PigActorState[] = []): SensorNodeState | undefined {
    const entry = this.nodes.get(nodeId);
    return entry ? this.nodeView(entry, pigs) : undefined;
  }

  get nodeIds(): string[] {
    return [...this.nodes.keys()];
  }

  collectSnapshot(pigs: PigActorState[] = []): SensorNodeState[] {
    return [...this.nodes.values()].map((e) => this.nodeView(e, pigs));
  }

  /**
   * Advance all powered nodes. Each watches the nearest in-coverage pig and
   * publishes real 8-column telemetry when the pig is inside its radius.
   */
  tick(pigs: PigActorState[]): FarmTickResult {
    const result: FarmTickResult = { nodes: [], telemetry: [], alerts: [], drops: [], raw: [] };
    for (const [id, entry] of this.nodes) {
      const cfg = entry.cfg;
      const powered = cfg.powered ?? true;
      const pos = { x: cfg.x ?? 0.5, y: cfg.y ?? 0.5 };
      const radius = cfg.coverageRadius ?? DEFAULT_COVERAGE_RADIUS;

      // Geometry → link quality before the node ticks, so the node's chaos
      // engine sees the loss that placement actually causes.
      const { pigId, dist } = resolveWatchedPig({ ...pos, coverageRadius: radius }, pigs);
      const rssi = rssiForDistance(dist);
      const weakLink = rssi < WIFI_WEAK_RSSI; // existing firmware threshold
      const effectiveLoss = weakLink ? 0.5 : 0.02; // weak link ≈ half of publishes dropped

      if (powered) {
        // Wire the watched pig's vitals into the node the same way the live
        // bridge does (env → firmware): body temp, cough trend, position.
        const watched = pigId ? pigs.find((p) => p.id === pigId) : undefined;
        entry.node.setEnvironment({
          bodyTemp: watched?.coreTemp,
          coughRate: undefined, // node derives it; we keep the override surface honest
          trend: undefined,
          position: watched ? { x: watched.x, y: watched.y } : undefined
        });
        entry.node.injectChaos({ packetLossRate: effectiveLoss });
      } else {
        entry.node.injectChaos({ packetLossRate: 1 }); // powered off → nothing transmits
      }

      const tickRes: VirtualTickResult = entry.node.tick();
      if (tickRes.dropped) {
        result.drops.push({ deviceId: id, reason: weakLink ? 'weak link (placement)' : 'chaos drop' });
      }
      if (tickRes.alert && tickRes.alert.length > 0) {
        for (const a of tickRes.alert) result.alerts.push({ deviceId: id, alert: a });
      }
      if (tickRes.telemetry && pigId && powered) {
        result.telemetry.push(toRecord(id, tickRes.telemetry, rssi, pigId));
      }
      result.raw.push({ deviceId: id, telemetry: tickRes.telemetry, dropped: tickRes.dropped });
      result.nodes.push(
        this.nodeView(entry, pigs, { watchedPigId: pigId, rssiDbm: rssi, packetLossRate: effectiveLoss })
      );
    }
    return result;
  }

  private nodeView(
    entry: { cfg: SensorNodeConfig; node: VirtualEsp32Node },
    pigs: PigActorState[],
    resolved: { watchedPigId?: string | null; rssiDbm?: number; packetLossRate?: number } = {}
  ): SensorNodeState {
    const snap = entry.node.snapshot();
    const cfg = entry.cfg;
    const powered = cfg.powered ?? true;
    const watched =
      resolved.watchedPigId !== undefined
        ? resolved.watchedPigId
        : resolveWatchedPig(
            { x: cfg.x ?? 0.5, y: cfg.y ?? 0.5, coverageRadius: cfg.coverageRadius ?? DEFAULT_COVERAGE_RADIUS },
            pigs
          ).pigId;
    return {
      id: cfg.id,
      x: cfg.x ?? 0.5,
      y: cfg.y ?? 0.5,
      coverageRadius: cfg.coverageRadius ?? DEFAULT_COVERAGE_RADIUS,
      powered,
      batteryPct: snap.batteryPct,
      online: powered && snap.powerState !== 'HIBERNATE',
      watchedPigId: watched,
      rssiDbm: resolved.rssiDbm ?? -64,
      packetLossRate: resolved.packetLossRate ?? 0.02
    };
  }
}

/** Stable per-node seed from its id (deterministic across farms). */
function defaultSeedFrom(id: string, base: number): number {
  let h = base ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x85ebca6b);
  }
  return (h ^ (h >>> 13)) >>> 0;
}

function toRecord(
  deviceId: string,
  t: CanonTelemetryPayload,
  wifiRssi: number,
  pigId: string
): FarmTelemetryRecord {
  return {
    deviceId,
    timestamp: t.timestamp,
    temperature: t.temperature,
    bodyTemp: t.bodyTemp,
    pigId, // real watched pig id, not the node profile id
    status: t.status,
    batteryPct: t.batteryPct,
    wifiRssi
  };
}