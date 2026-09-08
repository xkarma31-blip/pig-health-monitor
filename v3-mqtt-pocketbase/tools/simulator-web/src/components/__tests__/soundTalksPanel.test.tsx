import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import { SoundTalksPanel } from '../SoundTalksPanel';
import { DEFAULT_CALIBRATION, SoundTalksState } from '../../engines/soundTalks';

const greenState: SoundTalksState = {
  rdi: 3,
  rehs: 100,
  band: 'GREEN',
  alarm: false,
  trend: false,
  hourlyCoughs: [0, 1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  baselineLearned: true,
  calibration: { ...DEFAULT_CALIBRATION, headCount: 4, baselineCoughsPerHeadDay: 12 }
};

const redState: SoundTalksState = {
  ...greenState,
  rdi: 33,
  rehs: 25,
  band: 'RED',
  alarm: true,
  trend: true,
  baselineLearned: false,
  calibration: { ...DEFAULT_CALIBRATION, headCount: 4, baselineCoughsPerHeadDay: 12, sensitivity: 2 }
};

const noop = () => {};

describe('SoundTalksPanel (v3.1 respiration health)', () => {
  it('renders the calm herd readout with raw RDI and ReHS plus sparkline', () => {
    const html = renderToStaticMarkup(
      createElement(SoundTalksPanel, { state: greenState, onCalibrationChange: noop, onCalibrateNow: noop, onResetBaseline: noop })
    );
    expect(html).toContain('data-testid="soundtalks-panel"');
    expect(html).toContain('data-testid="soundtalks-rdi"');
    expect(html).toContain('RDI');
    expect(html).toContain('3.0');
    expect(html).toContain('data-testid="soundtalks-rehs"');
    expect(html).toContain('100');
    expect(html).toContain('data-testid="soundtalks-band"');
    expect(html).toContain('GREEN');
    expect(html).toContain('band-green');
    expect(html).toContain('data-testid="soundtalks-sparkline"');
    expect(html).toContain('data-count="5"'); // hourlyCoughs bin value 5 renders as a bar
  });

  it('flags RED + alarm + trend loudly', () => {
    const html = renderToStaticMarkup(
      createElement(SoundTalksPanel, { state: redState, onCalibrationChange: noop, onCalibrateNow: noop, onResetBaseline: noop })
    );
    expect(html).toContain('RED');
    expect(html).toContain('band-red');
    expect(html).toContain('data-testid="soundtalks-alarm"');
    expect(html).toMatch(/ALARM|alarm/i);
    expect(html).toContain('data-testid="soundtalks-trend"');
  });

  it('exposes the calibration knobs and buttons a vet would tune', () => {
    const html = renderToStaticMarkup(
      createElement(SoundTalksPanel, { state: redState, onCalibrationChange: noop, onCalibrateNow: noop, onResetBaseline: noop })
    );
    expect(html).toContain('data-testid="soundtalks-cal-head"');
    expect(html).toContain('value="4"');
    expect(html).toContain('data-testid="soundtalks-cal-baseline"');
    expect(html).toContain('value="12"');
    expect(html).toContain('data-testid="soundtalks-cal-sensitivity"');
    expect(html).toContain('value="2"');
    expect(html).toContain('data-testid="soundtalks-cal-delta"');
    expect(html).toContain('data-testid="soundtalks-auto-baseline"');
    expect(html).toContain('data-testid="soundtalks-calibrate"');
    expect(html).toContain('data-testid="soundtalks-reset"');
  });
});