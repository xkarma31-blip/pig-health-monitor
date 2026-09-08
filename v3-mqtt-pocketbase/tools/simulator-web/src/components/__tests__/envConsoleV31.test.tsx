import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import EnvironmentConsole from '../EnvironmentConsole';

const base = {
  params: { ambientBaseTemp: 28.5, rain: 0 },
  ambientTemp: 28.5,
  activeEvents: [] as string[],
  recentInfections: [] as Array<{ pigId: string; sourceId: string }>,
  speed: 1,
  onParamsChange: () => {},
  onEvent: () => {},
  onSpeedChange: () => {}
};

describe('EnvironmentConsole v3.1 — rain + sim clock', () => {
  it('adds the rain weather slider to the opt-in realism surfaces', () => {
    const html = renderToStaticMarkup(
      createElement(EnvironmentConsole, { ...base, timeOfDay: '14:05' })
    );
    expect(html).toContain('data-testid="env-param-rain"');
    expect(html).toContain('Rain');
  });

  it('shows the wall-clock time-of-day and a set-clock control', () => {
    const html = renderToStaticMarkup(
      createElement(EnvironmentConsole, { ...base, timeOfDay: '14:05', onSetClock: () => {} })
    );
    expect(html).toContain('data-testid="env-time-of-day"');
    expect(html).toContain('14:05');
    expect(html).toContain('data-testid="env-set-clock"');
  });

  it('badges Raining when rain is active', () => {
    const html = renderToStaticMarkup(
      createElement(EnvironmentConsole, { ...base, params: { ambientBaseTemp: 28.5, rain: 0.8 } })
    );
    expect(html).toContain('data-testid="env-raining"');
    expect(html).toMatch(/Rain/);
  });
});