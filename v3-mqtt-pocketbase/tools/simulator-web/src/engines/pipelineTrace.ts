/**
 * Pipeline trace — a ring-buffered journal of every stage a sample travels
 * through: SENSOR → DSP → ML → DECISION → MQTT → BRIDGE → DB.
 * Drives both the UI's scroll-back panel and the scenario runner's verdicts.
 */

export const TraceStage = {
  SENSOR: 'SENSOR',
  DSP: 'DSP',
  ML: 'ML',
  DECISION: 'DECISION',
  MQTT: 'MQTT',
  BRIDGE: 'BRIDGE',
  DB: 'DB'
} as const;

export type TraceStageName = (typeof TraceStage)[keyof typeof TraceStage];

export interface PipelineEvent {
  stage: TraceStageName;
  tsSec: number;
  label: string;
  detail?: string;
  ok?: boolean;   // true = step passed its check; false = flagged (red)
}

const DEFAULT_CAPACITY = 300;

export class PipelineTracer {
  private events: PipelineEvent[] = [];
  private cap: number;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.cap = capacity;
  }

  push(
    stage: TraceStageName,
    tsSec: number,
    label: string,
    detail?: string,
    ok?: boolean
  ): PipelineEvent {
    const ev: PipelineEvent = { stage, tsSec, label, detail, ok };
    this.events.push(ev);
    if (this.events.length > this.cap) {
      this.events.splice(0, this.events.length - this.cap);
    }
    return ev;
  }

  snapshot(): PipelineEvent[] {
    return [...this.events];
  }

  last(stage?: TraceStageName): PipelineEvent | undefined {
    if (!stage) return this.events[this.events.length - 1];
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].stage === stage) return this.events[i];
    }
    return undefined;
  }

  count(stage?: TraceStageName): number {
    if (!stage) return this.events.length;
    return this.events.filter((e) => e.stage === stage).length;
  }

  clear(): void {
    this.events = [];
  }
}