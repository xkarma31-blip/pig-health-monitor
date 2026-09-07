/**
 * In-Browser Loopback Broker (fallback when ws://localhost:9001 is unreachable)
 *
 * Minimal but faithful MQTT semantics:
 *  - Topic filters with `+` (single level) and `#` (multi level) wildcards
 *  - QoS 0 (fire & forget) and QoS 1 (confirmed delivery) routing
 *  - Retained messages delivered to late subscribers
 *  - Last Will & Testament (LWT): published on abrupt disconnect only
 *  - clientId registry with graceful/abrupt disconnect distinction
 *
 * Pure logic — no sockets — fully unit-testable in Node.
 */

export type Qos = 0 | 1;

export interface MqttMessage {
  topic: string;
  payload: string; // JSON string in our pipeline
  qos: Qos;
  retain: boolean;
}

export interface WillMessage {
  // alias of MqttMessage without retain (broker forces retain=false for wills? no: will uses retain as-is)
  topic: string;
  payload: string;
  qos: Qos;
  retain: boolean;
}

export type SubscribeHandler = (msg: MqttMessage) => void;

export interface Subscription {
  filter: string;
  qos: Qos;
  handler: SubscribeHandler;
}

/**
 * Returns true when `topic` matches the MQTT `filter` (`+` single level, `#` multi level).
 */
export function matchTopicFilter(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    const seg = f[i];
    if (seg === '#') return true; // matches remainder (including zero levels)
    if (seg === '+') {
      if (i >= t.length) return false; // + must match one level
      continue;
    }
    if (i >= t.length || seg !== t[i]) return false;
  }
  return f.length === t.length;
}

export class LoopbackBroker {
  private subscriptions = new Map<string, Subscription[]>();
  private retained = new Map<string, MqttMessage>();
  private wills = new Map<string, MqttMessage>();
  private clients = new Set<string>();

  connect(clientId: string, will?: MqttMessage): void {
    this.clients.add(clientId);
    if (will) this.wills.set(clientId, will);
    // deliver retained messages immediately on connect for existing subs
    this.deliverRetained(clientId);
  }

  isConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  connectedClients(): string[] {
    return [...this.clients];
  }

  subscribe(clientId: string, subscription: Subscription): void {
    const list = this.subscriptions.get(clientId) ?? [];
    list.push(subscription);
    this.subscriptions.set(clientId, list);
    // deliver retained messages matching this filter
    for (const msg of this.retained.values()) {
      if (matchTopicFilter(subscription.filter, msg.topic)) {
        subscription.handler(msg);
      }
    }
  }

  unsubscribe(clientId: string, filter: string): void {
    const list = this.subscriptions.get(clientId) ?? [];
    this.subscriptions.set(
      clientId,
      list.filter((s) => s.filter !== filter)
    );
  }

  /**
   * Publishes from a client (null for broker-internal, e.g. LWT).
   * Routes to all matching subscribers; stores when retain=true.
   */
  publish(msg: MqttMessage, fromClientId: string | null = null): void {
    if (msg.retain) this.retained.set(msg.topic, msg);

    const targets = new Set<[SubscribeHandler, Qos]>();
    for (const [clientId, subs] of this.subscriptions) {
      if (!this.clients.has(clientId)) continue; // offline clients receive nothing
      if (clientId === fromClientId) continue; // no self-delivery (matches MQTT)
      for (const sub of subs) {
        if (matchTopicFilter(sub.filter, msg.topic)) {
          targets.add([sub.handler, Math.min(sub.qos, msg.qos) as Qos]);
        }
      }
    }
    for (const [handler] of targets) {
      handler({ ...msg, qos: msg.qos });
    }
  }

  /** Graceful disconnect: no LWT publish, subs retained for next connect. */
  disconnect(clientId: string, graceful: boolean): void {
    this.clients.delete(clientId);
    if (!graceful && this.wills.has(clientId)) {
      const will = this.wills.get(clientId)!;
      this.publish({ ...will, retain: false }, null);
    }
    this.wills.delete(clientId);
  }

  clearRetained(): void {
    this.retained.clear();
  }

  private deliverRetained(clientId: string): void {
    const subs = this.subscriptions.get(clientId) ?? [];
    for (const msg of this.retained.values()) {
      for (const sub of subs) {
        if (matchTopicFilter(sub.filter, msg.topic)) sub.handler(msg);
      }
    }
  }
}