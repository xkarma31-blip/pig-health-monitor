import { describe, it, expect } from 'vitest';
import { OcclusionAnalyzer } from '../occlusionAnalyzer';

describe('OcclusionAnalyzer', () => {
  it('should detect occlusion from feeders', () => {
    const analyzer = new OcclusionAnalyzer();
    analyzer.addObstacle({
      type: 'feeder',
      x: 0.2, y: 0.2,
      width: 0.3, height: 0.3
    });
    analyzer.setZonePigs(0, 2, 4); // 2 visible, 4 estimated

    const zones = analyzer.analyzeAllZones();
    expect(zones[0].occlusionRisk).toBeGreaterThan(0);
    expect(zones[0].status).toBe('CONGESTED');
  });

  it('should handle empty zones', () => {
    const analyzer = new OcclusionAnalyzer();
    analyzer.setZonePigs(0, 0, 0);

    const zones = analyzer.analyzeAllZones();
    expect(zones[0].confidence).toBe(100);
    expect(zones[0].status).toBe('CLEAR');
  });

  it('should report risk summary', () => {
    const analyzer = new OcclusionAnalyzer();
    analyzer.addObstacle({
      type: 'wall', x: 0.1, y: 0.1,
      width: 0.4, height: 0.4
    });

    const summary = analyzer.getRiskSummary();
    expect(summary[0].risk).toBeGreaterThan(0);
  });

  it('should reset', () => {
    const analyzer = new OcclusionAnalyzer();
    analyzer.addObstacle({
      type: 'feeder', x: 0.2, y: 0.2,
      width: 0.3, height: 0.3
    });
    analyzer.reset();
    const zones = analyzer.analyzeAllZones();
    expect(zones.every((z) => z.occlusionRisk === 0)).toBe(true);
  });
});
