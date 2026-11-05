import type { Annotation, AnnotationSettings, LabelCasing, LabelFont, ProjectDoc } from '../state/types';

/**
 * Annotation layout, shared by the viewport (SVG) and PNG export (canvas).
 * Everything is computed in *frame pixels* (origin at the frame's top-left)
 * with sizes in px at the reference width times `scale`, so a label lands in
 * the same place, at the same relative size, on screen and in the file.
 */

export const FONT_STACKS: Record<LabelFont, string> = {
  sans: "Inter, 'Helvetica Neue', Arial, system-ui, sans-serif",
  grotesk: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  geometric: "Futura, 'Century Gothic', 'Avenir Next', Avenir, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace",
};

export type Pt = [number, number];

export type Prim =
  | { t: 'line'; pts: Pt[]; w: number; color: string; label?: string }
  | { t: 'circle'; x: number; y: number; r: number; fill: string | null; stroke: string | null; w: number; label?: string; role?: 'anchor' }
  | { t: 'poly'; pts: Pt[]; fill: string; label?: string }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      font: string; // CSS font shorthand
      size: number;
      tracking: number; // px
      align: 'left' | 'right' | 'center';
      color: string;
      halo: string | null;
      haloW: number;
      label?: string;
      role?: 'label' | 'key';
      /** Box for hit-testing and editing, frame px. */
      box: { x: number; y: number; w: number; h: number };
    };

export interface LayoutInput {
  doc: ProjectDoc;
  frameW: number;
  frameH: number;
  scale: number;
  /** Anchor of an annotation in frame px, or null when its object is hidden or behind the camera. */
  anchorOf: (a: Annotation) => Pt | null;
  /** Projected bounds of the visible model, frame px. */
  modelRect: { x0: number; y0: number; x1: number; y1: number } | null;
  measure: (text: string, font: string, trackingPx: number) => number;
  background: string;
}

export interface LayoutResult {
  prims: Prim[];
  /** Where each label's leader ends (frame fractions), as laid out; used to "bake" auto layouts when dragged. */
  positions: Record<string, [number, number]>;
}

export function labelText(doc: ProjectDoc, a: Annotation): string {
  const raw = a.text ?? doc.nodes[a.node]?.name ?? '';
  return applyCasing(raw, doc.annotations.settings.casing);
}

export function applyCasing(s: string, c: LabelCasing): string {
  if (c === 'upper') return s.toUpperCase();
  if (c === 'lower') return s.toLowerCase();
  if (c === 'title') return s.toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (_, p, ch) => p + ch.toUpperCase());
  return s;
}

export function fontOf(s: AnnotationSettings, size: number, weight?: number): string {
  return `${weight ?? s.weight} ${size.toFixed(2)}px ${FONT_STACKS[s.font]}`;
}

export function layoutAnnotations(inp: LayoutInput): LayoutResult {
  const { doc, frameW: W, frameH: H, scale: k } = inp;
  const s = doc.annotations.settings;
  const prims: Prim[] = [];
  const positions: Record<string, [number, number]> = {};
  if (!s.show) return { prims, positions };

  type Item = { a: Annotation; anchor: Pt; text: string; size: number; font: string; color: string; width: number; tracking: number };
  const items: Item[] = [];
  for (const a of doc.annotations.items) {
    const anchor = inp.anchorOf(a);
    if (!anchor || !doc.nodes[a.node]) continue;
    const size = (a.size ?? s.size) * k;
    const font = fontOf(s, size, a.weight);
    const tracking = s.tracking * size;
    const text = labelText(doc, a);
    items.push({ a, anchor, text, size, font, color: a.color ?? s.color, width: inp.measure(text, font, tracking), tracking });
  }
  const halo = s.halo ? inp.background : null;
  const lw = Math.max(0.35, s.leaderWidth * k);

  if (s.mode === 'key') {
    layoutKey(inp, items, prims, halo, lw);
    return { prims, positions };
  }

  // Leader ends: free positions, or tag columns beside the model.
  const ends = new Map<string, Pt>();
  if (s.layout === 'free' || !inp.modelRect) {
    for (const it of items) ends.set(it.a.id, [it.a.pos[0] * W, it.a.pos[1] * H]);
  } else {
    const r = inp.modelRect;
    const cx = (r.x0 + r.x1) / 2;
    const gap = s.gap * k;
    const margin = 14 * k;
    const left = items.filter((it) => s.layout === 'left' || (s.layout === 'both' && it.anchor[0] < cx));
    const right = items.filter((it) => !left.includes(it));
    const column = (list: Item[], side: -1 | 1) => {
      if (!list.length) return;
      const widest = Math.max(...list.map((it) => it.width));
      const pad = 6 * k;
      let x = side < 0 ? r.x0 - gap : r.x1 + gap;
      // Keep the text inside the frame.
      if (side < 0) x = Math.max(x, margin + widest + pad);
      else x = Math.min(x, W - margin - widest - pad);
      const sorted = [...list].sort((p, q) => p.anchor[1] - q.anchor[1]);
      const ys = spread(sorted.map((it) => it.anchor[1]), Math.max(...sorted.map((it) => it.size)) * 1.7, margin + 8 * k, H - margin - 8 * k);
      sorted.forEach((it, i) => ends.set(it.a.id, [x, ys[i]]));
    };
    column(left, -1);
    column(right, 1);
  }

  for (const it of items) {
    const end = ends.get(it.a.id)!;
    positions[it.a.id] = [end[0] / W, end[1] / H];
    // Text runs away from the anchor.
    const dir = it.anchor[0] <= end[0] ? 1 : -1;
    const pad = 5 * k;
    const shoulder = s.elbow ? Math.min(14 * k, Math.abs(end[0] - it.anchor[0]) * 0.6) : 0;
    const pts: Pt[] = [it.anchor];
    if (shoulder > 0.5) pts.push([end[0] - dir * shoulder, end[1]]);
    pts.push(end);
    prims.push({ t: 'line', pts, w: lw, color: s.leaderColor, label: it.a.id });
    endMark(prims, s.leaderEnd, it.anchor, pts[1], lw, s.leaderColor, it.a.id, k);
    const tx = end[0] + dir * pad;
    const h = it.size * 1.25;
    prims.push({
      t: 'text',
      x: tx,
      y: end[1],
      text: it.text,
      font: it.font,
      size: it.size,
      tracking: it.tracking,
      align: dir > 0 ? 'left' : 'right',
      color: it.color,
      halo,
      haloW: it.size * 0.28,
      label: it.a.id,
      role: 'label',
      box: { x: dir > 0 ? tx : tx - it.width, y: end[1] - h / 2, w: it.width, h },
    });
  }
  return { prims, positions };
}

/** Numbered tags at the anchors, and a legend listing them. */
function layoutKey(inp: LayoutInput, items: { a: Annotation; anchor: Pt; text: string; size: number; font: string; color: string; width: number; tracking: number }[], prims: Prim[], halo: string | null, lw: number) {
  const { doc, frameW: W, frameH: H, scale: k } = inp;
  const s = doc.annotations.settings;
  const size = s.size * k;
  const numFont = fontOf(s, size * 0.82, Math.max(s.weight, 600));
  const r = size * 0.78;
  items.forEach((it, i) => {
    const n = String(i + 1);
    prims.push({ t: 'circle', x: it.anchor[0], y: it.anchor[1], r, fill: inp.background, stroke: s.leaderColor, w: lw, label: it.a.id, role: 'anchor' });
    prims.push({
      t: 'text', x: it.anchor[0], y: it.anchor[1], text: n, font: numFont, size: size * 0.82, tracking: 0, align: 'center', color: s.leaderColor, halo: null, haloW: 0, label: it.a.id, role: 'label',
      box: { x: it.anchor[0] - r, y: it.anchor[1] - r, w: r * 2, h: r * 2 },
    });
  });
  // Legend
  const x0 = s.keyPos[0] * W, y0 = s.keyPos[1] * H;
  const line = size * 1.7;
  const numW = inp.measure(String(items.length), numFont, 0) + size * 1.1;
  items.forEach((it, i) => {
    const y = y0 + line * (i + 0.5);
    prims.push({
      t: 'text', x: x0, y, text: String(i + 1), font: numFont, size: size * 0.82, tracking: 0, align: 'left', color: s.leaderColor, halo, haloW: size * 0.28, role: 'key',
      box: { x: x0, y: y - line / 2, w: numW, h: line },
    });
    prims.push({
      t: 'text', x: x0 + numW, y, text: it.text, font: it.font, size: it.size, tracking: it.tracking, align: 'left', color: it.color, halo, haloW: it.size * 0.28, label: it.a.id, role: 'key',
      box: { x: x0 + numW, y: y - line / 2, w: it.width, h: line },
    });
  });
}

function endMark(prims: Prim[], kind: AnnotationSettings['leaderEnd'], at: Pt, toward: Pt, lw: number, color: string, label: string, k: number) {
  const dx = toward[0] - at[0], dy = toward[1] - at[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  if (kind === 'dot') prims.push({ t: 'circle', x: at[0], y: at[1], r: Math.max(1.6 * k, lw * 1.8), fill: color, stroke: null, w: 0, label, role: 'anchor' });
  else if (kind === 'arrow') {
    const L = 7 * k + lw * 2, wv = L * 0.38;
    prims.push({ t: 'poly', pts: [at, [at[0] + ux * L - uy * wv, at[1] + uy * L + ux * wv], [at[0] + ux * L + uy * wv, at[1] + uy * L - ux * wv]], fill: color, label });
  } else if (kind === 'tick') {
    const L = 4 * k + lw;
    // A short architectural slash across the leader.
    const ax = (ux - uy) * Math.SQRT1_2, ay = (uy + ux) * Math.SQRT1_2;
    prims.push({ t: 'line', pts: [[at[0] - ax * L, at[1] - ay * L], [at[0] + ax * L, at[1] + ay * L]], w: lw * 1.6, color, label });
  }
  // Invisible handle so a dot-less anchor can still be grabbed in the viewport.
  if (kind !== 'dot') prims.push({ t: 'circle', x: at[0], y: at[1], r: 4 * k, fill: null, stroke: null, w: 0, label, role: 'anchor' });
}

/** Place values near their ideal positions, at least `gap` apart, within [lo, hi]. Input must be sorted. */
function spread(ideal: number[], gap: number, lo: number, hi: number): number[] {
  const y = ideal.map((v) => Math.min(hi, Math.max(lo, v)));
  for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i], y[i - 1] + gap);
  if (y.length && y[y.length - 1] > hi) {
    y[y.length - 1] = hi;
    for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] - gap);
  }
  // Centre the stack on its ideals when there is room (reduces leader slope).
  const shift = ideal.reduce((a, v, i) => a + (v - y[i]), 0) / (y.length || 1);
  const canUp = y.length ? y[0] - lo : 0, canDown = y.length ? hi - y[y.length - 1] : 0;
  const d = Math.max(-canUp, Math.min(canDown, shift));
  return y.map((v) => v + d);
}

// ------------------------------------------------------------ canvas renderer (export)

let measureCtx: CanvasRenderingContext2D | null = null;
export function measureText(text: string, font: string, trackingPx: number): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = font;
  (measureCtx as any).letterSpacing = `${trackingPx}px`;
  return measureCtx.measureText(text).width;
}

/** Draw primitives on a 2D canvas, offset by (ox, oy). */
export function drawPrims(ctx: CanvasRenderingContext2D, prims: Prim[], ox = 0, oy = 0) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of prims) {
    if (p.t === 'line') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.w;
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    } else if (p.t === 'circle') {
      if (!p.fill && !p.stroke) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fill();
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.w;
        ctx.stroke();
      }
    } else if (p.t === 'poly') {
      ctx.fillStyle = p.fill;
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.font = p.font;
      ctx.textBaseline = 'middle';
      ctx.textAlign = p.align;
      (ctx as any).letterSpacing = `${p.tracking}px`;
      const x = p.x;
      if (p.halo) {
        ctx.strokeStyle = p.halo;
        ctx.lineWidth = p.haloW * 2;
        ctx.strokeText(p.text, x, p.y);
      }
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, p.y);
      (ctx as any).letterSpacing = '0px';
    }
  }
  ctx.restore();
}
