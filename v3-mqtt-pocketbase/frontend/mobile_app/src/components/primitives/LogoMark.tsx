import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '../../theme';
import iconAsset from '../../../assets/icon.png';

/**
 * Official PigPulse mark (pig/pulse heartbeat glyph) from the brand artwork.
 *
 * Replaces the old inline pulse zigzag: that was the pre-brand placeholder and
 * did not match the shipped app icon. This renders the same artwork the app
 * icon uses, so the header mark, the launcher icon and the favicon are one
 * identity. The asset is a full-bleed square, so it is clipped to the theme
 * radius instead of being letterboxed.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  const { radius } = useTheme();
  return (
    <Image
      source={iconAsset}
      style={{ width: size, height: size, borderRadius: radius.sm, flexShrink: 0 }}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      accessibilityLabel="PigPulse"
    />
  );
}
