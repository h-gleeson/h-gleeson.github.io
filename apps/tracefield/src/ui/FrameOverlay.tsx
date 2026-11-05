import { useEffect, useRef, useState } from 'react';
import { actions } from '../app/actions';
import type { Frame } from '../engine/Engine';
import { getEngine } from '../engine/engineRef';
import { sizeLabel } from '../state/output';
import { store, useStore } from '../state/store';

type Edge = 'left' | 'right' | 'top' | 'bottom';

/**
 * The drawing frame: everything inside it is what exports. Outside is dimmed.
 * Dragging an edge crops — a dashed preview follows the pointer and the crop
 * applies on release, leaving the drawing where it is.
 */
export function FrameOverlay({ engineReady }: { engineReady: boolean }) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [drag, setDrag] = useState<{ edge: Edge; start: number; delta: number } | null>(null);
  const output = useStore((s) => s.doc.output);
  const empty = useStore((s) => s.doc.roots.length === 0);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  useEffect(() => {
    const e = getEngine();
    if (!e) return;
    return e.onFrame((f) => setFrame({ ...f }));
  }, [engineReady]);

  if (!frame) return null;
  const f = frame;
  // Preview rectangle while cropping.
  let p = { ...f };
  if (drag) {
    const d = drag.delta;
    if (drag.edge === 'left') p = { ...p, x: f.x + Math.min(d, f.w - 24), w: Math.max(24, f.w - d) };
    if (drag.edge === 'right') p = { ...p, w: Math.max(24, f.w + d) };
    if (drag.edge === 'top') p = { ...p, y: f.y + Math.min(d, f.h - 24), h: Math.max(24, f.h - d) };
    if (drag.edge === 'bottom') p = { ...p, h: Math.max(24, f.h + d) };
  }
  const handle = (edge: Edge) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      store.commit();
      setDrag({ edge, start: edge === 'left' || edge === 'right' ? e.clientX : e.clientY, delta: 0 });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.edge !== edge) return;
      setDrag({ ...d, delta: (edge === 'left' || edge === 'right' ? e.clientX : e.clientY) - d.start });
    },
    onPointerUp: () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && Math.abs(d.delta) > 1) {
        const max = d.edge === 'left' ? f.w - 24 : d.edge === 'top' ? f.h - 24 : Infinity;
        const min = d.edge === 'right' ? 24 - f.w : d.edge === 'bottom' ? 24 - f.h : -Infinity;
        actions.cropFrame({ [d.edge]: Math.max(min, Math.min(max, d.delta)) });
      }
    },
  });

  const mask = output.showFrame;
  return (
    <div className="frame-layer" aria-hidden={empty}>
      {mask && (
        <>
          <div className="frame-mask" style={{ left: 0, top: 0, right: 0, height: f.y }} />
          <div className="frame-mask" style={{ left: 0, top: f.y + f.h, right: 0, bottom: 0 }} />
          <div className="frame-mask" style={{ left: 0, top: f.y, width: f.x, height: f.h }} />
          <div className="frame-mask" style={{ left: f.x + f.w, top: f.y, right: 0, height: f.h }} />
        </>
      )}
      <div className={`frame-edge ${mask ? '' : 'quiet'}`} style={{ left: f.x - 1, top: f.y - 1, width: f.w + 2, height: f.h + 2 }}>
        <span className="tick tl" />
        <span className="tick tr" />
        <span className="tick bl" />
        <span className="tick br" />
      </div>
      {!empty && (
        <div className="frame-label" style={{ left: f.x, top: f.y - 20, maxWidth: f.w }}>
          {sizeLabel(output)}
          {output.transparent ? ' · transparent' : ''}
        </div>
      )}
      {!empty &&
        (['left', 'right', 'top', 'bottom'] as Edge[]).map((edge) => {
          const vertical = edge === 'left' || edge === 'right';
          const style = vertical
            ? { left: (edge === 'left' ? f.x : f.x + f.w) - 5, top: f.y + f.h * 0.3, width: 10, height: f.h * 0.4 }
            : { top: (edge === 'top' ? f.y : f.y + f.h) - 5, left: f.x + f.w * 0.3, height: 10, width: f.w * 0.4 };
          return <div key={edge} className={`crop-handle ${vertical ? 'v' : 'h'}`} style={style} title="Drag to crop the drawing frame" {...handle(edge)} />;
        })}
      {drag && <div className="crop-preview" style={{ left: p.x, top: p.y, width: p.w, height: p.h }} />}
    </div>
  );
}
