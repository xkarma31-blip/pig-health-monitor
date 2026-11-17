/** Small pure helper for the app's top safe-area padding. */

export interface TopInset {
  top: number;
}

/** Never produce negative padding from a hostile or broken inset provider. */
export function rootTopPadding(insets: TopInset): number {
  return Number.isFinite(insets.top) && insets.top > 0 ? insets.top : 0;
}
