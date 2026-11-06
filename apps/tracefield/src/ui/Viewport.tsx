import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { basis, shearOf } from '../engine/camera';
import { attachControls } from '../engine/controls';
import { Engine } from '../engine/Engine';
import { setEngine } from '../engine/engineRef';
import { importFiles, importModel } from '../import/importFiles';
import { registry } from '../import/registry';
import { buildSampleGlb } from '../import/sample';
import { restoreAutosave } from '../project/autosave';
import { store, useStore } from '../state/store';
import { FrameOverlay } from './FrameOverlay';
import { MoveGizmo } from './MoveGizmo';
import { AnnotationOverlay } from './AnnotationOverlay';
import { SectionGizmo } from './SectionGizmo';
import { MatchBar } from './MatchBar';
import type { CameraState } from '../state/types';

async function loadSample() {
  store.setUI({ busy: { label: 'Building sample studio' } });
  try {
    const data = await buildSampleGlb();
    await importModel([{ name: 'sample-studio.glb', data }], 'glb');
  } catch (e) {
    store.status(`Sample failed: ${(e as Error).message}`, 'error');
  } finally {
    store.setUI({ busy: null });
  }
}

export function Viewport({ onImport }: { onImport: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [ready, setReady] = useState(false);
  const empty = useStore((s) => s.doc.roots.length === 0);
  const busy = useStore((s) => s.ui.busy);
  const restore = useStore((s) => s.ui.restoreAvailable);
  const isolated = useStore((s) => s.ui.isolated);
  const camera = useStore((s) => s.doc.camera);
  const bg = useStore((s) => s.doc.drawing.background);
  const matching = useStore((s) => s.ui.tool === 'match');
  const [edgeProgress, setEdgeProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const engine = new Engine(host.current!);
    setEngine(engine);
    setReady(true);
    const detach = attachControls(engine);
    (window as unknown as { tracefield: unknown }).tracefield = { engine, store };
    return () => {
      detach();
      engine.dispose();
      setEngine(null);
    };
  }, []);

  useEffect(
    () =>
      registry.onChange(() => {
        const j = registry.edgeJobs;
        setEdgeProgress(j.done < j.total ? { ...j } : null);
      }),
    [],
  );

  return (
    <div
      className={`viewport${matching ? ' matching' : ''}`}
      style={{ background: bg }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div ref={host} className="viewport-host" />
      <FrameOverlay engineReady={ready} />
      <SectionGizmo engineReady={ready} />
      <AnnotationOverlay engineReady={ready} />
      <MoveGizmo engineReady={ready} />
      <MatchBar />

      {!empty && <Triad camera={camera} />}
      {!empty && (
        <div className="viewport-label">
          {camera.projection === 'persp' ? 'Perspective' : camera.oblique.enabled ? 'Oblique' : 'Parallel'}
          {camera.locked ? ' · locked' : ''}
        </div>
      )}

      {isolated && (
        <div className="banner">
          Isolated view · <button onClick={() => store.setUI({ isolated: null })}>Exit (I)</button>
        </div>
      )}

      {empty && !busy && (
        <div className="empty">
          <div className="empty-mark">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
              <path d="M32 6 56 19v26L32 58 8 45V19z M8 19l24 13 24-13 M32 32v26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 19 32 6l24 13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
            </svg>
          </div>
          <h1>Turn a model into a drawing</h1>
          <p>Drop a GLB, glTF, OBJ, STL or FBX here — or a .tracefield project. The file’s node hierarchy is kept intact.</p>
          <div className="btn-row center">
            <button className="btn primary" onClick={onImport}>
              Import model…
            </button>
            <button className="btn" onClick={loadSample}>
              Load sample studio
            </button>
            {restore && (
              <button className="btn accent-outline" onClick={restoreAutosave}>
                Restore last session
              </button>
            )}
          </div>
        </div>
      )}

      {drag && <div className="drop">Drop to import</div>}

      {(busy || edgeProgress) && (
        <div className="busy" role="status" aria-live="polite">
          <span className="spinner" />
          <span>{busy ? busy.label : `Tracing linework · ${edgeProgress!.done} / ${edgeProgress!.total}`}</span>
          {busy?.cancel && (
            <button className="busy-cancel" onClick={busy.cancel}>
              Cancel
            </button>
          )}
          {(busy?.progress !== undefined || (!busy && edgeProgress)) && (
            <span className="progress">
              <span style={{ width: `${Math.round((busy?.progress ?? edgeProgress!.done / Math.max(1, edgeProgress!.total)) * 100)}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Orientation triad: world X/Y/Z as they appear in the current projection. */
function Triad({ camera }: { camera: CameraState }) {
  const { right, up, back } = basis(camera);
  const [sx, sy] = shearOf(camera);
  const axes = [
    { label: 'X', v: new Vector3(1, 0, 0), cls: 'ax-x' },
    { label: 'Y', v: new Vector3(0, 1, 0), cls: 'ax-y' },
    { label: 'Z', v: new Vector3(0, 0, 1), cls: 'ax-z' },
  ].map((a) => ({ ...a, x: a.v.dot(right) - sx * a.v.dot(back), y: a.v.dot(up) - sy * a.v.dot(back), z: a.v.dot(back) }));
  const max = Math.max(1, ...axes.map((a) => Math.hypot(a.x, a.y)));
  const R = 22;
  return (
    <svg className="triad" width="64" height="64" viewBox="-32 -32 64 64" aria-label="Orientation">
      <circle r="29" className="triad-ring" />
      {axes
        .sort((a, b) => a.z - b.z)
        .map((a) => {
          const x = (a.x / max) * R, y = (-a.y / max) * R;
          const short = Math.hypot(x, y) < 3;
          return (
            <g key={a.label} className={a.cls}>
              <line x1="0" y1="0" x2={x} y2={y} />
              {!short && (
                <text x={x * 1.22} y={y * 1.22 + 3}>
                  {a.label}
                </text>
              )}
              {short && <circle r="3" />}
            </g>
          );
        })}
    </svg>
  );
}
