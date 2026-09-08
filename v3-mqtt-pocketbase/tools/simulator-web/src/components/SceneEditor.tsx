import { useState } from 'react';
import type { PigActorState } from '../engines/environment';
import type { SensorNodeState } from '../engines/sensorFarm';

export interface SceneEditorProps {
  pigs: PigActorState[];
  nodes: SensorNodeState[];
  onAddPig: () => void;
  onRemovePig: (pigId: string) => void;
  onMovePig: (pigId: string, x: number, y: number) => void;
  onAddNode: () => void;
  onRemoveNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onSetPowered: (nodeId: string, powered: boolean) => void;
  onSetCoverage: (nodeId: string, radius: number) => void;
  accessible?: boolean;
}

const CLAMP = (v: number) => Math.round(Math.min(0.94, Math.max(0.06, v)) * 1000) / 1000;
const NUM = 1; // pen units per 100% width (0..1)

/**
 * Interactive scene: click the pen to place the selected actor (pig or node),
 * or edit exact coordinates via number inputs. Coverage circles render live so
 * "does the node reach this pig?" is answerable at a glance.
 */
export function SceneEditor({
  pigs,
  nodes,
  onAddPig,
  onRemovePig,
  onMovePig,
  onAddNode,
  onRemoveNode,
  onMoveNode,
  onSetPowered,
  onSetCoverage
}: SceneEditorProps) {
  const [selected, setSelected] = useState<string>('node-esp32-001');

  const placeSelected = (x: number, y: number) => {
    if (selected.startsWith('node-')) {
      onMoveNode(selected.slice(5), x, y);
    } else if (selected.startsWith('pig-')) {
      onMovePig(selected, x, y);
    }
  };

  return (
    <div
      className="scene-editor"
      data-testid="scene-editor"
      role="group"
      aria-label="Scene editor: place pigs and sensor nodes"
    >
      <div className="scene-toolbar">
        <button
          type="button"
          className="btn"
          data-testid="scene-add-pig"
          onClick={() => {
            onAddPig();
            setSelected(`pig-pig-00${pigs.length + 1}`);
          }}
        >
          + Pig
        </button>
        <button
          type="button"
          className="btn"
          data-testid="scene-add-node"
          onClick={() => {
            onAddNode();
            setSelected(`node-esp32-00${nodes.length + 1}`);
          }}
        >
          + Node
        </button>
        <span className="scene-hint">Click the pen to place the selected actor</span>
      </div>

      <div
        className="scene-pen"
        data-testid="scene-pen"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          placeSelected(CLAMP((e.clientX - rect.left) / rect.width), CLAMP((e.clientY - rect.top) / rect.height));
        }}
      >
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`scene-coverage ${n.powered ? '' : 'is-off'}`}
            style={{
              left: `${n.x * 100}%`,
              top: `${n.y * 100}%`,
              width: `${n.coverageRadius * 2 * 100}%`,
              height: `${n.coverageRadius * 2 * 100}%`
            }}
          />
        ))}
        {pigs.map((p) => (
          <div
            key={p.id}
            className={`scene-actor scene-pig ${selected === p.id ? 'is-selected' : ''} health-${p.health.toLowerCase()}`}
            data-testid={`scene-pig-${p.id}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            title={`${p.name ?? p.id} (${p.health})`}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(p.id);
            }}
          />
        ))}
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`scene-actor scene-node ${selected === `node-${n.id}` ? 'is-selected' : ''} ${n.online ? '' : 'is-off'}`}
            data-testid={`scene-node-${n.id}`}
            style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
            title={`${n.id} · RSSI ${n.rssiDbm} dBm · ${n.online ? 'online' : 'offline'}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(`node-${n.id}`);
            }}
          />
        ))}
      </div>

      <div className="scene-inspector">
        {pigs.map((p) => (
          <details key={p.id} className="scene-item" open={selected === p.id}>
            <summary
              data-testid={`scene-pig-summary-${p.id}`}
              onClick={() => setSelected(p.id)}
            >
              <b>{p.name ?? p.id}</b> {p.health} · {p.coreTemp.toFixed(1)}°C
            </summary>
            <div className="scene-item-controls">
              <label>
                x
                <input
                  type="number"
                  data-testid={`scene-pig-x-${p.id}`}
                  min={0.06}
                  max={0.94}
                  step={0.01}
                  value={p.x}
                  onChange={(e) => onMovePig(p.id, CLAMP(Number(e.target.value)), p.y)}
                />
              </label>
              <label>
                y
                <input
                  type="number"
                  data-testid={`scene-pig-y-${p.id}`}
                  min={0.06}
                  max={0.94}
                  step={0.01}
                  value={p.y}
                  onChange={(e) => onMovePig(p.id, p.x, CLAMP(Number(e.target.value)))}
                />
              </label>
              <button type="button" className="btn btn-danger" data-testid={`scene-pig-remove-${p.id}`} onClick={() => onRemovePig(p.id)}>
                Remove
              </button>
            </div>
          </details>
        ))}

        {nodes.map((n) => (
          <details
            key={n.id}
            className="scene-item"
            open={selected === `node-${n.id}`}
            data-testid={`scene-node-details-${n.id}`}
          >
            <summary onClick={() => setSelected(`node-${n.id}`)}>
              <b>{n.id}</b> → {n.watchedPigId ?? 'no pig in range'} · RSSI {n.rssiDbm} dBm ·{' '}
              {n.online ? 'online' : 'offline'}
            </summary>
            <div className="scene-item-controls">
              <label>
                x
                <input
                  type="number"
                  data-testid={`scene-node-x-${n.id}`}
                  min={0.06}
                  max={0.94}
                  step={0.01}
                  value={n.x}
                  onChange={(e) => onMoveNode(n.id, CLAMP(Number(e.target.value)), n.y)}
                />
              </label>
              <label>
                y
                <input
                  type="number"
                  data-testid={`scene-node-y-${n.id}`}
                  min={0.06}
                  max={0.94}
                  step={0.01}
                  value={n.y}
                  onChange={(e) => onMoveNode(n.id, n.x, CLAMP(Number(e.target.value)))}
                />
              </label>
              <label>
                range
                <input
                  type="number"
                  data-testid={`scene-node-coverage-${n.id}`}
                  min={0.05}
                  max={0.6}
                  step={0.05}
                  value={Math.round(n.coverageRadius * 100) / 100}
                  onChange={(e) => onSetCoverage(n.id, CLAMP(Math.max(0.05, Number(e.target.value))))}
                />
              </label>
              <button
                type="button"
                className="btn"
                data-testid={`scene-node-power-${n.id}`}
                onClick={() => onSetPowered(n.id, !n.powered)}
              >
                {n.powered ? 'Power off' : 'Power on'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                data-testid={`scene-node-remove-${n.id}`}
                onClick={() => onRemoveNode(n.id)}
              >
                Remove
              </button>
            </div>
          </details>
        ))}
      </div>
      <span className="sr-only">Pen is {NUM}×{NUM} units; 0.06–0.94 playfield.</span>
    </div>
  );
}

export default SceneEditor;