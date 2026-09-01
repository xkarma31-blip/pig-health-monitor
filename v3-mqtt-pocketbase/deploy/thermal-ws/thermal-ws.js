#!/usr/bin/env node
/**
 * PigPulse v3 — Thermal Live View WebSocket Broadcaster
 *
 * Subscribes to MQTT thermal topic and broadcasts to all WebSocket clients.
 * This enables low-latency bidirectional thermal streaming.
 */

const mqtt = require("mqtt");
const WebSocket = require("ws");

const MQTT_BROKER = process.env.MQTT_BROKER || "mosquitto";
const MQTT_PORT = parseInt(process.env.MQTT_PORT || "1883");
const WS_PORT = parseInt(process.env.WS_PORT || "8080");
const THERMAL_TOPIC = process.env.THERMAL_TOPIC || "pig/+/thermal/live";

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`📡 Thermal WebSocket server starting on port ${WS_PORT}`);

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`✅ WebSocket client connected: ${clientIp}`);

  ws.send(JSON.stringify({
    type: "connected",
    message: "Thermal live view connected",
    timestamp: Date.now(),
  }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`📩 Received from client: ${msg.type || "unknown"}`);

      // Handle client messages (bidirectional)
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } else if (msg.type === "subscribe") {
        ws.send(JSON.stringify({
          type: "subscribed",
          deviceId: msg.deviceId,
          timestamp: Date.now(),
        }));
      }
    } catch (err) {
      console.error("❌ WebSocket message error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log(`❌ WebSocket client disconnected: ${clientIp}`);
  });

  ws.on("error", (err) => {
    console.error(`❌ WebSocket error: ${err.message}`);
  });
});

// MQTT client
const mqttClient = mqtt.connect({
  host: MQTT_BROKER,
  port: MQTT_PORT,
  protocol: "mqtt",
});

mqttClient.on("connect", () => {
  console.log(`✅ Connected to MQTT broker ${MQTT_BROKER}:${MQTT_PORT}`);
  mqttClient.subscribe(THERMAL_TOPIC, { qos: 1 }, (err) => {
    if (err) {
      console.error(`❌ Failed to subscribe to ${THERMAL_TOPIC}:`, err);
    } else {
      console.log(`📡 Subscribed to ${THERMAL_TOPIC}`);
    }
  });
});

mqttClient.on("message", (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());

    // Broadcast to all connected WebSocket clients
    const message = JSON.stringify({
      type: "thermal",
      topic,
      data,
      timestamp: Date.now(),
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });

    console.log(`📨 Broadcasted thermal data to ${wss.clients.size} clients`);
  } catch (err) {
    console.error("❌ MQTT message error:", err.message);
  }
});

mqttClient.on("error", (err) => {
  console.error(`❌ MQTT error: ${err.message}`);
});

mqttClient.on("disconnect", () => {
  console.log("⚠️  Disconnected from MQTT broker");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  mqttClient.end();
  wss.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down...");
  mqttClient.end();
  wss.close();
  process.exit(0);
});
