/** FusionLabPage — Multi-modal sensor fusion: zone tracker, decision flow, baseline, alerts, scaling. */
import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Layers, MapPin, AlertTriangle, Calculator } from 'lucide-react';
import { useSimulationStore } from '../stores/simulationStore';
import { useSettingsStore } from '../stores/settingsStore';
import { MultiPenScaler } from '../engines/multiPen';

/** Fusion lab — zone tracker, decision flow, baseline, scaling. */
export default function FusionLabPage() {
  const sim = useSimulationStore();
  const settings = useSettingsStore();

  // Multi-pen calculator state
  const [penCount, setPenCount] = useState(4);
  const [includeCctv, setIncludeCctv] = useState(false);

  const scaler = useMemo(() => new MultiPenScaler(), []);
  const scalingResult = useMemo(() => scaler.estimateTotalCost(penCount, includeCctv), [scaler, penCount, includeCctv]);

  // Fusion demo: compute a final score from weights
  const fusionDemo = useMemo(() => {
    const audioConf = sim.coughEvents.length > 0 ? Math.min(1, sim.coughEvents[sim.coughEvents.length - 1]?.confidence ?? 0.5) : 0.35;
    const thermalConf = sim.zones.reduce((a, z) => a + z.confidence, 0) / Math.max(1, sim.zones.length);
    const cctvConf = 0.7; // simulated

    const w = sim.fusionWeights;
    const totalWeight = w.audio + w.thermal + w.cctv;
    const finalScore = totalWeight > 0
      ? (w.audio * audioConf + w.thermal * thermalConf + w.cctv * cctvConf) / totalWeight : 0;

    return { audioConf, thermalConf, cctvConf, finalScore };
  }, [sim.coughEvents, sim.zones, sim.fusionWeights]);

  const activeAlerts = sim.alerts.filter((a) => !a.dismissed);

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Layers className="text-cyan-400" size={24} />
        <h1 className="text-lg font-bold text-white">Fusion Lab</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Zone Tracker Map */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <MapPin size={16} /> Zone Tracker
          </h2>
          {/* 2x2 zone grid with pig dots */}
          <div className="relative aspect-square max-w-sm mx-auto rounded-lg border-2 border-gray-700 bg-[#0b1220]">
            {/* Zone quadrants */}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
              {sim.zones.map((z) => (
                <div
                  key={z.id}
                  className="flex flex-col items-center justify-center border border-gray-800/50 text-xs"
                >
                  <span className="text-gray-500">{z.label}</span>
                  <span className="text-lg font-bold text-white">
                    {z.healthScore}
                  </span>
                  <span className="text-gray-600">{z.pigCount} pig(s)</span>
                </div>
              ))}
            </div>
            {/* Pig dots */}
            {sim.pigs.map((p) => (
              <div
                key={p.id}
                className={`absolute w-4 h-4 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 ${
                  p.health === 'fever'
                    ? 'bg-red-500'
                    : p.health === 'elevated'
                      ? 'bg-amber-500'
                      : 'bg-cyan-500'
                }`}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                title={`${p.id}: ${p.temp.toFixed(1)}C`}
              />
            ))}
          </div>
        </section>

        {/* Fusion Decision Flow */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Fusion Decision Flow
          </h2>
          <div className="space-y-3">
            {/* Input confidences */}
            {[
              { label: 'Audio confidence', value: fusionDemo.audioConf, weight: sim.fusionWeights.audio, color: 'cyan' },
              { label: 'Thermal confidence', value: fusionDemo.thermalConf, weight: sim.fusionWeights.thermal, color: 'amber' },
              { label: 'CCTV confidence', value: fusionDemo.cctvConf, weight: sim.fusionWeights.cctv, color: 'green' },
            ].map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{item.label}</span>
                  <span className="text-white font-semibold">
                    {(item.value * 100).toFixed(0)}% (w={item.weight})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0b1220] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.color === 'cyan'
                        ? 'bg-cyan-500'
                        : item.color === 'amber'
                          ? 'bg-amber-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${item.value * 100}%` }}
                  />
                </div>
              </div>
            ))}

            {/* Arrow */}
            <div className="text-center text-gray-600 text-lg">&#8595;</div>

            {/* Final score */}
            <div className="rounded-lg bg-[#0b1220] border border-gray-700 p-3 text-center">
              <div className="text-xs text-gray-500">Fused Health Score</div>
              <div
                className={`text-3xl font-bold ${
                  fusionDemo.finalScore > 0.7
                    ? 'text-green-400'
                    : fusionDemo.finalScore > 0.4
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {(fusionDemo.finalScore * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                threshold: {(settings.zScoreThreshold * 10).toFixed(0)}%
              </div>
            </div>
          </div>
        </section>

        {/* 7-day Rolling Baseline */}
        <section className="lg:col-span-2 rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            7-Day Rolling Baseline
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={sim.baselineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} domain={[37.5, 40]} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#d1d5db' }} />
                <Line type="monotone" dataKey="avgTemp" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} name="Avg Temp (C)" />
              </LineChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sim.baselineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#d1d5db' }} />
                <Bar dataKey="coughRate" fill="#a855f7" name="Cough Rate (/min)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Alert Generation */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <AlertTriangle size={16} /> Alert Generation
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Fever threshold</span>
              <span className="text-white">{settings.feverThreshold}C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Cough confidence</span>
              <span className="text-white">{settings.coughConfidenceThreshold}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Z-score threshold</span>
              <span className="text-white">{settings.zScoreThreshold}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Alert cooldown</span>
              <span className="text-white">{settings.alertCooldownSec}s</span>
            </div>
          </div>

          <hr className="border-gray-800 my-3" />
          <h3 className="text-xs text-gray-500 uppercase mb-2">Active Alerts ({activeAlerts.length})</h3>
          {activeAlerts.length === 0 ? (
            <p className="text-sm text-gray-600">No active alerts.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {activeAlerts.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between rounded-lg p-2 text-xs ${
                    a.type === 'fever'
                      ? 'bg-red-950/50 border border-red-800'
                      : a.type === 'cough_cluster'
                        ? 'bg-amber-950/50 border border-amber-800'
                        : 'bg-gray-800 border border-gray-700'
                  }`}
                >
                  <span>
                    <b className="text-white">{a.type}</b> Z{a.zoneId + 1}{' '}
                    ({(a.confidence * 100).toFixed(0)}%)
                  </span>
                  <button
                    className="text-gray-500 hover:text-gray-300"
                    onClick={() => sim.dismissAlert(a.id)}
                  >
                    dismiss
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            className="mt-3 w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
            onClick={() => sim.addAlert({
              zoneId: Math.floor(Math.random() * 4),
              type: Math.random() > 0.5 ? 'fever' : 'cough_cluster',
              confidence: 0.7 + Math.random() * 0.3,
              timestamp: sim.simTime, modalities: ['thermal', 'audio'], dismissed: false,
            })}
          >
            Simulate Alert
          </button>
        </section>

        {/* Multi-Pen Scaling Calculator */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <Calculator size={16} /> Multi-Pen Scaling
          </h2>
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>
                Number of pens: <b className="text-white">{penCount}</b>
              </span>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={penCount}
                onChange={(e) => setPenCount(parseInt(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeCctv}
                onChange={(e) => setIncludeCctv(e.target.checked)}
                className="accent-cyan-400"
              />
              Include CCTV per pen
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 text-center text-sm">
            <div className="rounded-lg bg-[#0b1220] p-2">
              <div className="text-xs text-gray-500">Nodes</div>
              <div className="text-xl font-bold text-cyan-400">
                {scalingResult.nodes}
              </div>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-2">
              <div className="text-xs text-gray-500">Per Pen</div>
              <div className="text-xl font-bold text-white">
                P{scalingResult.perPen.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-2">
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-xl font-bold text-green-400">
                P{scalingResult.hardware.toLocaleString()}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">Scaling is linear: N pens = N nodes + 1 shared RPi 4.</p>
        </section>
      </div>
    </div>
  );
}
