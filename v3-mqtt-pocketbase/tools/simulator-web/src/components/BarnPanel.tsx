import type { PigActorState, PigHealthState } from '../engines/environment';

export interface BarnPigView extends PigActorState {}

interface BarnPanelProps {
  pigs: BarnPigView[];
  simTimeSec: number;
  onInfect: (pigId: string) => void;
  accessible: boolean;
}

const HEALTH_LABEL: Record<PigHealthState, string> = {
  HEALTHY: 'HEALTHY',
  INFECTED: 'INFECTED',
  CRITICAL: 'CRITICAL'
};

/**
 * The barn is the ground truth of the simulation. Each card is one pig the
 * firmware is watching; the watched pig (id shown in the status bar) feeds
 * the node's telemetry through setEnvironment().
 */
export function BarnPanel({ pigs, simTimeSec, onInfect, accessible }: BarnPanelProps) {
  return (
    <div className={`barn-panel${accessible ? ' accessible' : ''}`} data-testid="barn-panel">
      <p className="barn-note">
        t = {simTimeSec.toFixed(1)}s · environment drives the firmware node below
      </p>
      <div className="barn-pig-grid">
        {pigs.map((pig) => (
          <div
            key={pig.id}
            className={`barn-pig barn-pig-${pig.health.toLowerCase()}`}
            data-testid={`barn-pig-${pig.id}`}
          >
            <div className="barn-pig-top">
              <span className="barn-pig-id">{pig.id}</span>
              <span className={`barn-health-badge health-${pig.health.toLowerCase()}`}>
                {HEALTH_LABEL[pig.health]}
              </span>
            </div>
            <div className="barn-pig-metrics">
              <span>
                <b>{pig.coreTemp.toFixed(1)}</b>°C
              </span>
              <span>
                x={(pig.x * 100).toFixed(0)}% y={(pig.y * 100).toFixed(0)}%
              </span>
            </div>
            {pig.health === 'HEALTHY' && (
              <button
                type="button"
                className="barn-infect-btn"
                data-testid={`barn-infect-${pig.id}`}
                onClick={() => onInfect(pig.id)}
              >
                Script infection
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}