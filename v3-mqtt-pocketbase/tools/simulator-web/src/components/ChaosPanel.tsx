import { useState, type ChangeEvent } from 'react';

export interface ChaosPanelValue {
  packetLossRate: number; // 0..1
  i2cLockupTrigger: boolean;
  batterySagMv: number;   // 0..300 mV transient when TX
  forcedBrownout: boolean;
}

export interface ChaosPanelProps {
  accessible?: boolean;
  className?: string;
  /** Controlled value (optional) so the App can drive virtualEsp32.injectChaos. */
  value?: ChaosPanelValue;
  onChange?: (next: ChaosPanelValue) => void;
}

export const DEFAULT_CHAOS_VALUE: ChaosPanelValue = {
  packetLossRate: 0,
  i2cLockupTrigger: false,
  batterySagMv: 0,
  forcedBrownout: false
};

export function ChaosPanel({
  accessible = false,
  className = '',
  value: controlled,
  onChange
}: ChaosPanelProps) {
  const [internal, setInternal] = useState<ChaosPanelValue>(DEFAULT_CHAOS_VALUE);
  const value = controlled ?? internal;

  const apply = (patch: Partial<ChaosPanelValue>) => {
    const next = { ...value, ...patch };
    if (onChange) {
      onChange(next);
    } else {
      setInternal(next);
    }
  };

  const onPacketLoss = (e: ChangeEvent<HTMLInputElement>) =>
    apply({ packetLossRate: Number(e.target.value) });
  const onI2cLockup = (e: ChangeEvent<HTMLInputElement>) =>
    apply({ i2cLockupTrigger: Number(e.target.value) > 0.5 });
  const onBatterySag = (e: ChangeEvent<HTMLInputElement>) =>
    apply({ batterySagMv: Number(e.target.value) });
  const onBrownout = (e: ChangeEvent<HTMLInputElement>) =>
    apply({ forcedBrownout: Number(e.target.value) > 0.5 });

  return (
    <div
      className={`chaos-panel ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="chaos-panel"
    >
      <h3>Chaos Monkey</h3>

      <div className="chaos-row">
        <label>
          Packet loss:
          <input
            type="range"
            data-testid="packet-loss"
            min="0"
            max="1"
            step="0.1"
            value={value.packetLossRate}
            onChange={onPacketLoss}
          />
        </label>
        <label>
          I2C lockup:
          <input
            type="range"
            data-testid="i2c-lockup"
            min="0"
            max="1"
            step="0.1"
            value={Number(value.i2cLockupTrigger)}
            onChange={onI2cLockup}
          />
        </label>
      </div>

      <div className="chaos-row">
        <label>
          Battery sag:
          <input
            type="range"
            data-testid="battery-sag"
            min="0"
            max="300"
            step="10"
            value={value.batterySagMv}
            onChange={onBatterySag}
          />
          <span style={{ marginLeft: '1rem' }}>{value.batterySagMv} mV</span>
        </label>
        <label>
          Brownout:
          <input
            type="range"
            data-testid="brownout"
            min="0"
            max="1"
            step="0.1"
            value={Number(value.forcedBrownout)}
            onChange={onBrownout}
          />
        </label>
      </div>
    </div>
  );
}