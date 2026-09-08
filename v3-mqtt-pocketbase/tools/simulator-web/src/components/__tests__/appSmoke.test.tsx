import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import App from '../../App';

describe('App cockpit (SSR smoke)', () => {
  it('renders the full cockpit shell with all panels wired', () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('class="app-shell');
    expect(html).toContain('data-testid="top-nav"');
    expect(html).toContain('data-testid="accessible-toggle"');
    expect(html).toContain('data-testid="status-bar"');
    expect(html).toContain('data-testid="swine-arena"');
    expect(html).toContain('data-testid="fov-rect"');
    expect(html).toContain('data-testid="thermal-canvas"');
    expect(html).toContain('data-testid="spectrogram-canvas"');
    expect(html).toContain('data-testid="bioacoustics-studio"');
    expect(html).toContain('data-testid="latency-hud"');
    expect(html).toContain('data-testid="hardware-monitor"');
    expect(html).toContain('data-testid="chaos-panel"');
    expect(html).toContain('data-testid="ota-dialog"');
    // Stage 4: barn + AI readout + pipeline trace + scenario runner
    expect(html).toContain('data-testid="barn-panel"');
    expect(html).toContain('data-testid="barn-pig-d0wd-01"');
    expect(html).toContain('data-testid="barn-infect-d0wd-01"');
    expect(html).toContain('data-testid="classifier-panel"');
    expect(html).toContain('data-testid="mel-canvas"');
    expect(html).toContain('data-testid="trend-badge"');
    expect(html).toContain('data-testid="score-stable"');
    expect(html).toContain('data-testid="score-elevated"');
    expect(html).toContain('data-testid="score-cluster"');
    expect(html).toContain('data-testid="pipeline-trace"');
    expect(html).toContain('data-testid="scenario-runner"');
    expect(html).toContain('data-testid="scenario-play-healthy-baseline"');
    expect(html).toContain('data-testid="scenario-play-influenza-outbreak"');
  });
});