import { useEffect, useReducer, useRef } from 'react';
import { Vector3 } from 'three';
import { sectionActions as sec } from '../app/sectionActions';
import { basis } from '../engine/camera';
import { getEngine } from '../engine/engineRef';
import { sectionNormal } from '../state/section';
import { store, useStore } from '../state/store';

const ARROW = 64;

/** The section plane's outline and a handle to drag the cut along its normal. */
export function SectionGizmo({ engineReady }: { engineReady: boolean }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const s = useStore((st) => st.doc.section);
  const show = useStore((st) => st.ui.sectionHandle);
  const camera = useStore((st) => st.doc.camera);
  const drag = useRef<{ x: number; y: number; offset: number; dir: { x: number; y: number }; pxPerWorld: number } | null>(null);

  useEffect(() => {
    const e = getEngine();
    if (!engineReady || !e) return;
    return e.onAfterRender(redraw);
  }, [engineReady]);

  const engine = getEngine();
  if (!engine || !s.enabled || !show) return null;
  const box = engine.sceneBounds();
  if (box.isEmpty()) return null;
  const n = sectionNormal(s);
  // Plane rectangle: the model's bounds, projected onto the plane.
  const helper = Math.abs(n.y) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(helper, n).normalize();
  const v = new Vector3().crossVectors(n, u).normalize();
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    u0 = Math.min(u0, c.dot(u)); u1 = Math.max(u1, c.dot(u));
    v0 = Math.min(v0, c.dot(v)); v1 = Math.max(v1, c.dot(v));
  }
  const pad = Math.max(u1 - u0, v1 - v0) * 0.04;
  const at = (a: number, b: number) => u.clone().multiplyScalar(a).addScaledVector(v, b).addScaledVector(n, s.offset);
  const corners = [at(u0 - pad, v0 - pad), at(u1 + pad, v0 - pad), at(u1 + pad, v1 + pad), at(u0 - pad, v1 + pad)].map((p) => engine.project(p));
  const centre = at((u0 + u1) / 2, (v0 + v1) / 2);
  const o = engine.project(centre);
  const L = camera.height * 0.1;
  const tip = engine.project(centre.clone().addScaledVector(n, L));
  let dx = tip.x - o.x, dy = tip.y - o.y;
  let len = Math.hypot(dx, dy);
  // Looking straight at the plane: the normal points at you, so drag vertically instead.
  const headOn = len < 10;
  let pxPerWorld = len / L;
  if (headOn) {
    const toward = n.dot(basis(camera).back) >= 0 ? 1 : -1;
    dx = 0;
    dy = -toward;
    len = 1;
    pxPerWorld = 1 / engine.worldPerPixel(camera);
  }
  const dir = { x: dx / len, y: dy / len };

  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    store.commit();
    drag.current = { x: e.clientX, y: e.clientY, offset: s.offset, dir, pxPerWorld };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const along = (e.clientX - d.x) * d.dir.x + (e.clientY - d.y) * d.dir.y;
    sec.setOffset(d.offset + (along / d.pxPerWorld) * (e.shiftKey ? 0.1 : 1));
  };
  const up = (e: React.PointerEvent) => {
    if (!drag.current) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    store.commit();
  };

  const x2 = o.x + dir.x * ARROW, y2 = o.y + dir.y * ARROW;
  const nx = -dir.y * 6, ny = dir.x * 6;
  return (
    <svg className="gizmo section-gizmo" width={engine.cssW} height={engine.cssH}>
      {!headOn && <polygon className="section-plane" points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />}
      <g className="section-handle" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        <title>Drag to move the cut · Shift for fine</title>
        {headOn ? (
          <>
            <line className="hit" x1={o.x} y1={o.y - ARROW / 2} x2={o.x} y2={o.y + ARROW / 2} />
            <line x1={o.x} y1={o.y - ARROW / 2 + 8} x2={o.x} y2={o.y + ARROW / 2 - 8} />
            <polygon points={`${o.x},${o.y - ARROW / 2} ${o.x - 6},${o.y - ARROW / 2 + 10} ${o.x + 6},${o.y - ARROW / 2 + 10}`} />
            <polygon points={`${o.x},${o.y + ARROW / 2} ${o.x - 6},${o.y + ARROW / 2 - 10} ${o.x + 6},${o.y + ARROW / 2 - 10}`} />
          </>
        ) : (
          <>
            <line className="hit" x1={o.x} y1={o.y} x2={x2} y2={y2} />
            <line x1={o.x} y1={o.y} x2={x2 - dir.x * 10} y2={y2 - dir.y * 10} />
            <polygon points={`${x2},${y2} ${x2 - dir.x * 13 + nx},${y2 - dir.y * 13 + ny} ${x2 - dir.x * 13 - nx},${y2 - dir.y * 13 - ny}`} />
          </>
        )}
        <circle cx={o.x} cy={o.y} r={4} />
      </g>
      <text className="section-readout" x={o.x + 10} y={o.y + (headOn ? 0 : 16)}>
        {s.orient === 'plan' && !s.flip ? 'Cut height ' : 'Cut '}
        {Number(s.offset.toPrecision(4))}
      </text>
    </svg>
  );
}
