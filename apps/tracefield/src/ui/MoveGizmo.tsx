import { useEffect, useReducer, useRef } from 'react';
import { Box3, Vector3 } from 'three';
import { explodeActions } from '../app/explodeActions';
import { basis } from '../engine/camera';
import { getEngine } from '../engine/engineRef';
import { anchorPoint, assembledBox, effectiveAnchors, explodedBox, inheritedOffset } from '../state/explode';
import { isLockedInTree, topmost } from '../state/scene';
import { store, useStore } from '../state/store';
import type { Vec3 } from '../state/types';

const AXES: { key: 'x' | 'y' | 'z'; v: Vector3; cls: string }[] = [
  { key: 'x', v: new Vector3(1, 0, 0), cls: 'ax-x' },
  { key: 'y', v: new Vector3(0, 1, 0), cls: 'ax-y' },
  { key: 'z', v: new Vector3(0, 0, 1), cls: 'ax-z' },
];
const ARROW = 72; // px

type Drag =
  | { kind: 'axis'; axis: Vector3; dir: { x: number; y: number }; pxPerWorld: number; x: number; y: number; key: string }
  | { kind: 'plane'; x: number; y: number; key: string }
  | { kind: 'anchor'; id: string; index: number; u: Vec3; size: Vector3; x0: number; y0: number; key: string };

/**
 * Move tool overlay: axis arrows and a view-plane handle on the selection, plus
 * draggable connector anchors. Moves write explode offsets; the assembled
 * model is untouched.
 */
export function MoveGizmo({ engineReady }: { engineReady: boolean }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const tool = useStore((s) => s.ui.tool);
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.ui.selection);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const e = getEngine();
    if (!engineReady || !e) return;
    return e.onAfterRender(redraw);
  }, [engineReady]);

  const engine = getEngine();
  if (!engine || tool !== 'move') return null;
  const targets = topmost(doc, selection.filter((id) => doc.nodes[id])).filter((id) => !isLockedInTree(doc, id));
  const box = new Box3();
  targets.forEach((id) => box.union(explodedBox(doc, id)));
  if (!targets.length || box.isEmpty()) return null;

  const c = box.getCenter(new Vector3());
  const o = engine.project(c);
  if (o.behind) return null;
  const L = doc.camera.height * 0.1;
  const arrows = AXES.map((a) => {
    const p = engine.project(c.clone().addScaledVector(a.v, L));
    const dx = p.x - o.x, dy = p.y - o.y;
    const len = Math.hypot(dx, dy);
    return { ...a, len, dir: { x: dx / (len || 1), y: dy / (len || 1) }, pxPerWorld: len / L };
  });
  const maxLen = Math.max(...arrows.map((a) => a.len), 1e-6);

  // Anchors of the selected parts that have been moved.
  const anchors: { id: string; index: number; u: Vec3; x: number; y: number; size: Vector3 }[] = [];
  if (doc.explode.connectors && doc.explode.amount > 0) {
    for (const id of targets) {
      const own = doc.explode.offsets[id];
      if (!own || (!own[0] && !own[1] && !own[2])) continue;
      const ab = assembledBox(doc, id);
      if (ab.isEmpty()) continue;
      const shift = inheritedOffset(doc, id).add(new Vector3(...own)).multiplyScalar(doc.explode.amount);
      effectiveAnchors(doc, id).forEach((u, index) => {
        const p = engine.project(anchorPoint(ab, u).add(shift));
        if (!p.behind) anchors.push({ id, index, u, x: p.x, y: p.y, size: ab.getSize(new Vector3()) });
      });
    }
  }

  const start = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    store.commit();
    drag.current = d;
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const fine = e.shiftKey ? 0.1 : 1;
    const cam = store.get().doc.camera;
    if (d.kind === 'axis') {
      const along = ((e.clientX - d.x) * d.dir.x + (e.clientY - d.y) * d.dir.y) * fine;
      d.x = e.clientX;
      d.y = e.clientY;
      const w = along / d.pxPerWorld;
      explodeActions.moveBy(targets, [d.axis.x * w, d.axis.y * w, d.axis.z * w], d.key);
    } else if (d.kind === 'plane') {
      const wpp = engine.worldPerPixel(cam) * fine;
      const { right, up } = basis(cam);
      const t = new Vector3().addScaledVector(right, (e.clientX - d.x) * wpp).addScaledVector(up, -(e.clientY - d.y) * wpp);
      d.x = e.clientX;
      d.y = e.clientY;
      explodeActions.moveBy(targets, [t.x, t.y, t.z], d.key);
    } else {
      const wpp = engine.worldPerPixel(cam) * fine;
      const { right, up } = basis(cam);
      const t = new Vector3().addScaledVector(right, (e.clientX - d.x0) * wpp).addScaledVector(up, -(e.clientY - d.y0) * wpp);
      const k = (v: number, s: number) => (s > 1e-9 ? v / s : 0);
      explodeActions.setAnchor(d.id, d.index, [d.u[0] + k(t.x, d.size.x), d.u[1] + k(t.y, d.size.y), d.u[2] + k(t.z, d.size.z)]);
    }
  };
  const end = (e: React.PointerEvent) => {
    if (!drag.current) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    store.commit();
  };
  const key = () => `gizmo-${performance.now()}`;

  // Anchors draw last so the centre anchor stays grabbable over the move handle.
  return (
    <svg className="gizmo" width={engine.cssW} height={engine.cssH}>
      <g transform={`translate(${o.x} ${o.y})`}>
        {arrows
          .filter((a) => a.len > maxLen * 0.12)
          .map((a) => {
            const x = a.dir.x * ARROW, y = a.dir.y * ARROW;
            const nx = -a.dir.y * 5, ny = a.dir.x * 5;
            return (
              <g
                key={a.key}
                className={`gizmo-axis ${a.cls}`}
                onPointerDown={(e) => start(e, { kind: 'axis', axis: a.v, dir: a.dir, pxPerWorld: a.pxPerWorld, x: e.clientX, y: e.clientY, key: key() })}
                onPointerMove={move}
                onPointerUp={end}
              >
                <title>{`Move along ${a.key.toUpperCase()} · Shift for fine`}</title>
                <line className="hit" x1={0} y1={0} x2={x} y2={y} />
                <line x1={a.dir.x * 12} y1={a.dir.y * 12} x2={x - a.dir.x * 9} y2={y - a.dir.y * 9} />
                <polygon points={`${x},${y} ${x - a.dir.x * 12 + nx},${y - a.dir.y * 12 + ny} ${x - a.dir.x * 12 - nx},${y - a.dir.y * 12 - ny}`} />
                <text x={x + a.dir.x * 10} y={y + a.dir.y * 10 + 3}>
                  {a.key.toUpperCase()}
                </text>
              </g>
            );
          })}
        <circle className="gizmo-pivot" r={2.5} />
        <rect
          className="gizmo-plane"
          x={10}
          y={-24}
          width={14}
          height={14}
          onPointerDown={(e) => start(e, { kind: 'plane', x: e.clientX, y: e.clientY, key: key() })}
          onPointerMove={move}
          onPointerUp={end}
        >
          <title>Move in the view plane · Shift for fine</title>
        </rect>
      </g>
      {anchors.map((a) => (
        <circle
          key={`${a.id}-${a.index}`}
          className="gizmo-anchor"
          cx={a.x}
          cy={a.y}
          r={5}
          onPointerDown={(e) => start(e, { kind: 'anchor', id: a.id, index: a.index, u: a.u, size: a.size, x0: e.clientX, y0: e.clientY, key: key() })}
          onPointerMove={move}
          onPointerUp={end}
        >
          <title>Connector anchor — drag to move it on the part</title>
        </circle>
      ))}
    </svg>
  );
}
