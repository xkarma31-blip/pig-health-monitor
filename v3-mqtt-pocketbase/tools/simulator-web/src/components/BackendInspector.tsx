import { useEffect, useState } from 'react';
import { probeAll, LIVE_BACKEND, type ProbeResult } from '../services/backendProbe';

export interface BackendInspectorProps {
  /** Measured systemd NRestarts for pigpulse-bridge (reported, not re-read). */
  bridgeRestarts?: number;
  accessible?: boolean;
}

const VERDICT_CLASS: Record<ProbeResult['verdict'], string> = {
  up: 'verdict-up',
  down: 'verdict-down',
  unreachable: 'verdict-unknown'
};

/**
 * Probes the REAL deployment the sim emulates. Tri-state verdicts on purpose:
 * a browser CORS block is 'unreachable', never a fabricated 'down'.
 */
export function BackendInspector({ bridgeRestarts = 0 }: BackendInspectorProps) {
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [probing, setProbing] = useState(false);

  const runProbes = async () => {
    setProbing(true);
    try {
      const { results: r, diagnosis: d } = await probeAll(LIVE_BACKEND, {}, { bridgeRestarts });
      setResults(r);
      setDiagnosis(d);
    } catch (err) {
      setDiagnosis([`probe failed: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    void runProbes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="backend-inspector" data-testid="backend-inspector" role="group" aria-label="Backend inspector">
      <div className="env-readout">
        <span className="badge badge-simulated">LIVE READOUTS — not simulated</span>
        <button type="button" className="btn" data-testid="backend-reprobe" onClick={() => void runProbes()} disabled={probing}>
          {probing ? 'Probing…' : 'Re-probe'}
        </button>
      </div>

      <ul className="backend-services">
        {results.map((r) => (
          <li key={r.service.id} data-testid={`backend-probe-${r.service.id}`} className="backend-service">
            <span className={`verdict-dot ${VERDICT_CLASS[r.verdict]}`} aria-label={r.verdict} />
            <b>{r.service.label}</b>
            <span className="backend-detail">{r.detail}</span>
          </li>
        ))}
      </ul>

      {diagnosis.length > 0 && (
        <div className="backend-diagnosis" data-testid="backend-diagnosis">
          <b>Root-cause chain:</b>
          <ul>
            {diagnosis.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {bridgeRestarts > 0 && (
        <p className="backend-evidence" data-testid="backend-evidence">
          Bridge evidence (measured 2026-09-08): systemd NRestarts={bridgeRestarts}, ActiveState=activating —
          verify live with <code>systemctl status pigpulse-bridge</code>.
        </p>
      )}
      <span className="sr-only">
        TCP-only services are not probeable from a browser; they report unreachable until probed from Node.
      </span>
    </div>
  );
}

export default BackendInspector;