/**
 * Arena geometry: pen coordinates (0..1 normalized) ↔ camera FOV ↔
 * 32x24 thermal grid. Pigs roam the pen; only pigs inside the FOV box
 * project onto the thermal frame.
 */

export interface FovRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1 width
  h: number; // 0..1 height
}

export interface Pt {
  x: number;
  y: number;
}

/** Clamps a normalized point into a rect (normalized). */
export function clampToRect(x: number, y: number, rect: FovRect): Pt {
  return {
    x: Math.min(rect.x + rect.w, Math.max(rect.x, x)),
    y: Math.min(rect.y + rect.h, Math.max(rect.y, y))
  };
}

/** True when the arena point (px,py pixels) lies inside the FOV rect. */
export function inFov(
  px: number,
  py: number,
  fov: FovRect,
  arenaW: number,
  arenaH: number
): boolean {
  const nx = px / arenaW;
  const ny = py / arenaH;
  return nx >= fov.x && nx <= fov.x + fov.w && ny >= fov.y && ny <= fov.y + fov.h;
}

/**
 * Projects an arena point (pixels) onto the 32x24 thermal grid.
 * Returns NaN coordinates when the point is outside the FOV.
 */
export function toThermalCoords(
  px: number,
  py: number,
  arenaW: number,
  arenaH: number,
  fov: FovRect,
  gridW = 32,
  gridH = 24
): { tx: number; ty: number } {
  if (!inFov(px, py, fov, arenaW, arenaH)) return { tx: NaN, ty: NaN };
  const nx = px / arenaW;
  const ny = py / arenaH;
  const u = (nx - fov.x) / fov.w; // 0..1 across FOV
  const v = (ny - fov.y) / fov.h;
  return {
    tx: u * (gridW - 1),
    ty: v * (gridH - 1)
  };
}