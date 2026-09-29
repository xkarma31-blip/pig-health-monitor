import { describe, it, expect } from 'vitest';
import { PigZoneMapper } from '../pigZoneMapper';

describe('PigZoneMapper', () => {
  it('should map pigs to zones', () => {
    const mapper = new PigZoneMapper();
    const mappings = mapper.mapPositions([
      { id: 'pig-1', x: 0.2, y: 0.3, lastSeenSec: 0 },
      { id: 'pig-2', x: 0.7, y: 0.3, lastSeenSec: 0 }
    ]);

    expect(mappings[0].isEmpty).toBe(false);
    expect(mappings[0].pigsInZone.length).toBe(1);
    expect(mappings[1].isEmpty).toBe(false);
    expect(mappings[1].pigsInZone.length).toBe(1);
    expect(mappings[2].isEmpty).toBe(true);
    expect(mappings[3].isEmpty).toBe(true);
  });

  it('should generate alert messages', () => {
    const mapper = new PigZoneMapper();
    const mappings = mapper.mapPositions([
      { id: 'pig-1', x: 0.2, y: 0.3, lastSeenSec: 0 }
    ]);

    expect(mappings[0].alertMapping).toContain('pig-1');
    expect(mappings[2].alertMapping).toContain('No pigs detected');
  });

  it('should handle CCTV confidence', () => {
    const mapper = new PigZoneMapper();
    const cctv = new Map([['pig-1', true], ['pig-2', false]]);
    const mappings = mapper.mapPositions(
      [
        { id: 'pig-1', x: 0.2, y: 0.3, lastSeenSec: 0 },
        { id: 'pig-2', x: 0.7, y: 0.7, lastSeenSec: 0 }
      ],
      cctv
    );
    expect(mappings[0].pigsInZone[0].confidence).toBe(0.95);
  });

  it('should map alerts to pigs', () => {
    const mapper = new PigZoneMapper();
    mapper.mapPositions([
      { id: 'pig-1', x: 0.2, y: 0.3, lastSeenSec: 0 }
    ]);

    const alert = mapper.mapAlert({
      zoneIndex: 0,
      type: 'FEVER',
      message: 'Fever detected',
      mappedPigIds: [],
      mappingConfidence: 0.5
    });

    expect(alert.mappedPigIds).toContain('pig-1');
    expect(alert.mappingConfidence).toBeGreaterThanOrEqual(0.7);
  });

  it('should report occupied zones', () => {
    const mapper = new PigZoneMapper();
    mapper.mapPositions([
      { id: 'pig-1', x: 0.2, y: 0.3, lastSeenSec: 0 },
      { id: 'pig-2', x: 0.7, y: 0.7, lastSeenSec: 0 }
    ]);

    const occupied = mapper.getOccupiedZones();
    expect(occupied.length).toBe(2);
    expect(occupied).toContain(0);
    expect(occupied).toContain(3);
  });

  it('should reset', () => {
    const mapper = new PigZoneMapper();
    mapper.mapPositions([{ id: 'pig-1', x: 0.2, y: 0.3, lastSeenSec: 0 }]);
    mapper.reset();
    expect(mapper.getOccupiedZones().length).toBe(0);
  });
});
