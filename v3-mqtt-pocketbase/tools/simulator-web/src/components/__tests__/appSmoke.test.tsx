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
  });
});