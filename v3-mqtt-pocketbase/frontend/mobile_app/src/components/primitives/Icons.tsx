import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../theme';

// One consistent monoline icon set (react-native-svg).
// Only extra dependency this whole app needs: `npx expo install react-native-svg`.

type IconProps = { size?: number; color?: string };

function useIconColor(color?: string) {
  const { colors } = useTheme();
  return color ?? colors.textMuted;
}

/* ── Tab / navigation icons ─────────────────────────────────────── */

export function HomeIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 10.5L12 3l9 7.5" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"
        stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BellIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export const EventsIcon = BellIcon;

export function RosterIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3.5} stroke={c} strokeWidth={1.8} />
      <Path d="M2.5 20a6.5 6.5 0 0 1 13 0" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={16} cy={9} r={3} stroke={c} strokeWidth={1.8} opacity={0.55} />
      <Path d="M15 14.2a6.5 6.5 0 0 1 6.5 5.8" stroke={c} strokeWidth={1.8} strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}

export function SettingsIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={1.8} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchIcon({ size = 16, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={c} strokeWidth={2} />
      <Path d="M21 21l-4.35-4.35" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 16, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 16, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={c} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function RefreshIcon({ size = 18, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12a9 9 0 1 1-3-6.7" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 3v6h-6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ── Sensor / status glyphs ──────────────────────────────────────── */

/** Thermometer glyph — used for pen/pig status rows and thermal events */
export function ThermometerIcon({ size = 14, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={(size * 18) / 14} viewBox="0 0 14 18" fill="none">
      <Rect x={4.5} y={1} width={5} height={11} rx={2.5} stroke={c} strokeWidth={1.5} />
      <Circle cx={7} cy={14} r={3.5} fill={c} />
      <Rect x={5.5} y={6} width={3} height={6} fill={c} />
    </Svg>
  );
}

export const TemperatureIcon = ThermometerIcon;

/** 2x2 sensor-grid glyph — used for hardware node rows */
export function SensorGridIcon({ size = 16, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x={0} y={0} width={6} height={6} rx={1.5} fill={c} />
      <Rect x={10} y={0} width={6} height={6} rx={1.5} fill={c} opacity={0.55} />
      <Rect x={0} y={10} width={6} height={6} rx={1.5} fill={c} opacity={0.55} />
      <Rect x={10} y={10} width={6} height={6} rx={1.5} fill={c} />
    </Svg>
  );
}

export const NodesIcon = SensorGridIcon;

/** Waveform glyph — used for acoustic/sound events */
export function WaveformIcon({ size = 16, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={(size * 14) / 16} viewBox="0 0 16 14" fill="none">
      <Rect x={0} y={5} width={2} height={4} rx={1} fill={c} />
      <Rect x={4} y={2} width={2} height={10} rx={1} fill={c} />
      <Rect x={8} y={0} width={2} height={14} rx={1} fill={c} />
      <Rect x={12} y={3} width={2} height={8} rx={1} fill={c} />
    </Svg>
  );
}

/** Pulse-line glyph — the logo mark */
export function PulseIcon({ size = 18, color = 'white' }: IconProps) {
  const c = color ?? 'white';
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M1 10H6L8.5 3L12 17L14.5 10H19"
        stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export const FeedIcon = PulseIcon;

/** Generic circle-plus glyph, used for the "no pigs enrolled" empty state */
export function PigPlusIcon({ size = 18, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={c} strokeWidth={1.8} />
      <Path d="M12 8v8M8 12h8" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/* ── Feedback glyphs (legacy surface) ────────────────────────────── */

export function AlertIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4.5L21.5 20h-19L12 4.5z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M12 10v4.5" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={17.5} r={0.9} fill={c} />
    </Svg>
  );
}

export const WarningIcon = AlertIcon;

export function CheckIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13l4 4L19 7" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function InfoIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={1.8} />
      <Path d="M12 11v5" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={7.5} r={0.9} fill={c} />
    </Svg>
  );
}

export function LockIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4.5} y={11} width={15} height={10} rx={2} stroke={c} strokeWidth={1.8} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Trend-up chart glyph — legacy Analytics tab */
export function AnalyticsIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17l6-6 4 4 8-8" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 7h6v6" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Chip glyph — legacy AI tab */
export function AIIcon({ size = 20, color }: IconProps) {
  const c = useIconColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={7} width={10} height={10} rx={2} stroke={c} strokeWidth={1.8} />
      <Path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={1.4} fill={c} />
    </Svg>
  );
}