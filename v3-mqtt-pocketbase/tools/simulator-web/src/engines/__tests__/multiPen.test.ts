import { describe, it, expect } from 'vitest';
import { MultiPenScaler } from '../multiPen';

describe('MultiPenScaler', () => {
  it('should calculate cost for 1 pen', () => {
    const scaler = new MultiPenScaler();
    const result = scaler.estimateTotalCost(1);
    expect(result.nodes).toBe(1);
    expect(result.perPen).toBeGreaterThan(0);
    expect(result.hardware).toBeGreaterThan(5000); // RPi + 1 node
  });

  it('should scale linearly for 4 pens', () => {
    const scaler = new MultiPenScaler();
    const one = scaler.estimateTotalCost(1);
    const four = scaler.estimateTotalCost(4);
    expect(four.nodes).toBe(4);
    expect(four.hardware).toBeGreaterThan(one.hardware);
    expect(four.hardware).toBeLessThan(one.hardware * 4 + 3500); // RPi shared
  });

  it('should include CCTV in cost', () => {
    const scaler = new MultiPenScaler();
    const withCctv = scaler.estimateTotalCost(1, true);
    const withoutCctv = scaler.estimateTotalCost(1, false);
    expect(withCctv.hardware).toBeGreaterThan(withoutCctv.hardware);
  });

  it('should return scaling notes', () => {
    const scaler = new MultiPenScaler();
    const result = scaler.calculateDeployment([{ id: 'pen-1', penSize: { width: 4, height: 4 }, pigCount: 10 }]);
    expect(result.canScale).toBe(true);
    expect(result.scalingNotes.length).toBeGreaterThan(0);
    expect(result.scalingNotes.some((n) => n.includes('LINEAR'))).toBe(true);
  });

  it('should deploy nodes per pen', () => {
    const scaler = new MultiPenScaler();
    const result = scaler.calculateDeployment([
      { id: 'pen-1', penSize: { width: 4, height: 4 }, pigCount: 10 },
      { id: 'pen-2', penSize: { width: 4, height: 4 }, pigCount: 10 }
    ]);
    expect(result.nodes.length).toBe(2);
    expect(result.nodes[0].deviceId).toContain('esp32');
  });

  it('should estimate battery hours', () => {
    const scaler = new MultiPenScaler();
    const result = scaler.calculateDeployment([{ id: 'pen-1', penSize: { width: 4, height: 4 }, pigCount: 10 }]);
    expect(result.batteryHours).toBeGreaterThan(10);
    expect(result.batteryHours).toBeLessThan(100);
  });
});
