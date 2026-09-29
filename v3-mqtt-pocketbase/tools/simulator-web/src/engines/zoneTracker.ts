/**
 * Zone-level pig tracking persistence.
 *
 * Research: Improved ByteTrack (Animals 2025) — adapted
 * for zone-level tracking (not individual ID).
 *
 * Key insight: We do not need WHICH pig. We need WHICH ZONE
 * is affected and for how long.
 */

export interface ZoneId { zoneIndex: number; }
export interface ZoneAssignment {
  zoneIndex: number;
  pigId: string;
  enteredAtSec: number;
  confidence: number;
}
export interface ZoneTrack {
  zoneIndex: number;
  currentPigId: string | null;
  timeInZone: number;
  totalPigChanges: number;
  historicalAssignments: ZoneAssignment[];
  alertCount: number;
  lastAlertAtSec: number | null;
}
export interface ZoneUpdate {
  timeSec: number;
  pigId: string;
  newZone: number;
  previousZone: number | null;
}

const ZONE_GRID = { cols: 2, rows: 2 };

function getZoneForPosition(normX: number, normY: number): number {
  const col = normX < 0.5 ? 0 : 1;
  const row = normY < 0.5 ? 0 : 1;
  return row * ZONE_GRID.cols + col;
}

export class ZoneTracker {
  private zones: Map<number, ZoneTrack> = new Map();
  private pigCurrentZone: Map<string, number> = new Map();
  private updates: ZoneUpdate[] = [];

  constructor(zoneCount = 4) {
    for (let i = 0; i < zoneCount; i++) {
      this.zones.set(i, {
        zoneIndex: i,
        currentPigId: null,
        timeInZone: 0,
        totalPigChanges: 0,
        historicalAssignments: [],
        alertCount: 0,
        lastAlertAtSec: null
      });
    }
  }

  update(pigId: string, normX: number, normY: number, timeSec: number): ZoneUpdate | null {
    const newZone = getZoneForPosition(normX, normY);
    const prevZone = this.pigCurrentZone.get(pigId);

    if (prevZone === undefined) {
      this.pigCurrentZone.set(pigId, newZone);
      this.assignZone(newZone, pigId, timeSec);
      return { timeSec, pigId, newZone, previousZone: null };
    }

    if (prevZone === newZone) {
      const zone = this.zones.get(newZone);
      if (zone) zone.timeInZone += 0.25;
      return null;
    }

    this.pigCurrentZone.set(pigId, newZone);

    if (prevZone !== null) {
      const oldZone = this.zones.get(prevZone);
      if (oldZone && oldZone.currentPigId === pigId) {
        oldZone.currentPigId = null;
        oldZone.timeInZone = 0;
      }
    }

    this.assignZone(newZone, pigId, timeSec);
    const update: ZoneUpdate = { timeSec, pigId, newZone, previousZone: prevZone };
    this.updates.push(update);
    return update;
  }

  private assignZone(zoneIdx: number, pigId: string, timeSec: number) {
    const zone = this.zones.get(zoneIdx);
    if (!zone) return;
    if (zone.currentPigId !== null && zone.currentPigId !== pigId) {
      zone.totalPigChanges++;
    }
    zone.currentPigId = pigId;
    zone.timeInZone = 0;
    zone.historicalAssignments.push({
      zoneIndex: zoneIdx,
      pigId,
      enteredAtSec: timeSec,
      confidence: 1.0
    });
  }

  /** Record an alert for a zone. */
  recordAlert(zoneIdx: number, timeSec: number): void {
    const zone = this.zones.get(zoneIdx);
    if (!zone) return;
    zone.alertCount++;
    zone.lastAlertAtSec = timeSec;
  }

  getPigZone(pigId: string): number | null {
    return this.pigCurrentZone.get(pigId) ?? null;
  }

  getZone(zoneIdx: number): ZoneTrack | undefined {
    return this.zones.get(zoneIdx);
  }

  getAllZones(): ZoneTrack[] {
    return [...this.zones.values()];
  }

  getOccupiedZones(): ZoneTrack[] {
    return this.getAllZones().filter((z) => z.currentPigId !== null);
  }

  getActiveAlertZones(currentTimeSec: number, windowSec = 60): ZoneTrack[] {
    return this.getAllZones().filter(
      (z) => z.lastAlertAtSec !== null && (currentTimeSec - z.lastAlertAtSec!) < windowSec
    );
  }

  getPigTimeInZone(pigId: string): number {
    const zoneIdx = this.pigCurrentZone.get(pigId);
    if (zoneIdx === undefined) return 0;
    const zone = this.zones.get(zoneIdx);
    return zone?.timeInZone ?? 0;
  }

  reset(): void {
    this.pigCurrentZone.clear();
    this.updates.length = 0;
    for (const zone of this.zones.values()) {
      zone.currentPigId = null;
      zone.timeInZone = 0;
      zone.totalPigChanges = 0;
      zone.historicalAssignments = [];
      zone.alertCount = 0;
      zone.lastAlertAtSec = null;
    }
  }
}
