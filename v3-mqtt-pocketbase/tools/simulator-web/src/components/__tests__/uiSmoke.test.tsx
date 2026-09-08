import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThermalHeatmap } from '../ThermalHeatmap';
import { SwineArena, ArenaPig } from '../SwineArena';

const FRAME = new Float32Array(32 * 24).fill(30);

const PIGS: ArenaPig[] = [
  { id: 'pig-001', x: 0.5, y: 0.5, temp: 39.6, state: 'WARNING' },
  { id: 'pig-002', x: 0.15, y: 0.2, temp: 37.5, state: 'NORMAL' }
];

describe('ThermalHeatmap (SSR smoke)', () => {
  it('renders a 32x24 canvas with an aria label', () => {
    const html = renderToStaticMarkup(
      createElement(ThermalHeatmap, { frame: FRAME })
    );
    expect(html).toContain('data-testid="thermal-canvas"');
    expect(html).toMatch(/<canvas[^>]*width="32"[^>]*height="24"/);
    expect(html).toContain('aria-label="Thermal heatmap 32 x 24 from MLX90640"');
  });

  it('renders a legend with the 20-42 Celsius scale', () => {
    const html = renderToStaticMarkup(
      createElement(ThermalHeatmap, { frame: FRAME, colormap: 'plasma' })
    );
    expect(html).toContain('data-testid="thermal-gradient"');
    expect(html).toContain('20 °C');
    expect(html).toContain('42 °C');
  });

  it('flags the accessible class when enabled', () => {
    const html = renderToStaticMarkup(
      createElement(ThermalHeatmap, { frame: FRAME, accessible: true })
    );
    expect(html).toContain('class="thermal-heatmap accessible');
  });
});

describe('SwineArena (SSR smoke)', () => {
  it('renders one pig marker per pig plus the camera FOV rect', () => {
    const html = renderToStaticMarkup(createElement(SwineArena, { pigs: PIGS }));
    expect(html).toContain('data-testid="fov-rect"');
    expect(html).toContain('data-pig-id="pig-001"');
    expect(html).toContain('data-pig-id="pig-002"');
    expect(html).toContain('data-x="400" data-y="300"');
    expect(html).toContain('data-x="120" data-y="120"');
  });

  it('marks critical pigs with a state class', () => {
    const critical: ArenaPig[] = [{ id: 'pig-003', x: 0.5, y: 0.5, temp: 41.0, state: 'CRITICAL' }];
    const html = renderToStaticMarkup(createElement(SwineArena, { pigs: critical }));
    expect(html).toContain('arena-pig-critical');
  });

  it('reports the pig count in its aria label', () => {
    const html = renderToStaticMarkup(createElement(SwineArena, { pigs: PIGS }));
    expect(html).toContain('aria-label="Swine arena showing 2 pigs with camera field of view"');
  });
});