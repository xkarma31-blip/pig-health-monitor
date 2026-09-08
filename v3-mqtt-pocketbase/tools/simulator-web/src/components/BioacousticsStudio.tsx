import { useState, type ChangeEvent } from 'react';
import {
  generateCoughBurst,
  createAdsrEnvelope
} from '../engines/audioSynthesizer';

export interface BioacousticsStudioProps {
  accessible?: boolean;
  className?: string;
  /** Controlled formant (optional) so the App can mirror it to the spectrogram. */
  formant?: 'INFECTIOUS' | 'NON_INFECTIOUS';
  onFormantChange?: (f: 'INFECTIOUS' | 'NON_INFECTIOUS') => void;
}

export type CoughFormant = 'INFECTIOUS' | 'NON_INFECTIOUS';

/**
 * Cough soundboard. WebAudio requires a user gesture: the "Trigger Cough"
 * click IS that gesture — it lazily creates the AudioContext, renders a
 * cough burst from the Task 3 engine, and shapes its onset/tail with the
 * selected ADSR envelope.
 */
export function BioacousticsStudio({
  accessible = false,
  className = '',
  formant: controlledFormant,
  onFormantChange
}: BioacousticsStudioProps) {
  const [internalFormant, setInternalFormant] = useState<CoughFormant>('INFECTIOUS');
  const [attackMs, setAttackMs] = useState(15);
  const [decayMs, setDecayMs] = useState(200);

  const formant = controlledFormant ?? internalFormant;

  const setFormant = (f: CoughFormant) => {
    if (onFormantChange) {
      onFormantChange(f);
    } else {
      setInternalFormant(f);
    }
  };

  const playCough = () => {
    // SSR / node has no AudioContext — guard so tests can render safely.
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    const sr = ctx.sampleRate;
    const durationMs = attackMs + decayMs + 60;
    const burst = generateCoughBurst(formant, durationMs, sr);
    // Shape the burst with the studio's ADSR so the sliders audibly matter.
    const env = createAdsrEnvelope(attackMs, decayMs, durationMs, sr);
    const envLen = env.length;
    for (let i = 0; i < burst.length; i++) {
      burst[i] *= env[Math.min(Math.floor((i * envLen) / burst.length), envLen - 1)];
    }
    const buffer = ctx.createBuffer(1, burst.length, sr);
    buffer.copyToChannel(new Float32Array(burst), 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
  };

  const onSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setFormant(e.target.value as CoughFormant);
  };
  const onAttackChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAttackMs(Number(e.target.value));
  };
  const onDecayChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDecayMs(Number(e.target.value));
  };

  return (
    <div
      className={`bioacoustics-studio ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="bioacoustics-studio"
    >
      <h3>Bioacoustics Studio</h3>

      <label>
        Formant:
        <select data-testid="formant-select" onChange={onSelectChange} value={formant}>
          <option value="INFECTIOUS">Infectious (600 Hz)</option>
          <option value="NON_INFECTIOUS">Non-Infectious (1600 Hz)</option>
        </select>
      </label>

      <div className="adsr-row">
        <label>
          Attack:
          <input
            type="range"
            data-testid="adsr-attack"
            min="5"
            max="50"
            value={attackMs}
            onChange={onAttackChange}
          />
          <span>{attackMs} ms</span>
        </label>
        <label>
          Decay:
          <input
            type="range"
            data-testid="adsr-decay"
            min="50"
            max="500"
            value={decayMs}
            onChange={onDecayChange}
          />
          <span>{decayMs} ms</span>
        </label>
      </div>

      <button
        data-testid="soundboard-trigger"
        aria-label="Trigger cough sound"
        onClick={playCough}
        style={{ marginTop: '1rem' }}
      >
        Trigger Cough
      </button>
    </div>
  );
}