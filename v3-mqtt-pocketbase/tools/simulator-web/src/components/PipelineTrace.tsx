import { useEffect, useRef } from 'react';
import type { PipelineEvent, TraceStageName } from '../engines/pipelineTrace';

interface PipelineTraceProps {
  events: PipelineEvent[];
  accessible: boolean;
}

const STAGE_ORDER: TraceStageName[] = [
  'SENSOR',
  'DSP',
  'ML',
  'DECISION',
  'MQTT',
  'BRIDGE',
  'DB'
];

/**
 * Scroll-back journal of where every sample went: SENSOR → DSP → ML → DECISION
 * → MQTT → BRIDGE → DB. Red-tinted rows mark flagged steps (alerts, infection).
 */
export function PipelineTrace({ events, accessible }: PipelineTraceProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <div className={`trace-wrap${accessible ? ' accessible' : ''}`}>
      <div className="trace-legend">
        {STAGE_ORDER.map((s) => (
          <span key={s} className={`trace-chip trace-stage-${s.toLowerCase()}`}>
            {s}
          </span>
        ))}
      </div>
      <div className="trace-list" ref={listRef} data-testid="pipeline-trace">
        {events.length === 0 && <div className="trace-empty">no pipeline activity yet…</div>}
        {events.map((ev, i) => (
          <div
            key={i}
            className={`trace-row ${ev.ok === false ? 'trace-flag' : ''}`}
            data-testid={`trace-${ev.stage.toLowerCase()}`}
          >
            <span className={`trace-chip trace-stage-${ev.stage.toLowerCase()}`}>{ev.stage}</span>
            <span className="trace-time">t={ev.tsSec.toFixed(1)}s</span>
            <span className="trace-label">{ev.label}</span>
            {ev.detail && <span className="trace-detail">{ev.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}