import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LoopbackBroker,
  matchTopicFilter,
  MqttMessage,
  Qos
} from '../loopbackBroker';
import { MqttService, MqttServiceOptions } from '../mqttService';
import { telemetryTopic, alertsTopic, statusTopic, commandsTopic, responseTopic } from '../../types/canonMqtt';

const DEVICE_ID = 'sim-1234';

function makeOptions(): MqttServiceOptions {
  return {
    clientId: 'sim-test-client',
    broker: new LoopbackBroker(),
    backoffMinMs: 250,
    backoffMaxMs: 4000,
    rng: () => 0.5 // deterministic full-jitter midpoint
  };
}

function jsonMsg(topic: string, payload: object, qos: Qos = 0, retain = false): MqttMessage {
  return { topic, payload: JSON.stringify(payload), qos, retain };
}

describe('matchTopicFilter (MQTT wildcards)', () => {
  it('matches exact topic filters', () => {
    expect(matchTopicFilter('pig/a/telemetry', 'pig/a/telemetry')).toBe(true);
    expect(matchTopicFilter('pig/a/telemetry', 'pig/b/telemetry')).toBe(false);
    expect(matchTopicFilter('pig/a/telemetry', 'pig/a/status')).toBe(false);
  });

  it('matches + single-level wildcards', () => {
    expect(matchTopicFilter('pig/+/telemetry', 'pig/sim-1/telemetry')).toBe(true);
    expect(matchTopicFilter('pig/+/telemetry', 'pig/sim-1/alerts')).toBe(false);
    expect(matchTopicFilter('pig/+/telemetry', 'pig/a/b/telemetry')).toBe(false);
  });

  it('matches # multi-level (including zero levels) wildcards', () => {
    expect(matchTopicFilter('pig/#', 'pig/sim-1/telemetry')).toBe(true);
    expect(matchTopicFilter('pig/#', 'pig/sim-1')).toBe(true);
    expect(matchTopicFilter('pig/sim-1/#', 'pig/sim-1/telemetry')).toBe(true);
    expect(matchTopicFilter('pig/sim-1/#', 'pig/other/telemetry')).toBe(false);
  });
});

describe('LoopbackBroker routing', () => {
  let broker: LoopbackBroker;
  let received: string[];

  beforeEach(() => {
    broker = new LoopbackBroker();
    received = [];
  });

  it('routes published messages to direct and wildcard subscribers', () => {
    broker.connect('sub-1');
    broker.connect('sub-2');
    const direct = (msg: MqttMessage) => received.push(`direct:${msg.topic}`);
    const wild = (msg: MqttMessage) => received.push(`wild:${msg.topic}`);
    broker.subscribe('sub-1', { filter: telemetryTopic(DEVICE_ID), qos: 0, handler: direct });
    broker.subscribe('sub-2', { filter: 'pig/+/telemetry', qos: 0, handler: wild });

    broker.publish(jsonMsg(telemetryTopic(DEVICE_ID), { a: 1 }), 'pub-1');

    expect(received.sort()).toEqual([
      `direct:${telemetryTopic(DEVICE_ID)}`,
      `wild:${telemetryTopic(DEVICE_ID)}`
    ]);
  });

  it('does not self-deliver to the publishing client', () => {
    broker.connect('pub-1');
    broker.subscribe('pub-1', {
      filter: 'pig/#',
      qos: 0,
      handler: (msg) => received.push(msg.topic)
    });
    broker.publish(jsonMsg(telemetryTopic(DEVICE_ID), { a: 1 }), 'pub-1');
    expect(received).toHaveLength(0);
  });

  it('delivers retained messages to late subscribers', () => {
    broker.connect('pub-1');
    broker.publish(jsonMsg(statusTopic(DEVICE_ID), { online: true }, 1, true), 'pub-1');

    broker.connect('late');
    broker.subscribe('late', {
      filter: statusTopic(DEVICE_ID),
      qos: 0,
      handler: (msg) => received.push(msg.topic)
    });
    expect(received).toEqual([statusTopic(DEVICE_ID)]);
  });

  it('publishes the will (LWT) on abrupt disconnect only', () => {
    const will = jsonMsg(statusTopic(DEVICE_ID), { online: false }, 1);
    broker.connect('dying', will);
    broker.connect('watcher');
    broker.subscribe('watcher', {
      filter: statusTopic(DEVICE_ID),
      qos: 0,
      handler: (msg) => received.push(msg.topic)
    });

    broker.disconnect('dying', false); // abrupt
    expect(received).toEqual([statusTopic(DEVICE_ID)]);

    received.length = 0;
    broker.connect('graceful', will);
    broker.disconnect('graceful', true); // graceful — no LWT
    expect(received).toHaveLength(0);
  });
});

describe('MqttService (loopback mode)', () => {
  let opts: MqttServiceOptions;
  let broker: LoopbackBroker;
  let service: MqttService;
  let inbound: MqttMessage[];

  beforeEach(() => {
    opts = makeOptions();
    broker = opts.broker as LoopbackBroker;
    inbound = [];
    service = new MqttService({ ...opts, onMessage: (msg) => inbound.push(msg) });
  });

  afterEach(() => {
    service.close(true);
    vi.useRealTimers();
  });

  it('connects and reports status', async () => {
    await service.connect();
    expect(service.status()).toMatchObject({
      mode: 'loopback',
      connected: true,
      reconnectAttempts: 0,
      droppedOffline: 0
    });
    expect(broker.connectedClients()).toContain('sim-test-client');
  });

  it('publishes canonical telemetry/alerts to the right topics', async () => {
    await service.connect();
    broker.connect('observer');
    const sub: { filter: string; qos: Qos; handler: (m: MqttMessage) => void } = {
      filter: 'pig/+/telemetry',
      qos: 0,
      handler: (m: MqttMessage) => { inbound.push(m); }
    };
    broker.subscribe('observer', sub);
    broker.subscribe('observer', {
      filter: 'pig/+/alerts',
      qos: 0,
      handler: (m: MqttMessage) => { inbound.push(m); }
    });

    const telemetry = { thermalFrame: 'abc', targetX: 16, targetY: 12, deviceId: DEVICE_ID } as never;
    service.publishTelemetry(DEVICE_ID, telemetry);
    service.publishAlert(DEVICE_ID, { type: 'FEVER', severity: 'WARNING', pigId: DEVICE_ID, value: 39.6, threshold: 39.5, message: 'x', timestamp: 1 });

    const topics = inbound.map((m) => m.topic).sort();
    expect(topics).toEqual([alertsTopic(DEVICE_ID), telemetryTopic(DEVICE_ID)]);
  });

  it('executes a canonical command roundtrip (command in, response out)', async () => {
    await service.connect();
    service.subscribe(commandsTopic(DEVICE_ID), 1); // device-side command listener
    broker.connect('app');
    const appReceived: string[] = [];
    broker.subscribe('app', {
      filter: responseTopic(DEVICE_ID),
      qos: 1,
      handler: (msg) => appReceived.push(msg.payload)
    });

    broker.publish(jsonMsg(commandsTopic(DEVICE_ID), { command: 'PING', timestamp: 4 }, 1), 'app');
    await new Promise((r) => setTimeout(r, 10));
    expect(inbound.some((m) => m.topic === commandsTopic(DEVICE_ID))).toBe(true);

    service.publishResponse(DEVICE_ID, { command: 'PING', result: 'ok', timestamp: 5 });
    await new Promise((r) => setTimeout(r, 10));
    expect(appReceived.join()).toContain('"ok"');
  });

  it('drops and counts qos0 publishes while offline (no pileup), replays retained on reconnect', async () => {
    vi.useFakeTimers();
    await service.connect();
    service.subscribe(telemetryTopic(DEVICE_ID), 0);
    service.subscribe(statusTopic(DEVICE_ID), 0);

    service.simulateDrop(); // broker/network yanks the connection
    expect(service.status().connected).toBe(false);
    expect(service.status().reconnectAttempts).toBe(1);

    const sent = service.publishTelemetry(DEVICE_ID, { thermalFrame: 'x', targetX: 0, targetY: 0, deviceId: DEVICE_ID } as never);
    expect(sent).toBe(false);
    expect(service.status().droppedOffline).toBe(1);

    // broker publishes retained status while we are offline — must NOT reach us yet
    broker.publish(jsonMsg(statusTopic(DEVICE_ID), { online: true }, 1, true), 'other');
    expect(inbound.some((m) => m.topic === statusTopic(DEVICE_ID))).toBe(false);

    // full-jitter retry fires and reconnects
    await vi.advanceTimersByTimeAsync(2000);
    expect(broker.isConnected('sim-test-client')).toBe(true);
    expect(service.status().connected).toBe(true);
    // dropped telemetry was NOT silently replayed
    expect(inbound.filter((m) => m.topic === telemetryTopic(DEVICE_ID))).toHaveLength(0);
    // retained status WAS replayed on reconnect
    expect(inbound.some((m) => m.topic === statusTopic(DEVICE_ID) && m.payload.includes('"online":true'))).toBe(true);
    vi.useRealTimers();
  });

  it('qos1 publishes count as confirmed', async () => {
    await service.connect();
    service.publish(telemetryTopic(DEVICE_ID), JSON.stringify({ n: 1 }), 1);
    expect(service.status().qos1Confirmed).toBe(1);
  });

  it('publishes LWT through the broker on abrupt close, but not graceful close', async () => {
    const willOpts = makeOptions();
    willOpts.will = jsonMsg(statusTopic(DEVICE_ID), { online: false }, 1);
    const svc = new MqttService({ ...willOpts, broker: willOpts.broker as LoopbackBroker });
    const shared = willOpts.broker as LoopbackBroker;
    const seen: string[] = [];
    await svc.connect();
    shared.connect('watcher');
    shared.subscribe('watcher', {
      filter: statusTopic(DEVICE_ID),
      qos: 0,
      handler: (m) => seen.push(m.topic)
    });
    svc.close(false); // abrupt — will must fire
    expect(seen).toEqual([statusTopic(DEVICE_ID)]);
  });

  it('rejects non-canonical commands', () => {
    expect(MqttService.isCanonicalCommand(commandsTopic(DEVICE_ID), { command: 'PING' })).toBe(true);
    expect(MqttService.isCanonicalCommand(commandsTopic(DEVICE_ID), { command: 'RM -RF /' })).toBe(false);
  });
});