/**
 * LinkChip — one device's link state, in the Pi console's vocabulary.
 *
 * States come from `utils/live-source.ts` (recency against the device's real
 * publish cadence), never from optimism. "unknown" is a first-class state: if
 * we have never seen the device, we say so.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { stage, monitorText, FONT_FLOOR } from './tokens';
import type { LinkState } from '../../utils/live-source';

const LABEL: Record<LinkState, string> = {
  live: 'LIVE',
  stale: 'LATE',
  offline: 'OFFLINE',
  unknown: 'NO DATA',
};

const COLOR: Record<LinkState, string> = {
  live: stage.live,
  stale: stage.stale,
  offline: stage.offline,
  unknown: stage.idle,
};

const TINT: Record<LinkState, string> = {
  live: 'rgba(53,224,208,0.16)',
  stale: 'rgba(255,178,63,0.16)',
  offline: 'rgba(255,93,108,0.16)',
  unknown: 'rgba(90,97,128,0.20)',
};

export function LinkChip({
  state,
  label,
  detail,
}: {
  state: LinkState;
  label: string;
  detail?: string;
}) {
  const color = COLOR[state];
  return (
    <View style={[styles.chip, { borderColor: color, backgroundColor: TINT[state] }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flexShrink: 1 }}>
        <Text style={[monitorText.label, { color: stage.ink }]} numberOfLines={1}>
          {label}
          <Text style={{ color }}>{`  ${LABEL[state]}`}</Text>
        </Text>
        {detail ? (
          <Text style={[monitorText.body, { color: stage.inkDim, fontSize: FONT_FLOOR }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
