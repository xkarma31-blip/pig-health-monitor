import { describe, it, expect } from 'vitest';
import {
  clampToRect,
  inFov,
  toThermalCoords,
  FovRect
} from '../arenaGeometry';

const FOV: FovRect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
const ARENA_W = 800;
const ARENA_H = 600;

describe('clampToRect', () => {
  it('keeps points inside the rect unchanged', () => {
    expect(clampToRect(0.5, 0.5, FOV)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps out-of-bounds points to the rect edges', () => {
    expect(clampToRect(0.05, 0.1, FOV)).toEqual({ x: 0.25, y: 0.25 });
    expect(clampToRect(0.9, 0.8, FOV)).toEqual({
      x: FOV.x + FOV.w,
      y: FOV.y + FOV.h
    });
  });
});

describe('inFov', () => {
  it('classifies the FOV center as inside', () => {
    expect(inFov(ARENA_W * 0.5, ARENA_H * 0.5, FOV, ARENA_W, ARENA_H)).toBe(true);
  });

  it('classifies points outside the FOV as outside', () => {
    expect(inFov(ARENA_W * 0.05, ARENA_H * 0.5, FOV, ARENA_W, ARENA_H)).toBe(false);
    expect(inFov(ARENA_W * 0.9, ARENA_H * 0.9, FOV, ARENA_W, ARENA_H)).toBe(false);
  });
});

describe('toThermalCoords', () => {
  it('maps the FOV center to the thermal grid center', () => {
    const { tx, ty } = toThermalCoords(ARENA_W * 0.5, ARENA_H * 0.5, ARENA_W, ARENA_H, FOV, 32, 24);
    expect(tx).toBeCloseTo(15.5, 5); // 32*0.5 - 0.5
    expect(ty).toBeCloseTo(11.5, 5); // 24*0.5 - 0.5
  });

  it('maps the FOV top-left to grid (0,0)', () => {
    const { tx, ty } = toThermalCoords(ARENA_W * FOV.x, ARENA_H * FOV.y, ARENA_W, ARENA_H, FOV, 32, 24);
    expect(tx).toBeCloseTo(0, 5);
    expect(ty).toBeCloseTo(0, 5);
  });

  it('maps the FOV bottom-right to the last grid cell', () => {
    const { tx, ty } = toThermalCoords(
      ARENA_W * (FOV.x + FOV.w),
      ARENA_H * (FOV.y + FOV.h),
      ARENA_W,
      ARENA_H,
      FOV,
      32,
      24
    );
    expect(tx).toBeCloseTo(31, 5);
    expect(ty).toBeCloseTo(23, 5);
  });

  it('returns NaN coordinates for pigs outside the FOV', () => {
    const r = toThermalCoords(ARENA_W * 0.05, ARENA_H * 0.5, ARENA_W, ARENA_H, FOV, 32, 24);
    expect(Number.isNaN(r.tx)).toBe(true);
    expect(Number.isNaN(r.ty)).toBe(true);
  });
});