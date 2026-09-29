import { describe, it, expect } from 'vitest';
import { ZoneTracker } from '../zoneTracker';

describe('ZoneTracker', () => {
  it('should track 4 zones', () => {
    const tracker = new ZoneTracker(4);
    const zones = tracker.getAllZones();
    expect(zones.length).toBe(4);
    zones.forEach((z) => {
      expect(z.currentPigId).toBeNull();
      expect(z.alertCount).toBe(0);
    });
  });

  it('should assign pig to a zone', () => {
    const tracker = new ZoneTracker(4);
    const update = tracker.update('pig-1', 0.2, 0.3, 0);
    expect(update).not.toBeNull();
    expect(update!.newZone).toBe(0);
    expect(tracker.getPigZone('pig-1')).toBe(0);
    const zone = tracker.getZone(0);
    expect(zone?.currentPigId).toBe('pig-1');
  });

  it('should detect zone changes', () => {
    const tracker = new ZoneTracker(4);
    tracker.update('pig-1', 0.2, 0.3, 0); // zone 0
    const update = tracker.update('pig-1', 0.7, 0.3, 10); // zone 1
    expect(update!.newZone).toBe(1);
    expect(update!.previousZone).toBe(0);
    expect(tracker.getPigZone('pig-1')).toBe(1);
  });

  it('should track time in zone', () => {
    const tracker = new ZoneTracker(4);
    tracker.update('pig-1', 0.2, 0.2, 0);
    tracker.update('pig-1', 0.2, 0.2, 5);
    tracker.update('pig-1', 0.2, 0.2, 10);
    const zone = tracker.getZone(0);
    expect(zone?.timeInZone).toBeGreaterThan(0);
  });

  it('should record alerts', () => {
    const tracker = new ZoneTracker(4);
    tracker.update('pig-1', 0.2, 0.2, 0);
    tracker.recordAlert(0, 15);
    const zone = tracker.getZone(0);
    expect(zone?.alertCount).toBe(1);
    expect(zone?.lastAlertAtSec).toBe(15);
  });

  it('should track multiple pigs', () => {
    const tracker = new ZoneTracker(4);
    tracker.update('pig-1', 0.2, 0.2, 0);
    tracker.update('pig-2', 0.7, 0.7, 0);
    expect(tracker.getPigZone('pig-1')).toBe(0);
    expect(tracker.getPigZone('pig-2')).toBe(3);
  });

  it('should return occupied zones', () => {
    const tracker = new ZoneTracker(4);
    tracker.update('pig-1', 0.2, 0.2, 0);
    tracker.update('pig-2', 0.7, 0.7, 0);
    const occupied = tracker.getOccupiedZones();
    expect(occupied.length).toBe(2);
  });

  it('should reset all tracking', () => {
    const tracker = new ZoneTracker(4);
    tracker.update('pig-1', 0.2, 0.2, 0);
    tracker.recordAlert(0, 10);
    tracker.reset();
    expect(tracker.getPigZone('pig-1')).toBeNull();
    expect(tracker.getZone(0)?.alertCount).toBe(0);
  });
});
