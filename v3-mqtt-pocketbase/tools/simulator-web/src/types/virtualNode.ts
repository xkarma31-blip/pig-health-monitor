/**
 * Virtual Hardware Engine Types & State Machine Interfaces
 */

export interface VirtualNodeProfile {
  id: string;
  name: string;
  soc: 'ESP32-D0WD' | 'ESP32-S3';
  sramBytes: number;
  hasPsram: boolean;
  coreClockMhz: number;
  firmwareVersion: string;
}

export const PROFILE_D0WD: VirtualNodeProfile = {
  id: 'esp32-001',
  name: 'Pen 1 Sentinel (D0WD Raw Relay)',
  soc: 'ESP32-D0WD',
  sramBytes: 520 * 1024,
  hasPsram: false,
  coreClockMhz: 240,
  firmwareVersion: '3.0.0-d0wd'
};

export const PROFILE_S3: VirtualNodeProfile = {
  id: 'esp32-s3-001',
  name: 'Pen 1 S3 Edge Experimental',
  soc: 'ESP32-S3',
  sramBytes: 512 * 1024,
  hasPsram: true,
  coreClockMhz: 240,
  firmwareVersion: '3.1.0-s3'
};

export type FreeRtosState = 'BOOT' | 'IDLE' | 'SAMPLE' | 'TX' | 'HIBERNATE' | 'PANIC_WDT' | 'BROWNOUT';

export type PowerState = 'NORMAL' | 'LOW' | 'CRITICAL' | 'HIBERNATE';

export interface VirtualHardwareState {
  state: FreeRtosState;
  uptimeSeconds: number;
  freeHeapBytes: number;
  minFreeHeapBytes: number;
  batteryMv: number;
  batteryPct: number;
  powerState: PowerState;
  wifiRssiDbm: number;
  wifiConnected: boolean;
  mqttConnected: boolean;
  i2cLocked: boolean;
  txSagActive: boolean;
  flashWriteCycles: number;
  overflowDrops: number;
}
