/**
 * AudioLabPage — Deep-dive audio analysis workbench.
 *
 * Composes BioacousticsStudio, AudioSpectrogram, ClassifierPanel, plus
 * new interactive sections for distance attenuation, AGC comparison,
 * and environmental noise.
 */
import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { AudioWaveform, Volume2, Radio } from 'lucide-react';
import { useSimulationStore } from '../stores/simulationStore';
import { useSettingsStore } from '../stores/settingsStore';
import { attenuateAtDistance } from '../engines/distanceAttenuation';

import { BioacousticsStudio } from '../components/BioacousticsStudio';
import { AudioSpectrogram } from '../components/AudioSpectrogram';
import { ClassifierPanel } from '../components/ClassifierPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate CNN confidence-vs-distance data points for the chart. */
function buildConfidenceVsDistance(): Array<{
  distance: number;
  confidence: number;
  dbDrop: number;
}> {
  const points: Array<{ distance: number; confidence: number; dbDrop: number }> = [];
  for (let d = 0.25; d <= 4.0; d += 0.25) {
    const model = attenuateAtDistance(d);
    // Simulated CNN confidence decays with distance
    const conf = Math.max(0, Math.min(1, model.relativeVolume * 0.95));
    points.push({
      distance: d,
      confidence: parseFloat(conf.toFixed(3)),
      dbDrop: parseFloat(model.attenuationDb.toFixed(1)),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Audio-focused lab page for bioacoustics experimentation. */
export default function AudioLabPage() {
  const sim = useSimulationStore();
  const accessible = useSettingsStore((s) => s.showAccessible);

  // Local interactive state
  const [distance, setDistance] = useState(1.5);
  const [fanNoise, setFanNoise] = useState(30);
  const [feedingNoise, setFeedingNoise] = useState(15);
  const [squealNoise, setSquealNoise] = useState(5);
  const [localGainMode, setLocalGainMode] = useState<'agc' | 'fixed'>(sim.gainMode);

  const distModel = useMemo(() => attenuateAtDistance(distance), [distance]);
  const chartData = useMemo(() => buildConfidenceVsDistance(), []);

  const totalNoise = fanNoise + feedingNoise + squealNoise;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <header className="flex items-center gap-3">
        <AudioWaveform className="text-cyan-400" size={24} />
        <h1 className="text-lg font-bold text-white">Audio Lab</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bioacoustics Studio */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Bioacoustics Studio
          </h2>
          <BioacousticsStudio accessible={accessible} />
        </section>

        {/* Audio Spectrogram */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Audio Spectrogram
          </h2>
          <AudioSpectrogram sampleRate={8000} accessible={accessible} />
        </section>

        {/* Classifier Panel */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            AI Classifier
          </h2>
          <ClassifierPanel view={null} accessible={accessible} />
        </section>

        {/* Distance Attenuation */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <Radio size={16} /> Distance Attenuation
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Distance: <b className="text-white">{distance.toFixed(2)} m</b>
            </span>
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.05}
              value={distance}
              onChange={(e) => setDistance(parseFloat(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </label>
          <div className="grid grid-cols-3 gap-3 mt-3 text-center text-sm">
            <div className="rounded-lg bg-[#0b1220] p-2">
              <div className="text-xs text-gray-500">dB Drop</div>
              <div className="text-lg font-bold text-cyan-400">
                {distModel.attenuationDb.toFixed(1)}
              </div>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-2">
              <div className="text-xs text-gray-500">Volume</div>
              <div className="text-lg font-bold text-white">
                {(distModel.relativeVolume * 100).toFixed(0)}%
              </div>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-2">
              <div className="text-xs text-gray-500">Audible</div>
              <div
                className={`text-lg font-bold ${distModel.audible ? 'text-green-400' : 'text-red-400'}`}
              >
                {distModel.audible ? 'Yes' : 'No'}
              </div>
            </div>
          </div>
        </section>

        {/* AGC vs Fixed-Gain toggle */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <Volume2 size={16} /> AGC vs Fixed-Gain
          </h2>
          <div className="flex gap-3 mb-4">
            {(['agc', 'fixed'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setLocalGainMode(mode);
                  sim.setGainMode(mode);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  localGainMode === mode
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500'
                    : 'bg-[#0b1220] text-gray-400 border border-gray-700 hover:border-gray-500'
                }`}
              >
                {mode === 'agc' ? 'AGC (Auto)' : 'Fixed Gain'}
              </button>
            ))}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Mode</span>
              <span className="text-white font-semibold">
                {localGainMode === 'agc'
                  ? 'Automatic Gain Control'
                  : 'Fixed-Gain (Oduor et al.)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">False positive risk</span>
              <span
                className={
                  localGainMode === 'agc' ? 'text-amber-400' : 'text-green-400'
                }
              >
                {localGainMode === 'agc' ? 'Higher (gain pumping)' : 'Lower'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Sensitivity at distance</span>
              <span
                className={
                  localGainMode === 'agc' ? 'text-green-400' : 'text-amber-400'
                }
              >
                {localGainMode === 'agc' ? 'Better' : 'Drops with distance'}
              </span>
            </div>
          </div>
        </section>

        {/* Noise Environment */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Noise Environment
          </h2>
          <div className="space-y-3">
            {[
              { label: 'Fan noise (dB)', value: fanNoise, set: setFanNoise, max: 70 },
              { label: 'Feeding noise (dB)', value: feedingNoise, set: setFeedingNoise, max: 60 },
              { label: 'Squeal noise (dB)', value: squealNoise, set: setSquealNoise, max: 50 },
            ].map((s) => (
              <label key={s.label} className="flex flex-col gap-1 text-sm">
                <span>
                  {s.label}: <b className="text-white">{s.value} dB</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={s.max}
                  step={1}
                  value={s.value}
                  onChange={(e) => s.set(parseInt(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 p-2 rounded-lg bg-[#0b1220] text-center text-sm">
            Total ambient noise:{' '}
            <b
              className={
                totalNoise > 60
                  ? 'text-red-400'
                  : totalNoise > 40
                    ? 'text-amber-400'
                    : 'text-green-400'
              }
            >
              ~{totalNoise} dB
            </b>
          </div>
        </section>

        {/* CNN Confidence vs Distance chart — full width */}
        <section className="lg:col-span-2 rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            CNN Confidence vs Distance
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="distance"
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                label={{ value: 'Distance (m)', position: 'insideBottom', offset: -2, fill: '#9ca3af' }}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={[0, 1]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  color: '#d1d5db',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="confidence"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
                name="CNN Confidence"
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}
