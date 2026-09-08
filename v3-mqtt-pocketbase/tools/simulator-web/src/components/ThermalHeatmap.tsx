import { useEffect, useRef } from 'react';
import { ColormapName, getColormap } from '../utils/colormaps';
import { buildHeatmapGrid, GRID_W, GRID_H, THERMAL_MIN, THERMAL_MAX } from '../utils/heatmapGrid';

export interface ThermalHeatmapProps {
  /** 32x24 float frame; latest value is redrawn every animation frame. */
  frame: Float32Array;
  colormap?: ColormapName;
  accessible?: boolean;
  className?: string;
}

function gradientCss(name: ColormapName): string {
  const lut = getColormap(name);
  const stops: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const idx = Math.min(255, Math.round((i / 5) * 255));
    const o = idx * 4;
    stops.push(`rgb(${lut[o]},${lut[o + 1]},${lut[o + 2]}) ${i * 20}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/**
 * 60 FPS canvas heatmap renderer. The rAF loop is started once; the latest
 * `frame`/`colormap` are read from refs so React reconciliation never
 * tears the loop down.
 */
export function ThermalHeatmap({
  frame,
  colormap = 'ironbow',
  accessible = false,
  className = ''
}: ThermalHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(frame);
  const cmapRef = useRef<ColormapName>(colormap);

  // Update refs during render — draw() always sees the freshest values.
  frameRef.current = frame;
  cmapRef.current = colormap;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(GRID_W, GRID_H);
    let raf = 0;
    const draw = () => {
      const lut = getColormap(cmapRef.current);
      imageData.data.set(buildHeatmapGrid(frameRef.current, lut, GRID_W, GRID_H));
      ctx.putImageData(imageData, 0, 0);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`thermal-heatmap ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="thermal-heatmap"
    >
      <div
        className="thermal-frame"
        role="img"
        aria-label={`Thermal heatmap ${GRID_W} x ${GRID_H} from MLX90640`}
      >
        <canvas
          ref={canvasRef}
          width={GRID_W}
          height={GRID_H}
          data-testid="thermal-canvas"
        />
      </div>
      <div className="thermal-legend" aria-hidden="true">
        <span className="thermal-label">{THERMAL_MIN} °C</span>
        <div
          className="thermal-gradient"
          style={{ background: gradientCss(colormap) }}
          data-testid="thermal-gradient"
        />
        <span className="thermal-label">{THERMAL_MAX} °C</span>
      </div>
    </div>
  );
}