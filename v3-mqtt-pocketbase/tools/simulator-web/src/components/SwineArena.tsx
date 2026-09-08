import { useRef } from 'react';
import { FovRect } from '../utils/arenaGeometry';
import { cmapIndex, getColormap } from '../utils/colormaps';

export interface ArenaPig {
  id: string;
  x: number; // 0..1 normalized pen position
  y: number; // 0..1
  temp: number;
  state: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

export interface SwineArenaProps {
  pigs: ArenaPig[];
  fov?: FovRect; // default: centered 50% box
  onMovePig?: (id: string, x: number, y: number) => void;
  accessible?: boolean;
  className?: string;
}

const LOGICAL_W = 800;
const LOGICAL_H = 600;
const DEFAULT_FOV: FovRect = { x: 0.25, y: 0.3, w: 0.5, h: 0.4 };

const STATE_COLORS: Record<ArenaPig['state'], string> = {
  NORMAL: '#22c55e',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444'
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function pigColor(temp: number): string {
  const lut = getColormap('ironbow');
  const idx = Math.max(0, cmapIndex(temp, 20, 42));
  const o = idx * 4;
  return `rgb(${lut[o]},${lut[o + 1]},${lut[o + 2]})`;
}

/**
 * Interactive 2D roaming pen. Pigs drag freely (clamped to the pen); the
 * dashed rect marks the camera FOV that projects onto the 32x24 grid.
 */
export function SwineArena({
  pigs,
  fov = DEFAULT_FOV,
  onMovePig,
  accessible = false,
  className = ''
}: SwineArenaProps) {
  const dragRef = useRef<string | null>(null);

  const fovPx = {
    x: fov.x * LOGICAL_W,
    y: fov.y * LOGICAL_H,
    w: fov.w * LOGICAL_W,
    h: fov.h * LOGICAL_H
  };

  const onPointerDown = (pigId: string) => {
    dragRef.current = pigId;
  };

  const onPointerMove = (pig: ArenaPig, clientX: number, clientY: number, svg: SVGSVGElement | null) => {
    if (dragRef.current !== pig.id || !onMovePig) return;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    onMovePig(pig.id, x, y);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className={`swine-arena ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="swine-arena"
    >
      <div
        role="img"
        aria-label={`Swine arena showing ${pigs.length} pig${pigs.length === 1 ? '' : 's'} with camera field of view`}
      >
        <svg
          viewBox={`0 0 ${LOGICAL_W} ${LOGICAL_H}`}
          data-testid="swine-arena-svg"
          className="arena-svg"
        >
          {/* pen floor */}
          <rect width={LOGICAL_W} height={LOGICAL_H} className="arena-floor" rx="12" />
          {/* camera FOV */}
          <rect
            x={fovPx.x}
            y={fovPx.y}
            width={fovPx.w}
            height={fovPx.h}
            className="arena-fov"
            data-testid="fov-rect"
          />
          <text x={fovPx.x + 8} y={fovPx.y + 20} className="arena-fov-label">
            CAMERA FOV
          </text>
          {/* pigs */}
          {pigs.map((pig) => {
            const px = pig.x * LOGICAL_W;
            const py = pig.y * LOGICAL_H;
            const inFov =
              px >= fovPx.x &&
              px <= fovPx.x + fovPx.w &&
              py >= fovPx.y &&
              py <= fovPx.y + fovPx.h;
            return (
              <g
                key={pig.id}
                className={`arena-pig arena-pig-${pig.state.toLowerCase()}`}
                data-pig-id={pig.id}
                data-x={Math.round(px)}
                data-y={Math.round(py)}
                onPointerDown={() => onPointerDown(pig.id)}
                onPointerMove={(e) => onPointerMove(pig, e.clientX, e.clientY, e.currentTarget.ownerSVGElement)}
                onPointerUp={onPointerUp}
                style={{ cursor: 'grab', touchAction: 'none' }}
              >
                <circle
                  cx={px}
                  cy={py}
                  r={inFov ? 22 : 18}
                  fill={pigColor(pig.temp)}
                  stroke={STATE_COLORS[pig.state]}
                  strokeWidth={inFov ? 5 : 3}
                />
                <text x={px} y={py + 4} textAnchor="middle" className="arena-pig-id">
                  {pig.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}