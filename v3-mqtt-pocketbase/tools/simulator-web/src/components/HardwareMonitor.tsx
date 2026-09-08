export interface HardwareMonitorProps {
  accessible?: boolean;
  className?: string;
  /** Live values from the virtual node (optional — static defaults standalone). */
  batteryPct?: number;
  freeHeap?: number;
  wifiRssi?: number;
}

export function HardwareMonitor({
  accessible = false,
  className = '',
  batteryPct = 88,
  freeHeap = 145200,
  wifiRssi = -68
}: HardwareMonitorProps) {
  return (
    <div
      className={`hardware-monitor ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="hardware-monitor"
    >
      <h3>Hardware Monitor</h3>
      <div className="hardware-row">
        <span data-testid="battery-level">Battery: {batteryPct.toFixed(1)}%</span>
        <span style={{ marginLeft: '2rem' }} data-testid="free-heap">
          Free heap: {freeHeap.toLocaleString()} bytes
        </span>
      </div>
      <div className="hardware-row">
        <span data-testid="wifi-rssi">WiFi RSSI: {wifiRssi} dBm</span>
      </div>
    </div>
  );
}