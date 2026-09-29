/**
 * Multi-Pen Scaling — N-pen deployment strategy.
 *
 * Solves Issue 3: One sensor = one pen. How to scale?
 *
 * Based on the hardware reality: each pen needs its own
 * ESP32-S3 + INMP441 + MLX90640 stack. This engine models
 * the scaling economics and deployment topology.
 *
 * Research gap acknowledged: multi-pen mesh networking
 * is an engineering challenge beyond the current capstone scope.
 */

export interface PenConfig {
  id: string;
  penSize: { width: number; height: number }; // meters
  pigCount: number;
  sensorPosition?: { x: number; y: number }; // normalized 0..1
}

export interface DeploymentNode {
  nodeId: string;
  deviceId: string; // esp32-XXX
  penId: string;
  x: number; // pen units 0..1
  y: number;
  coverageRadius: number;
  powered: boolean;
  batteryPct: number;
  cost: number; // ₱ per node
}

export interface ScalingResult {
  totalNodes: number;
  totalCost: number;
  perPenCost: number;
  nodes: DeploymentNode[];
  perPen: DeploymentNode[];
  batteryHours: number; // estimated
  canScale: boolean;
  scalingNotes: string[];
}

const NODE_COST = {
  esp32s3: 400,
  inmp441: 200, // 2 mics
  mlx90640: 800,
  rpi4: 3500, // shared central
  cctv: 500, // optional per pen
  housing: 500
};

const BATTERY_PER_NODE_WH = 8; // Wh per node (10Ah 3.7V ≈ 37Wh, but ~20% usable)
const NODE_POWER_W = 0.5; // average watts per node (deep sleep + TX)

export class MultiPenScaler {
  calculateDeployment(pens: PenConfig[], options?: { includeCctv?: boolean }): ScalingResult {
    const includeCctv = options?.includeCctv ?? false;
    const perPenCost =
      NODE_COST.esp32s3 + NODE_COST.inmp441 + NODE_COST.mlx90640 + NODE_COST.housing + (includeCctv ? NODE_COST.cctv : 0);

    const nodes: DeploymentNode[] = [];
    const perPen: DeploymentNode[] = [];

    let nodeCounter = 1;
    for (const pen of pens) {
      const nodeId = `node-${nodeCounter}`;
      const deviceId = `esp32-${String(nodeCounter).padStart(3, '0')}`;
      const node: DeploymentNode = {
        nodeId,
        deviceId,
        penId: pen.id,
        x: pen.sensorPosition?.x ?? 0.5,
        y: pen.sensorPosition?.y ?? 0.5,
        coverageRadius: pen.pigCount > 10 ? 0.6 : 0.5,
        powered: true,
        batteryPct: 100,
        cost: perPenCost
      };
      nodes.push(node);
      perPen.push(node);
      nodeCounter++;
    }

    const totalCost = perPenCost * pens.length + NODE_COST.rpi4; // RPi shared
    const batteryHours = Math.round((BATTERY_PER_NODE_WH / NODE_POWER_W) * 0.8); // 80% efficiency

    const scalingNotes: string[] = [
      `Each pen requires 1 node (ESP32-S3 + INMP441×2 + MLX90640 + housing)`,
      `Central RPi 4 shared across all pens via MQTT broker`,
      `Scaling is LINEAR: N pens = N nodes (₱${perPenCost.toLocaleString()} each)`,
      `Multi-pen MQTT broker handles N device subscriptions`,
      `Battery life: ~${batteryHours}h per node (10Ah LiPo)`
    ];

    return {
      totalNodes: pens.length,
      totalCost,
      perPenCost,
      nodes,
      perPen,
      batteryHours,
      canScale: true,
      scalingNotes
    };
  }

  /** Cost breakdown for a single node. */
  getNodeCostBreakdown(includeCctv = false): Record<string, number> {
    const breakdown: Record<string, number> = { ...NODE_COST };
    if (!includeCctv) {
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(breakdown)) {
        if (k !== 'cctv') result[k] = v;
      }
      return result;
    }
    return breakdown;
  }

  /** Total cost for N pens. */
  estimateTotalCost(pens: number, includeCctv = false): { hardware: number; perPen: number; nodes: number } {
    const perPen = this.getNodeCostBreakdown(includeCctv);
    const perPenTotal = Object.values(perPen).reduce((a, b) => a + b, 0);
    return {
      hardware: perPenTotal * pens + NODE_COST.rpi4,
      perPen: perPenTotal,
      nodes: pens
    };
  }
}
