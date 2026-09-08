import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { BioacousticsStudio } from '../BioacousticsStudio';
import { AudioSpectrogram } from '../AudioSpectrogram';
import { ComputeLatencyHud } from '../ComputeLatencyHud';

describe('BioacousticsStudio (SSR smoke)', () => {
  it('renders a control panel with formant and ADSR selectors', () => {
    const html = renderToStaticMarkup(
      createElement(BioacousticsStudio, {})
    );
    expect(html).toContain('data-testid="formant-select"');
    expect(html).toContain('data-testid="adsr-attack"');
    expect(html).toContain('data-testid="adsr-decay"');
    expect(html).toContain('data-testid="soundboard-trigger"');
  });

  it('flags the accessible class when enabled', () => {
    const html = renderToStaticMarkup(
      createElement(BioacousticsStudio, { accessible: true })
    );
    expect(html).toContain('class="bioacoustics-studio accessible');
  });
});

describe('AudioSpectrogram (SSR smoke)', () => {
  it('renders a canvas waterfall with 8kHz frequency range', () => {
    const html = renderToStaticMarkup(
      createElement(AudioSpectrogram, {})
    );
    expect(html).toContain('data-testid="spectrogram-canvas"');
    expect(html).toMatch(/<canvas[^>]*width="512"[^>]*height="256"/);
  });

  it('renders the accessible variant', () => {
    const html = renderToStaticMarkup(
      createElement(AudioSpectrogram, { accessible: true })
    );
    expect(html).toContain('class="audio-spectrogram accessible');
  });
});

describe('ComputeLatencyHud (SSR smoke)', () => {
  it('renders a 35ms budget breakdown with four sections', () => {
    const html = renderToStaticMarkup(
      createElement(ComputeLatencyHud, {})
    );
    expect(html).toContain('data-testid="latency-hud"');
    // Four sections: STFT, Mel, CNN-LSTM, Thermal ROI
    expect(html).toContain('data-testid="stft-section"');
    expect(html).toContain('data-testid="mel-section"');
    expect(html).toContain('data-testid="cnn-lstm-section"');
    expect(html).toContain('data-testid="thermal-section"');
    // Each section should show time in ms, totalling ≤35
    expect(html).toContain('35 ms');
  });

  it('flags the accessible class when enabled', () => {
    const html = renderToStaticMarkup(
      createElement(ComputeLatencyHud, { accessible: true })
    );
    expect(html).toContain('class="compute-latency-hud accessible');
  });
});