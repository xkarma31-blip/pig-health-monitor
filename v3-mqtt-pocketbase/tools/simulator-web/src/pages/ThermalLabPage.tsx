/** ThermalLabPage — Thermal imaging deep-dive: heatmaps, super-res, sunlight, false positives. */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Thermometer, Sun, ShieldAlert, Target } from 'lucide-react';
import { useSimulationStore } from '../stores/simulationStore';
import { useSettingsStore } from '../stores/settingsStore';
import { superResolve } from '../engines/superResolution';
import { ThermalHeatmap } from '../components/ThermalHeatmap';

const COLD = [5, 8, 22];
const WARM = [6, 182, 212];
const HOT  = [239, 68, 68];

function tempToRgb(t: number, min: number, max: number): [number, number, number] {
  const ratio = Math.max(0, Math.min(1, (t - min) / (max - min)));
  if (ratio < 0.5) {
    const r = ratio * 2;
    return [
      COLD[0] + (WARM[0] - COLD[0]) * r,
      COLD[1] + (WARM[1] - COLD[1]) * r,
      COLD[2] + (WARM[2] - COLD[2]) * r,
    ];
  }
  const r = (ratio - 0.5) * 2;
  return [
    WARM[0] + (HOT[0] - WARM[0]) * r,
    WARM[1] + (HOT[1] - WARM[1]) * r,
    WARM[2] + (HOT[2] - WARM[2]) * r,
  ];
}

function drawThermalCanvas(ctx: CanvasRenderingContext2D, data: Float32Array, w: number, h: number) {
  const img = ctx.createImageData(w, h);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  if (max - min < 0.01) max = min + 1;

  for (let i = 0; i < data.length; i++) {
    const [r, g, b] = tempToRgb(data[i], min, max);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Sunlit floor — adds uniform heat to bottom-right quadrant. */
function applySunlight(frame: Float32Array, intensity: number, w: number, h: number): Float32Array {
  const out = new Float32Array(frame);
  for (let y = Math.floor(h / 2); y < h; y++) {
    for (let x = Math.floor(w / 2); x < w; x++) {
      out[y * w + x] += intensity * 3.5; // up to 3.5C boost
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

/** Thermal lab — heatmaps, super-res, sunlight, false positives. */
export default function ThermalLabPage() {
  const sim = useSimulationStore();
  const accessible = useSettingsStore((s) => s.showAccessible);

  const [timeSlider, setTimeSlider] = useState(sim.timeOfDay);

  // Canvas refs
  const lowResRef = useRef<HTMLCanvasElement>(null);
  const highResRef = useRef<HTMLCanvasElement>(null);

  // Super-resolve the current frame
  const srOutput = useMemo(
    () => superResolve({ lowRes: sim.thermalFrame }),
    [sim.thermalFrame],
  );

  // Sunlit frame for the false-positive demo
  const sunlitFrame = useMemo(
    () => applySunlight(sim.thermalFrame, sim.sunlightIntensity, 32, 24),
    [sim.thermalFrame, sim.sunlightIntensity],
  );

  // Draw canvases
  const drawCanvases = useCallback(() => {
    const lowCtx = lowResRef.current?.getContext('2d');
    if (lowCtx) drawThermalCanvas(lowCtx, sim.thermalFrame, 32, 24);

    const hiCtx = highResRef.current?.getContext('2d');
    if (hiCtx) drawThermalCanvas(hiCtx, srOutput.highRes, srOutput.width, srOutput.height);
  }, [sim.thermalFrame, srOutput]);

  useEffect(() => {
    drawCanvases();
  }, [drawCanvases]);

  const formatHour = (h: number) => {
    const hr = Math.floor(h);
    const min = Math.round((h - hr) * 60);
    return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Thermometer className="text-cyan-400" size={24} />
        <h1 className="text-lg font-bold text-white">Thermal Lab</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Existing ThermalHeatmap component */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Live Heatmap (32x24)
          </h2>
          <ThermalHeatmap frame={sim.thermalFrame} accessible={accessible} />
        </section>

        {/* Super-Resolution side-by-side */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <Target size={16} /> Super-Resolution Comparison
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">32x24 (raw)</p>
              <canvas
                ref={lowResRef}
                width={32}
                height={24}
                className="w-full rounded-lg border border-gray-700"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">128x96 (GAN-style)</p>
              <canvas
                ref={highResRef}
                width={128}
                height={96}
                className="w-full rounded-lg border border-gray-700"
                style={{ imageRendering: 'auto' }}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            PSNR boost: <b className="text-cyan-400">+{srOutput.psnrBoostDb} dB</b>{' '}
            · Method: {srOutput.method}
          </p>
        </section>

        {/* Time-of-day slider */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <Sun size={16} /> Time of Day — Sunlight Control
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Time: <b className="text-white">{formatHour(timeSlider)}</b>
            </span>
            <input
              type="range"
              min={6}
              max={18}
              step={0.25}
              value={timeSlider}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setTimeSlider(v);
                sim.setTimeOfDay(v);
              }}
              className="w-full accent-cyan-400"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-sm mt-3">
            <span>
              Sunlight intensity:{' '}
              <b className="text-white">
                {(sim.sunlightIntensity * 100).toFixed(0)}%
              </b>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sim.sunlightIntensity}
              onChange={(e) =>
                sim.setSunlightIntensity(parseFloat(e.target.value))
              }
              className="w-full accent-amber-400"
            />
          </label>
        </section>

        {/* False positive demo */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <ShieldAlert size={16} /> False Positive Demo
          </h2>
          <p className="text-sm text-gray-400 mb-3">
            Sunlit floor heats uniformly (broad, low gradient). Pig heat is
            localized (sharp, compact). The filter distinguishes them.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Without sunlight</p>
              <ThermalHeatmap frame={sim.thermalFrame} accessible={accessible} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">
                With sunlight ({(sim.sunlightIntensity * 100).toFixed(0)}%)
              </p>
              <ThermalHeatmap frame={sunlitFrame} accessible={accessible} />
            </div>
          </div>
          <div className="mt-3 p-2 rounded-lg bg-[#0b1220] text-xs text-center">
            {sim.sunlightIntensity > 0.5 ? (
              <span className="text-amber-400">
                High sun — false positive risk elevated. Filter engaged.
              </span>
            ) : (
              <span className="text-green-400">
                Low sun — false positive risk minimal.
              </span>
            )}
          </div>
        </section>

        {/* Zone confidence scores */}
        <section className="lg:col-span-2 rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Zone Confidence Scores
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sim.zones.map((z) => (
              <div
                key={z.id}
                className="rounded-lg bg-[#0b1220] border border-gray-800 p-3 text-center"
              >
                <div className="text-sm font-semibold text-white">{z.label}</div>
                <div className="text-2xl font-bold text-cyan-400 mt-1">
                  {(z.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Health: {z.healthScore} · Pigs: {z.pigCount}
                </div>
                <div className="text-xs mt-1">
                  <span
                    className={
                      z.feverRisk > 0.1
                        ? 'text-red-400'
                        : z.feverRisk > 0.05
                          ? 'text-amber-400'
                          : 'text-green-400'
                    }
                  >
                    Fever risk: {(z.feverRisk * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
