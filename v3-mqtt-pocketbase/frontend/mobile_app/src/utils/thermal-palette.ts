/**
 * Thermal colormaps — shared by the live renderer and the legend bar.
 * Stops mirror the Pi console's default "Iron / Thermal" palette so the app
 * and the Pi dashboard color the same temperature the same way.
 */

export const IRON_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [0, 0, 12]],
  [0.18, [34, 6, 75]],
  [0.36, [132, 20, 78]],
  [0.55, [224, 58, 48]],
  [0.72, [255, 151, 31]],
  [0.88, [255, 243, 105]],
  [1.0, [255, 255, 255]],
];

/** Map t∈[0,1] to an iron-palette RGB triple (lerped between stops). */
export function ironRgb(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  for (let i = 0; i < IRON_STOPS.length - 1; i++) {
    const a = IRON_STOPS[i];
    const b = IRON_STOPS[i + 1];
    if (c >= a[0] && c <= b[0]) {
      const k = b[0] === a[0] ? 0 : (c - a[0]) / (b[0] - a[0]);
      return [
        Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
        Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
        Math.round(a[1][2] + (b[1][2] - a[1][2]) * k),
      ];
    }
  }
  return IRON_STOPS[IRON_STOPS.length - 1][1];
}
