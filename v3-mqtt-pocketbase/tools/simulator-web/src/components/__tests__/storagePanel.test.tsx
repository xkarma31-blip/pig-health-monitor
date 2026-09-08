import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import { StoragePanel } from '../StoragePanel';
import { StorageStats } from '../../engines/sensorFarm';

const stats: StorageStats = {
  retained: 1234,
  capacity: 20_000,
  evictedByAge: 88,
  evictedByCapacity: 3,
  estBytes: 289_400 // ≈ 1234 × 234 B wire payloads
};

const noop = () => {};

describe('StoragePanel (v3.1 24/7 retention)', () => {
  it('renders the retention stats with human-readable byte estimates', () => {
    const html = renderToStaticMarkup(
      createElement(StoragePanel, { stats, retentionSeconds: 2520, onRetentionChange: noop })
    );
    expect(html).toContain('data-testid="storage-panel"');
    expect(html).toContain('data-testid="storage-retained"');
    expect(html).toContain('1,234'); // toLocaleString() with thousands separator
    expect(html).toContain('data-testid="storage-capacity"');
    expect(html).toContain('20,000');
    expect(html).toContain('data-testid="storage-bytes"');
    expect(html).toContain('KB'); // 289400 B ≈ 282.6 KB
    expect(html).toContain('data-testid="storage-evicted-age"');
    expect(html).toContain('88');
    expect(html).toContain('data-testid="storage-evicted-capacity"');
    expect(html).toContain('3');
  });

  it('offers a retention select that reflects the active window (7 sim days default)', () => {
    const html = renderToStaticMarkup(
      createElement(StoragePanel, { stats, retentionSeconds: 2520, onRetentionChange: noop })
    );
    expect(html).toContain('data-testid="storage-retention"');
    expect(html).toContain('selected=""'); // React SSR marks the matching option
    expect(html).toContain('7 sim-days');
  });
});