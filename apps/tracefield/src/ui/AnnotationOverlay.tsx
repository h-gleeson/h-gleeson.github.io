import { useEffect, useReducer, useRef, useState } from 'react';
import type { Vector3 } from 'three';
import { annotateActions as an } from '../app/annotateActions';
import type { Pt, Prim } from '../annotate/layout';
import { getEngine } from '../engine/engineRef';
import { ancestors } from '../state/scene';
import { store, useStore } from '../state/store';

type Drag =
  | { kind: 'label'; id: string; x: number; y: number; pos: [number, number]; key: string }
  | { kind: 'anchor'; id: string; key: string }
  | { kind: 'key'; x: number; y: number; pos: [number, number]; key: string };

/**
 * Labels in the viewport: the shared annotation layout drawn as SVG over the
 * drawing frame, with direct manipulation (drag text, drag anchors, edit text).
 */
export function AnnotationOverlay({ engineReady }: { engineReady: boolean }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const doc = useStore((s) => s.doc);
  const selected = useStore((s) => s.ui.label);
  const drag = useRef<Drag | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const e = getEngine();
    if (!engineReady || !e) return;
    return e.onAfterRender(redraw);
  }, [engineReady]);

  const engine = getEngine();
  if (!engine || !doc.annotations.items.length || !doc.annotations.settings.show) return null;
  const f = engine.frame;
  const project = (v: Vector3): Pt | null => {
    const q = engine.project(v);
    return q.behind ? null : [q.x - f.x, q.y - f.y];
  };
  const { prims, positions } = engine.layoutLabels(project, f.w, f.h);

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
    if (d.kind === 'label') {
      const pos: [number, number] = [d.pos[0] + (e.clientX - d.x) / f.w, d.pos[1] + (e.clientY - d.y) / f.h];
      an.update(d.id, { pos }, d.key);
    } else if (d.kind === 'key') {
      an.set('keyPos', [d.pos[0] + (e.clientX - d.x) / f.w, d.pos[1] + (e.clientY - d.y) / f.h]);
    } else {
      // Re-anchor onto whatever surface is under the cursor (it may be another object).
      const hit = engine.pickPoint(e.clientX, e.clientY);
      if (!hit) return;
      const { doc: cur } = store.get();
      const a = cur.annotations.items.find((x) => x.id === d.id);
      if (!a) return;
      // Dropping on the labelled object (or any part inside it) keeps the label on that object;
      // dropping on something else moves the label to it.
      const node = hit.id === a.node || ancestors(cur, hit.id).includes(a.node) ? a.node : hit.id;
      const local = engine.toNodeLocal(node, hit.point);
      if (local) an.update(d.id, { node, anchor: local }, d.key);
    }
  };
  const end = (e: React.PointerEvent) => {
    if (!drag.current) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    store.commit();
  };
  const key = () => `label-${performance.now()}`;

  const onLabelDown = (e: React.PointerEvent, id: string) => {
    an.select(id);
    const s = store.get().doc.annotations.settings;
    // In key mode the numbered tag sits on the anchor: dragging it re-anchors.
    if (s.mode === 'key') return start(e, { kind: 'anchor', id, key: key() });
    // Dragging out of a column layout freezes it into free positions first.
    if (s.layout !== 'free') an.bake(positions);
    const a = store.get().doc.annotations.items.find((x) => x.id === id);
    if (a) start(e, { kind: 'label', id, x: e.clientX, y: e.clientY, pos: positions[id] ?? a.pos, key: key() });
  };

  const sel = selected ? prims.find((p) => p.t === 'text' && p.label === selected && p.role === 'label') : undefined;
  const editPrim = editing ? (prims.find((p) => p.t === 'text' && p.label === editing && p.role === (doc.annotations.settings.mode === 'key' ? 'key' : 'label')) as Extract<Prim, { t: 'text' }> | undefined) : undefined;
  const editAnn = editing ? doc.annotations.items.find((a) => a.id === editing) : undefined;

  return (
    <>
      <svg className="labels" style={{ left: f.x, top: f.y }} width={f.w} height={f.h}>
        {prims.map((p, i) => render(p, i, selected))}
        {sel && sel.t === 'text' && <rect className="label-sel" x={sel.box.x - 3} y={sel.box.y - 2} width={sel.box.w + 6} height={sel.box.h + 4} />}
        {/* Hit targets on top of the drawing */}
        {prims.map((p, i) => {
          if (p.t === 'text' && p.role === 'label' && p.label)
            return (
              <rect
                key={`h${i}`}
                className="label-hit"
                x={p.box.x - 3}
                y={p.box.y - 2}
                width={p.box.w + 6}
                height={p.box.h + 4}
                onPointerDown={(e) => onLabelDown(e, p.label!)}
                onPointerMove={move}
                onPointerUp={end}
                onDoubleClick={() => doc.annotations.settings.mode === 'leaders' && setEditing(p.label!)}
              >
                <title>Drag to place · double-click to edit text · Del to remove</title>
              </rect>
            );
          if (p.t === 'text' && p.role === 'key')
            return (
              <rect
                key={`h${i}`}
                className="label-hit key"
                x={p.box.x}
                y={p.box.y}
                width={p.box.w}
                height={p.box.h}
                onPointerDown={(e) => {
                  if (p.label) an.select(p.label);
                  start(e, { kind: 'key', x: e.clientX, y: e.clientY, pos: store.get().doc.annotations.settings.keyPos, key: key() });
                }}
                onPointerMove={move}
                onPointerUp={end}
                onDoubleClick={() => p.label && setEditing(p.label)}
              >
                <title>Drag to move the legend · double-click a name to edit it</title>
              </rect>
            );
          if (p.t === 'circle' && p.role === 'anchor' && p.label && (p.label === selected || doc.annotations.settings.mode === 'key'))
            return (
              <circle
                key={`h${i}`}
                className={`anchor-hit${p.label === selected ? ' on' : ''}`}
                cx={p.x}
                cy={p.y}
                r={Math.max(6, p.r + 2)}
                onPointerDown={(e) => {
                  an.select(p.label!);
                  start(e, { kind: 'anchor', id: p.label!, key: key() });
                }}
                onPointerMove={move}
                onPointerUp={end}
              >
                <title>Drag onto any surface to re-anchor</title>
              </circle>
            );
          return null;
        })}
      </svg>
      {editPrim && editAnn && (
        <input
          className="label-edit"
          autoFocus
          style={{ left: f.x + editPrim.box.x - 4, top: f.y + editPrim.box.y - 3, minWidth: Math.max(120, editPrim.box.w + 24), font: editPrim.font }}
          defaultValue={editAnn.text ?? doc.nodes[editAnn.node]?.name ?? ''}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(null);
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            const name = doc.nodes[editAnn.node]?.name;
            an.update(editAnn.id, { text: !v || v === name ? null : v });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function render(p: Prim, i: number, selected: string | null) {
  const hot = p.label && p.label === selected ? ' hot' : '';
  if (p.t === 'line')
    return <polyline key={i} className={`label-line${hot}`} points={p.pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={p.color} strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" />;
  if (p.t === 'circle') return p.fill || p.stroke ? <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.fill ?? 'none'} stroke={p.stroke ?? 'none'} strokeWidth={p.w} /> : null;
  if (p.t === 'poly') return <polygon key={i} points={p.pts.map((q) => q.join(',')).join(' ')} fill={p.fill} />;
  return (
    <text
      key={i}
      x={p.x}
      y={p.y}
      textAnchor={p.align === 'left' ? 'start' : p.align === 'right' ? 'end' : 'middle'}
      dominantBaseline="central"
      fill={p.color}
      stroke={p.halo ?? undefined}
      strokeWidth={p.halo ? p.haloW * 2 : undefined}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ font: p.font, letterSpacing: `${p.tracking}px` }}
    >
      {p.text}
    </text>
  );
}
