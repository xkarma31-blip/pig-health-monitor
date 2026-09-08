import type { StorageStats } from '../engines/sensorFarm';
import { SIM_DAY_SEC } from '../engines/soundTalks';

export interface StoragePanelProps {
  stats: StorageStats;
  /** Active retention window in sim-seconds. */
  retentionSeconds: number;
  onRetentionChange: (seconds: number) => void;
  accessible?: boolean;
}

/** Honest wire-size estimate: B → KB → MB, one decimal. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WINDOW_OPTIONS = [
  { label: '1 sim-day', sec: 1 * SIM_DAY_SEC },
  { label: '3 sim-days', sec: 3 * SIM_DAY_SEC },
  { label: '7 sim-days (default)', sec: 7 * SIM_DAY_SEC },
  { label: '12 sim-days', sec: 12 * SIM_DAY_SEC },
  { label: '24 sim-days (≈ 24 h wall)', sec: 24 * SIM_DAY_SEC }
];

/**
 * The storage-ledger surface for the 24/7 deployment: how much telemetry is
 * retained, the hard cap, wire bytes, and how many rows aging/capacity threw
 * away — the "why is my disk filling up" answer in one panel.
 */
export function StoragePanel({ stats, retentionSeconds, onRetentionChange }: StoragePanelProps) {
  return (
    <section className="panel storage-panel" data-testid="storage-panel" aria-label="Telemetry storage retention">
      <h3>Telemetry Storage <span className="scene-hint">24/7 retention</span></h3>

      <ul className="storage-rows">
        <li data-testid="storage-retained">
          <span className="storage-label">Retained records</span>
          <b>{stats.retained.toLocaleString()}</b>
        </li>
        <li data-testid="storage-capacity">
          <span className="storage-label">Capacity cap</span>
          <b>{stats.capacity.toLocaleString()}</b>
        </li>
        <li data-testid="storage-bytes">
          <span className="storage-label">Estimated wire size</span>
          <b>{formatBytes(stats.estBytes)}</b>
        </li>
        <li data-testid="storage-evicted-age">
          <span className="storage-label">Evicted by age</span>
          <b>{stats.evictedByAge.toLocaleString()}</b>
        </li>
        <li data-testid="storage-evicted-capacity">
          <span className="storage-label">Evicted by capacity</span>
          <b>{stats.evictedByCapacity.toLocaleString()}</b>
        </li>
        <li className="storage-retention">
          <span className="storage-label">Retention window</span>
          <select
            data-testid="storage-retention"
            value={retentionSeconds}
            onChange={(e) => onRetentionChange(Number(e.target.value))}
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.sec} value={o.sec}>
                {o.label}
              </option>
            ))}
          </select>
        </li>
      </ul>

      <span className="sr-only">
        One accelerated sim day is {SIM_DAY_SEC} simulated seconds. Records age out past the
        retention window and oldest-first past the capacity cap, exactly like the live bridge database.
      </span>
    </section>
  );
}

export default StoragePanel;