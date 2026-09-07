import { useWindowDimensions } from 'react-native';
import { useTheme } from '../theme';

export type DeviceTier = 'compact' | 'medium' | 'expanded';

/**
 * Maps window width to the design-system tiers:
 *  - compact  (< sm 600)  phones          → bottom nav, single column
 *  - medium   (sm–md 960) small tablets    → bottom nav, centered content, 2-col grids
 *  - expanded (>= md 960) tablets landscape / desktop → sidebar nav, wide grids
 */
export function useBreakpoint(): DeviceTier {
  const { width } = useWindowDimensions();
  const { breakpoints } = useTheme();
  if (width >= breakpoints.md) return 'expanded';
  if (width >= breakpoints.sm) return 'medium';
  return 'compact';
}