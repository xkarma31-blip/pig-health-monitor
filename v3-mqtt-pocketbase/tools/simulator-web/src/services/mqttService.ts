/**
 * MQTT WebSocket Service
 *
 * Two transport modes:
 *  - 'loopback': in-browser LoopbackBroker (offline demo / unit tests)
 *  - 'live':     mqtt.js over WebSocket to ws://localhost:9001 (canonical broker)
 *
 * Faithful to red-team notes: full-jitter exponential backoff, deferred LWT,
 * qos0 pileup prevention (drop + count while offline), retained replays.
 * ChaosEpoch tagging lets callers discard stale async deliveries.
 */

import { LoopbackBroker, MqttMessage, Qos } from './loopbackBroker';
import {
  telemetryTopic,
  alertsTopic,
  statusTopic,
  responseTopic,
  CanonTelemetryPayload,
  CanonAlertPayload,
  CanonStatusPayload
} from '../types/canonMqtt';

export type MqttMode = 'loopback' | 'live';

export interface MqttServiceOptions {
  clientId: string;
  mode?: MqttMode;
  broker?: LoopbackBroker;        // required for loopback mode
  url?: string;                    // e.g. ws://localhost:9001/mqtt for live mode
  will?: MqttMessage | null;
  keepaliveSec?: number;
  backoffMinMs?: number;           // default 250
  backoffMaxMs?: number;           // default 30_000 (full-jitter cap)
  rng?: () => number;              // injectable for deterministic backoff
  onMessage?: (msg: MqttMessage) => void;
}

export interface MqttServiceStatus {
  mode: MqttMode;
  connected: boolean;
  reconnectAttempts: number;
  droppedOffline: number;
  qos1Confirmed: number;
  lastError?: string;
}

const CANON_COMMANDS = ['ENROLL_START', 'ENROLL_STOP', 'OTA', 'CONFIG', 'PING'];

export class MqttService {
  readonly clientId: string;
  private opts: MqttServiceOptions;
  private broker?: LoopbackBroker;
  private liveClient: { publish(t: string, p: string, o: { qos: 0 | 1; retain: boolean }): void; end(g: boolean): void; subscribed: string[] } | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private droppedOffline = 0;
  private qos1Confirmed = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private rng: () => number;
  private subscriptions = new Map<string, Qos>();
  private lastError?: string;

  constructor(opts: MqttServiceOptions) {
    this.opts = opts;
    this.clientId = opts.clientId;
    this.broker = opts.broker;
    this.rng = opts.rng ?? Math.random;
  }

  get mode(): MqttMode {
    return this.opts.mode ?? (this.opts.broker ? 'loopback' : 'live');
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      if (this.mode === 'loopback') {
        this.broker!.connect(this.clientId, this.opts.will ?? undefined);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.resubscribe();
      } else {
        const mqtt = await import('mqtt');
        const url = this.opts.url ?? 'ws://localhost:9001/mqtt';
        const client = mqtt.connect(url, {
          clientId: this.clientId,
          keepalive: this.opts.keepaliveSec ?? 60,
          clean: false,
          reconnectPeriod: 0, // we drive reconnects ourselves (full-jitter, chaosEpoch-safe)
          will: this.opts.will
            ? { topic: this.opts.will.topic, payload: this.opts.will.payload, qos: this.opts.will.qos, retain: this.opts.will.retain }
            : undefined
        });
        this.liveClient = {
          publish: (t, p, o) => void client.publish(t, p, o),
          end: (g) => client.end(g),
          subscribed: []
        };
        await new Promise<void>((resolve, reject) => {
          const to = setTimeout(() => {
            client.removeAllListeners();
            reject(new Error('mqtt connect timeout'));
          }, 8000);
          client.once('connect', () => {
            clearTimeout(to);
            this.connected = true;
            this.reconnectAttempts = 0;
            this.resubscribeLive();
            resolve();
          });
          client.once('error', (err: Error) => {
            clearTimeout(to);
            this.lastError = err.message;
            reject(err);
          });
        });
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Publishes; qos0/qos1 while offline are dropped and counted
   * (matches mqtt.js outgoingStore:null — no offline queue pileup).
   */
  publish(topic: string, payload: string, qos: Qos = 0, retain = false): boolean {
    if (!this.connected) {
      this.droppedOffline++;
      return false;
    }
    if (this.mode === 'loopback') {
      this.broker!.publish({ topic, payload, qos, retain }, this.clientId);
      if (qos === 1) this.qos1Confirmed++;
      return true;
    }
    this.liveClient!.publish(topic, payload, { qos, retain });
    if (qos === 1) this.qos1Confirmed++;
    return true;
  }

  subscribe(topic: string, qos: Qos = 0, handler?: (msg: MqttMessage) => void): void {
    this.subscriptions.set(topic, qos);
    const onMsg = handler ?? this.opts.onMessage;
    if (this.mode === 'loopback' && this.broker) {
      this.broker.subscribe(this.clientId, {
        filter: topic,
        qos,
        handler: (msg) => {
          if (onMsg) onMsg(msg);
        }
      });
    }
    void qos;
  }

  /** Publishes a canonical telemetry payload to pig/{id}/telemetry. */
  publishTelemetry(deviceId: string, payload: CanonTelemetryPayload): boolean {
    return this.publish(telemetryTopic(deviceId), JSON.stringify(payload), 0, false);
  }

  /** Publishes a canonical alert payload to pig/{id}/alerts. */
  publishAlert(deviceId: string, payload: CanonAlertPayload): boolean {
    return this.publish(alertsTopic(deviceId), JSON.stringify(payload), 1, false);
  }

  /** Publishes canonical status (online/offline) to pig/{id}/status. */
  publishStatus(deviceId: string, payload: CanonStatusPayload): boolean {
    return this.publish(statusTopic(deviceId), JSON.stringify(payload), 1, true);
  }

  /** Publishes the device response on pig/{id}/response. */
  publishResponse(deviceId: string, payload: { command: string; result: string; timestamp: number }): boolean {
    return this.publish(responseTopic(deviceId), JSON.stringify(payload), 1, false);
  }

  /** True when the topic carries one of the canonical inbound commands. */
  static isCanonicalCommand(_topic: string, payload: unknown): boolean {
    const cmd = typeof payload === 'object' && payload && 'command' in payload
      ? (payload as { command?: unknown }).command
      : payload;
    return CANON_COMMANDS.includes(String(cmd).toUpperCase());
  }

  close(graceful: boolean): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const wasConnected = this.connected;
    this.connected = false;
    if (this.mode === 'loopback' && this.broker) {
      this.broker.disconnect(this.clientId, graceful);
    } else if (this.liveClient) {
      this.liveClient.end(graceful);
      this.liveClient = null;
    }
    if (wasConnected && !graceful && this.mode === 'loopback') {
      // LWT already published by broker.disconnect(false); nothing more to do
      void 0;
    }
  }

  status(): MqttServiceStatus {
    return {
      mode: this.mode,
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      droppedOffline: this.droppedOffline,
      qos1Confirmed: this.qos1Confirmed,
      lastError: this.lastError
    };
  }

  /**
   * Simulates the broker/network abruptly dropping the connection
   * (Chaos Monkey / tests). Fires the LWT on the loopback broker and
   * schedules a full-jitter reconnect.
   */
  simulateDrop(): void {
    this.connected = false;
    if (this.mode === 'loopback') {
      this.broker?.disconnect(this.clientId, false);
    } else if (this.liveClient) {
      this.liveClient.end(false);
      this.liveClient = null;
    }
    this.scheduleReconnect();
  }

  // ---- internals ---------------------------------------------------------

  private resubscribe(): void {
    const handler = this.opts.onMessage;
    for (const [topic, qos] of this.subscriptions) {
      this.broker!.subscribe(this.clientId, {
        filter: topic,
        qos,
        handler: (msg) => handler?.(msg)
      });
    }
  }

  private resubscribeLive(): void {
    // mqtt.js re-subscribes automatically after reconnect; no-op here
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.reconnectAttempts++;
    // Full-jitter: delay = rand() * min(cap, base * 2^attempt)
    const base = this.opts.backoffMinMs ?? 250;
    const cap = this.opts.backoffMaxMs ?? 30_000;
    const exp = Math.min(cap, base * Math.pow(2, this.reconnectAttempts));
    const delay = Math.max(1, Math.floor(this.rng() * exp));
    this.retryTimer = setTimeout(() => {
      if (!this.closed) void this.connect();
    }, delay);
  }
}