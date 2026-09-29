/**
 * Occlusion Analyzer — Zone confidence scoring
 * based on occlusion likelihood.
 *
 * Solves Issue 5: Pigs clustering, hiding behind objects.
 *
 * Based on research: pigs cluster for warmth and social bonding.
 * Occlusion increases clustering behavior. Solution is
 * multi-zone coverage with confidence scoring.
 */

export interface OcclusionRisk {
  zoneIndex: number;
  riskScore: number; // 0-1, higher = more likely occluded
  blockedBy: string[]; // what blocks view
  hiddenPigs: number; // estimated pigs hidden
  confidence: number; // detection confidence given occlusion
}

export interface ZoneConfidence {
  zoneIndex: number;
  confidence: number; // 0-100% detection confidence
  occlusionRisk: number; // 0-1 occlusion risk
  estimatedPigs: number; // visible pigs
  hiddenPigsEstimate: number;
  status: 'CLEAR' | 'OCCLUDED' | 'CONGESTED';
}

export interface Obstacle {
  type: 'feeder' | 'waterer' | 'wall' | 'bale';
  x: number; // norm 0-1
  y: number;
  width: number; // norm
  height: number;
}

const OCCLUSION_BLOCKERS: Record<string, number> = {
  feeder: 0.4,
  waterer: 0.2,
  wall: 0.6,
  bale: 0.3
};

const CONGESTION_THRESHOLD = 3; // pigs/m²

export class OcclusionAnalyzer {
  private obstacles: Obstacle[];
  private zonesWithPigs: Map<number, { visible: number; estimatedTotal: number }> = new Map();

  constructor(obstacles: Obstacle[] = []) {
    this.obstacles = obstacles;
  }

  addObstacle(obstacle: Obstacle): void {
    this.obstacles.push(obstacle);
  }

  /** Set pig count per zone (from thermal/CCTV detection). */
  setZonePigs(zoneIndex: number, visible: number, estimatedTotal: number): void {
    this.zonesWithPigs.set(zoneIndex, { visible, estimatedTotal });
  }

  /**
   * Analyze occlusion risk for all zones.
   */
  analyzeAllZones(penWidth = 4, penHeight = 4): ZoneConfidence[] {
    const zones: ZoneConfidence[] = [];
    const zoneSize = penWidth / 2; // 2×2 zones

    for (let z = 0; z < 4; z++) {
      const col = z % 2;
      const row = Math.floor(z / 2);
      const zoneX = col * zoneSize;
      const zoneY = row * zoneSize;

      // Calculate occlusion risk from obstacles in this zone
      let occlusionRisk = 0;
      const blockedBy: string[] = [];

      for (const obs of this.obstacles) {
        // Check if obstacle is in this zone
        const obsZoneCol = Math.floor(obs.x * penWidth / zoneSize);
        const obsZoneRow = Math.floor(obs.y * penHeight / zoneSize);
        const obsZone = obsZoneRow * 2 + obsZoneCol;

        if (obsZone === z && obs.width > 0.1) {
          const risk = OCCLUSION_BLOCKERS[obs.type] ?? 0.2;
          occlusionRisk = Math.max(occlusionRisk, risk);
          blockedBy.push(obs.type);
        }
      }

      // Pig density occlusion
      const pigData = this.zonesWithPigs.get(z);
      const visiblePigs = pigData?.visible ?? 0;
      const estimatedTotal = pigData?.estimatedTotal ?? visiblePigs;
      const hiddenPigs = Math.max(0, estimatedTotal - visiblePigs);

      // Confidence: lower if occlusion risk is high
      let confidence = 100 * (1 - occlusionRisk);
      if (hiddenPigs > 0) {
        confidence *= 0.7; // penalty for hidden pigs
      }
      if (visiblePigs > 0 && estimatedTotal > visiblePigs) {
        confidence *= 0.85;
      }
      confidence = Math.round(confidence);

      let status: ZoneConfidence['status'] = 'CLEAR';
      if (occlusionRisk > 0.5) {
        status = 'OCCLUDED';
      } else if (estimatedTotal >= CONGESTION_THRESHOLD) {
        status = 'CONGESTED';
      }

      zones.push({
        zoneIndex: z,
        confidence,
        occlusionRisk: Math.round(occlusionRisk * 100) / 100,
        estimatedPigs: visiblePigs,
        hiddenPigsEstimate: hiddenPigs,
        status
      });
    }

    return zones;
  }

  /** Get a summary of the worst zones. */
  getRiskSummary(): { zone: number; risk: number }[] {
    const zones = this.analyzeAllZones();
    return zones
      .map((z) => ({ zone: z.zoneIndex, risk: z.occlusionRisk }))
      .sort((a, b) => b.risk - a.risk);
  }

  getObstacles(): Obstacle[] {
    return [...this.obstacles];
  }

  reset(): void {
    this.obstacles = [];
    this.zonesWithPigs.clear();
  }
}
