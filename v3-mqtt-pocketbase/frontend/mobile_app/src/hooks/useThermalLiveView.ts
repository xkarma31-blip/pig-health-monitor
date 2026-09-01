import { useEffect, useRef, useState } from "react";

type ThermalFrame = {
  type: "thermal" | "connected" | "pong" | "subscribed";
  topic?: string;
  data?: {
    deviceId?: string;
    temperatures?: number[];
    min?: number;
    max?: number;
    status?: string;
    timestamp?: number;
  };
  timestamp?: number;
};

type UseThermalLiveViewOptions {
  deviceId?: string;
  url?: string;
  enabled?: boolean;
  onFrame?: (frame: ThermalFrame) => void;
}

export function useThermalLiveView({
  deviceId,
  url = "ws://localhost:80/thermal-ws",
  enabled = true,
  onFrame,
}: UseThermalLiveViewOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<ThermalFrame | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log("✅ Thermal WebSocket connected");

        if (deviceId) {
          ws.send(JSON.stringify({ type: "subscribe", deviceId }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const frame: ThermalFrame = JSON.parse(event.data);
          setLatestFrame(frame);
          onFrame?.(frame);
        } catch (err) {
          console.error("❌ Thermal frame parse error:", err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log("❌ Thermal WebSocket disconnected, reconnecting...");
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("❌ Thermal WebSocket error:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, url, deviceId, onFrame]);

  return {
    connected,
    latestFrame,
    reconnect: () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    },
  };
}
