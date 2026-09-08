import { useEffect, useRef } from 'react';

export interface AudioSpectrogramProps {
  accessible?: boolean;
  className?: string;
  sampleRate?: number;
  /** Dominant cough-band center (Hz). 0/undefined = noise floor only. */
  formantHz?: number;
}

export const SPECTROGRAM_W = 512;
export const SPECTROGRAM_H = 256;

export interface SpectrogramColumnOptions {
  height: number;      // frequency bins
  sampleRate: number;  // display spans 0..Nyquist (sampleRate/2)
  formantHz?: number;  // gaussian cough-band center (Hz); 0 = noise floor only
  rand?: () => number; // injectable RNG for deterministic tests
}

/**
 * Pure waterfall column: quiet noise floor + gaussian energy bump centered on
 * the dominant cough formant. Values clamped to [0, 1]. Exported so the
 * spectral shape (not just the DOM) is unit-testable in Node.
 */
export function generateSpectrogramColumn({
  height,
  sampleRate,
  formantHz = 0,
  rand = Math.random
}: SpectrogramColumnOptions): number[] {
  const nyquist = sampleRate / 2;
  const out = new Array<number>(height);
  for (let y = 0; y < height; y++) {
    const freq = (y / height) * nyquist;
    // INMP441-ish noise floor (0.06..0.15)
    let v = 0.06 + rand() * 0.09;
    if (formantHz > 0) {
      const bw = formantHz * 0.35;
      const g = Math.exp(-((freq - formantHz) ** 2) / (2 * bw * bw));
      v += (0.55 + rand() * 0.3) * g;
    }
    out[y] = Math.min(1, Math.max(0, v));
  }
  return out;
}

/**
 * 60 FPS canvas waterfall. The rAF loop is started once; the latest
 * `formantHz` is read from a ref so React reconciliation never tears the
 * loop down (same pattern as ThermalHeatmap — zero React state at 60 FPS).
 */
export function AudioSpectrogram({
  accessible = false,
  className = '',
  sampleRate = 8000,
  formantHz = 0
}: AudioSpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const formantRef = useRef(formantHz);

  // Read latest formant during render — draw() always sees the fresh value.
  formantRef.current = formantHz;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = SPECTROGRAM_W;
    canvas.height = SPECTROGRAM_H;
    const imageData = ctx.createImageData(SPECTROGRAM_W, SPECTROGRAM_H);
    const data = imageData.data;

    // Rolling time-axis buffer: cols[x] = column at time slice x.
    const cols: number[][] = [];
    for (let x = 0; x < SPECTROGRAM_W; x++) {
      cols.push(new Array<number>(SPECTROGRAM_H).fill(0));
    }

    let raf = 0;
    const draw = () => {
      // Shift one slice left, inject a fresh column on the right.
      for (let x = 0; x < SPECTROGRAM_W - 1; x++) {
        cols[x] = cols[x + 1];
      }
      cols[SPECTROGRAM_W - 1] = generateSpectrogramColumn({
        height: SPECTROGRAM_H,
        sampleRate,
        formantHz: formantRef.current
      });

      // Paint: y=0 row is the top of the canvas = the highest frequency.
      for (let y = 0; y < SPECTROGRAM_H; y++) {
        const srcY = SPECTROGRAM_H - 1 - y;
        for (let x = 0; x < SPECTROGRAM_W; x++) {
          const v = cols[x][srcY];
          const o = (y * SPECTROGRAM_W + x) * 4;
          data[o] = Math.round(v * 80);
          data[o + 1] = Math.round(v * 200 + 55);
          data[o + 2] = Math.round(8 + v * 247);
          data[o + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sampleRate]);

  const nyquistKHz = (sampleRate / 2 / 1000).toFixed(0);

  return (
    <div
      className={`audio-spectrogram ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="spectrogram-container"
    >
      <canvas
        ref={canvasRef}
        width={SPECTROGRAM_W}
        height={SPECTROGRAM_H}
        data-testid="spectrogram-canvas"
        role="img"
        aria-label={`Audio spectrogram 0-${nyquistKHz} kHz waterfall`}
      />
    </div>
  );
}