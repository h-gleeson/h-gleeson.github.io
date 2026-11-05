import { useState } from 'react';
import { Vector3 } from 'three';
import { actions } from '../app/actions';
import { basis, shearOf, toPlane } from '../engine/camera';
import { CAMERA_PRESETS, DEFAULT_CAMERA } from '../state/defaults';
import { useStore } from '../state/store';
import type { CameraState } from '../state/types';
import { Icon } from './controls';

const FACES: { n: [number, number, number]; v: number[]; tone: string }[] = [
  { n: [0, 1, 0], v: [2, 3, 7, 6], tone: 'var(--glyph-top)' },
  { n: [1, 0, 0], v: [1, 3, 7, 5], tone: 'var(--glyph-side)' },
  { n: [-1, 0, 0], v: [0, 2, 6, 4], tone: 'var(--glyph-side)' },
  { n: [0, 0, 1], v: [4, 5, 7, 6], tone: 'var(--glyph-front)' },
  { n: [0, 0, -1], v: [0, 1, 3, 2], tone: 'var(--glyph-front)' },
  { n: [0, -1, 0], v: [0, 1, 5, 4], tone: 'var(--glyph-side)' },
];

/** A unit cube drawn in the given projection — each preset previews itself. */
export function ProjectionGlyph({ camera, size = 34 }: { camera: Pick<CameraState, 'azimuth' | 'elevation' | 'oblique'>; size?: number }) {
  const c: CameraState = { ...DEFAULT_CAMERA, ...camera, projection: 'ortho', target: [0, 0, 0] };
  const pts: Vector3[] = [];
  for (let i = 0; i < 8; i++) pts.push(new Vector3(i & 1 ? 0.5 : -0.5, i & 2 ? 0.35 : -0.35, i & 4 ? 0.5 : -0.5));
  const p2 = toPlane(c, pts);
  const ext = Math.max(...p2.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) || 1;
  const s = (size / 2 - 3) / ext;
  const xy = (i: number) => `${(size / 2 + p2[i].x * s).toFixed(2)},${(size / 2 - p2[i].y * s).toFixed(2)}`;
  const { right, up, back } = basis(c);
  const [sx, sy] = shearOf(c);
  const view = new Vector3().addScaledVector(right, sx).addScaledVector(up, sy).add(back).normalize();
  const visible = FACES.filter((f) => new Vector3(...f.n).dot(view) > 1e-3);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="glyph">
      {visible.map((f, i) => (
        <polygon key={i} points={f.v.map(xy).join(' ')} fill={f.tone} stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function ViewStrip() {
  const camera = useStore((s) => s.doc.camera);
  const views = useStore((s) => s.doc.views);
  const showGrid = useStore((s) => s.doc.drawing.showGrid);
  const hasSel = useStore((s) => s.ui.selection.length > 0);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="viewstrip">
      <div className="vs-group" aria-label="Projection presets">
        <span className="vs-label">Projections</span>
        <div className="vs-presets">
          {CAMERA_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`vs-preset ${camera.preset === p.id ? 'on' : ''}`}
              disabled={camera.locked}
              title={`${p.label} — ${p.hint}${p.key ? `  (${p.key})` : ''}`}
              onClick={() => actions.applyPreset(p.id)}
            >
              <ProjectionGlyph camera={p.camera} />
              <span>{p.short}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="vs-group grow" aria-label="Saved views">
        <span className="vs-label">Saved views</span>
        <div className="vs-views">
          {views.map((v, i) => (
            <div key={v.id} className="vs-view" title={`${v.name} — click to restore · double-click to rename`}>
              <button className="vs-thumb" onClick={() => actions.applyView(v.id)} onDoubleClick={() => setRenaming(v.id)}>
                {v.thumb ? <img src={v.thumb} alt="" /> : <ProjectionGlyph camera={v.camera} size={40} />}
                <span className="vs-proj">{v.camera.projection === 'persp' ? 'PERSP' : v.camera.oblique.enabled ? 'OBLIQUE' : 'PARALLEL'}</span>
              </button>
              {renaming === v.id ? (
                <input
                  className="vs-name-input"
                  autoFocus
                  defaultValue={v.name}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onBlur={(e) => {
                    actions.renameView(v.id, e.target.value);
                    setRenaming(null);
                  }}
                />
              ) : (
                <span className="vs-name">{v.name}</span>
              )}
              <div className="vs-actions">
                <button title="Update to the current camera" onClick={() => actions.updateView(v.id)}>↻</button>
                <button title="Rename" onClick={() => setRenaming(v.id)}>✎</button>
                <button title="Move left" disabled={i === 0} onClick={() => actions.moveView(v.id, -1)}>‹</button>
                <button title="Move right" disabled={i === views.length - 1} onClick={() => actions.moveView(v.id, 1)}>›</button>
                <button title="Delete view" onClick={() => actions.deleteView(v.id)}>×</button>
              </div>
            </div>
          ))}
          <button className="vs-add" onClick={() => actions.saveView()} title="Save the current camera as a named view (Shift+V)">
            {Icon.plus}
            <span>Save view</span>
          </button>
        </div>
      </div>

      <div className="vs-group tools" aria-label="View tools">
        <div className="vs-proj-toggle segmented">
          <button className={camera.projection === 'ortho' ? 'on' : ''} onClick={() => camera.projection !== 'ortho' && actions.toggleProjection()} title="Parallel projection (O)">
            Parallel
          </button>
          <button className={camera.projection === 'persp' ? 'on' : ''} onClick={() => camera.projection !== 'persp' && actions.toggleProjection()} title="Perspective (O)">
            Persp.
          </button>
        </div>
        <div className="vs-iconrow">
          <button className={`icon-btn ${camera.locked ? 'on' : ''}`} onClick={actions.toggleViewLock} title="Lock view orientation (Shift+L)">
            {Icon.lock(camera.locked)}
          </button>
          <button className="icon-btn" onClick={actions.fitAll} title="Fit all (F)">
            {Icon.fit}
          </button>
          <button className="icon-btn" disabled={!hasSel} onClick={actions.fitSelection} title="Fit selection (Shift+F)">
            {Icon.target}
          </button>
          <button className={`icon-btn ${showGrid ? 'on' : ''}`} onClick={() => actions.setDrawing('showGrid', !showGrid)} title="Ground grid (G)">
            {Icon.grid}
          </button>
        </div>
        <span className="vs-readout" title="Azimuth · elevation">
          {camera.azimuth.toFixed(1)}° · {camera.elevation.toFixed(1)}°
        </span>
      </div>
    </div>
  );
}
