/**
 * AudioLevelMeter — barn-mic level from the ESP32-S3 telemetry frame.
 *
 * The number is dBFS computed with the firmware's own formula from the 24-bit
 * RMS (`utils/live-source.ts`), so it matches the serial monitor rather than
 * being a made-up percentage.
 *
 * Zero is reported as "no signal", not "quiet": the Pi GPIO mic once returned
 * bit-exact zeros and a flat line looked like a quiet room (CANON §2.5).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { dbfsFromRms, meterPercent, METER_FLOOR_DBFS } from '../../utils/live-source';
import { FONT_FLOOR, monitorText, stage } from './tokens';

export function AudioLevelMeter({
  rms,
  peak,
  active,
  detail,
}: {
  rms?: number;
  peak?: number;
  active: boolean;
  detail?: string;
}) {
  const db = dbfsFromRms(rms);
  const fill = meterPercent(db);
  const peakFill = meterPercent(dbfsFromRms(peak));
  const silent = !active || !rms;

  const barColor = silent ? stage.idle : db > -12 ? stage.stale : stage.live;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[monitorText.micro, { color: stage.inkDim }]}>Barn mic</Text>
        <Text style={[monitorText.body, { color: silent ? stage.inkDim : stage.ink }]}>
          {silent ? 'no signal' : `${db.toFixed(0)} dBFS`}
        </Text>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel="Barn microphone level"
        accessibilityValue={{
          min: METER_FLOOR_DBFS,
          max: 0,
          now: Math.round(db),
          text: silent ? 'No signal' : `${db.toFixed(0)} dBFS`,
        }}
      >
        <View style={[styles.fill, { width: `${fill}%`, backgroundColor: barColor }]} />
        {!silent ? (
          <View style={[styles.peakMark, { left: `${Math.min(99, peakFill)}%` }]} />
        ) : null}
      </View>

      <Text style={[monitorText.body, { color: stage.inkDim, fontSize: FONT_FLOOR }]} numberOfLines={2}>
        {detail ?? `24-bit RMS ${Math.round(rms ?? 0)} · peak ${Math.round(peak ?? 0)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: {
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: stage.edge,
    backgroundColor: stage.deep,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 7 },
  peakMark: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: stage.ink },
});
