import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '../../theme';
import glyphLight from '../../../assets/glyph-light.png';
import glyphDark from '../../../assets/glyph-dark.png';

/**
 * The official PigPulse glyph (the green tile with the pulse trace), taken
 * from the delivered brand PDFs.
 *
 * Two variants exist and they are NOT interchangeable:
 *   light -> green tile, BLACK pulse trace
 *   dark  -> green tile, WHITE pulse trace
 * The tile is a rounded rectangle about 1.39:1 (512x368), so the size
 * argument is the HEIGHT and the width follows the artwork's own ratio.
 *
 * The variant follows the app theme, so the mark is never a black trace on a
 * dark screen (invisible) or a white trace on a light one.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  const { scheme } = useTheme();
  const source = scheme === 'dark' ? glyphDark : glyphLight;
  const width = Math.round(size * (512 / 368));

  return (
    <Image
      source={source}
      style={{ width, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessibilityLabel="PigPulse"
    />
  );
}
