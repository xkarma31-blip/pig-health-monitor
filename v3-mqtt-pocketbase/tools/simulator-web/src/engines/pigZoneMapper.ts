/**
 * Pig Zone Mapper — Maps zone alerts to actual pigs.
 *
 * Solves Issue 9: Farmer gets "Zone 2 fever" — which pig?
 * We can't ID individual pigs thermally. But we CAN say
 * "there's a pig in Zone 2" via thermal + CCTV fusion.
 *
 * Based on: Improved ByteTrack (Animals 2025) —
 * adapted for zone-level tracking only.
 */

export interface ZonePigMapping {
  zoneIndex: number;
  pigsInZone: Array<{
    pigId: string;
    confidence: number;
    x: number;
    y: number;
  }>;
  isEmpty: boolean;
  alertMapping: string; // human-readable alert message
}

export interface ZoneAlert {
  zoneIndex: number;
  type: 'FEVER' | 'COUGH' | 'FEVER_WARNING' | 'FEVER_CRITICAL';
  message: string;
  mappedPigIds: string[];
  mappingConfidence: number;
}

export interface PigVisibility {
  pigId: string;
  visible: boolean;
  detectedBy: ('thermal' | 'cctv' | 'both')[];
  lastSeenSec: number;
  x: number;
  y: number;
}

const ZONE_GRID = { cols: 2, rows: 2 };

function getZoneForPosition(normX: number, normY: number): number {
  const col = normX < 0.5 ? 0 : 1;
  const row = normY < 0.5 ? 0 : 1;
  return row * ZONE_GRID.cols + col;
}

export class PigZoneMapper {
  private zonePigs: Map<number, Set<string>> = new Map();
  private pigPositions: Map<string, { x: number; y: number; lastSeen: number }> = new Map();
  private cctvDetections: Map<string, boolean> = new Map(); // pigId → isCctvVisible

  /**
   * Map pigs to zones based on positions.
   */
  mapPositions(
    pigs: Array<{ id: string; x: number; y: number; lastSeenSec: number }>,
    cctvDetections?: Map<string, boolean>
  ): ZonePigMapping[] {
    if (cctvDetections) {
      this.cctvDetections = cctvDetections;
    }

    // Clear previous mappings
    this.zonePigs.clear();
    for (let i = 0; i < 4; i++) {
      this.zonePigs.set(i, new Set());
    }

    // Map each pig to a zone
    for (const pig of pigs) {
      this.pigPositions.set(pig.id, {
        x: pig.x,
        y: pig.y,
        lastSeen: pig.lastSeenSec
      });

      const zone = getZoneForPosition(pig.x, pig.y);
      this.zonePigs.get(zone)!.add(pig.id);
    }

    return this.buildMappings();
  }

  private buildMappings(): ZonePigMapping[] {
    const mappings: ZonePigMapping[] = [];

    for (let z = 0; z < 4; z++) {
      const pigsInZone = this.zonePigs.get(z)!;
      const pigList: ZonePigMapping['pigsInZone'] = [];

      for (const pigId of pigsInZone) {
        const pos = this.pigPositions.get(pigId);
        if (pos) {
          const cctvVisible = this.cctvDetections.get(pigId) ?? false;
          const confidence = cctvVisible ? 0.95 : 0.7; // thermal alone = lower confidence
          pigList.push({
            pigId,
            confidence,
            x: pos.x,
            y: pos.y
          });
        }
      }

      const mapping: ZonePigMapping = {
        zoneIndex: z,
        pigsInZone: pigList,
        isEmpty: pigList.length === 0,
        alertMapping: this.generateAlertMessage(z, pigList)
      };
      mappings.push(mapping);
    }

    return mappings;
  }

  private generateAlertMessage(zone: number, pigs: ZonePigMapping['pigsInZone']): string {
    if (pigs.length === 0) {
      return `Zone ${zone + 1}: No pigs detected — possible false alert`;
    }
    if (pigs.length === 1) {
      return `Zone ${zone + 1}: Alert for ${pigs[0].pigId} (${(pigs[0].confidence * 100).toFixed(0)}% confidence)`;
    }
    const names = pigs.map((p) => p.pigId).join(', ');
    return `Zone ${zone + 1}: Alert — ${pigs.length} pigs detected (${names})`;
  }

  /**
   * Convert a zone alert to a pig-level alert.
   */
  mapAlert(alert: ZoneAlert): ZoneAlert {
    const zone = this.zonePigs.get(alert.zoneIndex);
    const mappedPigs: string[] = [];
    let confidence = 0.5;

    if (zone && zone.size > 0) {
      for (const pigId of zone) {
        const cctvVisible = this.cctvDetections.get(pigId);
        mappedPigs.push(pigId);
        if (cctvVisible) confidence = Math.max(confidence, 0.95);
      }
      // Average confidence for multi-pig zones
      if (mappedPigs.length > 1) {
        confidence = (confidence + 0.7) / 2;
      }
    }

    // Ensure minimum confidence of 0.7 when pigs mapped
    confidence = mappedPigs.length > 0 ? Math.max(confidence, 0.7) : 0.5;

    return {
      ...alert,
      mappedPigIds: mappedPigs,
      mappingConfidence: confidence
    };
  }

  /** Get all pigs visible in a zone. */
  getPigsInZone(zone: number): string[] {
    return [...(this.zonePigs.get(zone) || [])];
  }

  /** Get which zones are occupied. */
  getOccupiedZones(): number[] {
    const occupied: number[] = [];
    for (let i = 0; i < 4; i++) {
      if ((this.zonePigs.get(i) || new Set()).size > 0) {
        occupied.push(i);
      }
    }
    return occupied;
  }

  /** Reset all mappings. */
  reset(): void {
    this.zonePigs.clear();
    this.pigPositions.clear();
    this.cctvDetections.clear();
  }
}
