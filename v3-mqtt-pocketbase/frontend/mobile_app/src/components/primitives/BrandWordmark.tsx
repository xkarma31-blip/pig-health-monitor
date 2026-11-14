import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '../../theme';
import logoLight from '../../../assets/logo-light.png';
import logoDark from '../../../assets/logo-dark.png';

/**
 * The official PigPulse wordmark, straight from the delivered brand PDFs.
 *
 * The designer supplied two lockups:
 *   light mode -> green tile, BLACK ECG, black "Pig", green "pulse"
 *   dark mode  -> green tile, WHITE ECG, white "Pig", green "pulse"
 * Those are the assets the landing page already swaps with a <picture>
 * element; the app has to pick the same pair, because the app and the site
 * are the same product and must not look like two brands.
 *
 * The selection follows the APP's own theme (the user's saved light/dark
 * choice), not only the OS setting — the theme context already resolves
 * system-vs-override into a single `scheme`.
 *
 * Sizes match the site: 28px for the main lockup, 21px for the small one.
 */
export function BrandWordmark({ height = 28 }: { height?: number }) {
  const { scheme } = useTheme();
  const source = scheme === 'dark' ? logoDark : logoLight;

  // The artwork is 1400x287 (4.877:1). Keep that ratio so the mark is never
  // stretched; `contain` does the rest.
  const width = Math.round(height * (1400 / 287));

  return (
    <Image
      source={source}
      style={{ width, height }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessibilityLabel="PigPulse"
      accessibilityRole="header"
    />
  );
}
