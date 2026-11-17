import { BufferGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, Shape, ShapeGeometry, Vector2, type Object3D } from 'three';
import { ImportError } from './errors';

/**
 * Text objects. A text object is a model of format `text` whose main file is a
 * small JSON spec (the words, font, depth…) and, for an uploaded font, the font
 * file as a side file. Like any model, the bytes are what a project saves, and
 * the parse depends only on them, so nodes re-attach by drawable index (always
 * one mesh, index 0).
 *
 * Outlines come from the browser's own text rendering: the words are drawn on a
 * canvas at high resolution and traced back into vector contours (marching
 * squares, then simplified). That way any font the browser can draw works —
 * system fonts, Google Fonts by name, and uploaded TTF / OTF / WOFF / WOFF2 —
 * with no font-parsing library. The contours are then filled flat or extruded.
 */

export type TextAlign = 'left' | 'center' | 'right';
export type FontSource = 'system' | 'google' | 'file';

export interface TextSpec {
  text: string;
  fontSource: FontSource;
  /** system: a CSS font stack · google: the family name · file: the font file's name. */
  family: string;
  weight: number; // 100..900 (system and Google fonts)
  italic: boolean;
  tracking: number; // letter spacing, em
  lineHeight: number; // em
  align: TextAlign;
  slant: number; // degrees, a shear applied to the outlines
  depth: number; // em; 0 = flat lettering
  bevel: number; // em
  faceColor: string;
  sideColor: string;
}

export const SYSTEM_FONTS: { label: string; stack: string }[] = [
  { label: 'Helvetica / Arial', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Arial Black', stack: '"Arial Black", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Impact', stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { label: 'Futura / Century Gothic', stack: 'Futura, "Century Gothic", "Avenir Next", sans-serif' },
  { label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet', stack: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { label: 'Times', stack: '"Times New Roman", Times, serif' },
  { label: 'Didot / Bodoni', stack: 'Didot, "Bodoni 72", "Bodoni MT", "Times New Roman", serif' },
  { label: 'Courier', stack: '"Courier New", Courier, monospace' },
  { label: 'Mono', stack: '"SF Mono", Consolas, Menlo, monospace' },
];

export const DEFAULT_TEXT: TextSpec = {
  text: 'TEXT',
  fontSource: 'system',
  family: SYSTEM_FONTS[1].stack,
  weight: 900,
  italic: false,
  tracking: 0,
  lineHeight: 0.9,
  align: 'center',
  slant: 0,
  depth: 0.3,
  bevel: 0,
  faceColor: '#ffffff',
  sideColor: '#2f48d8',
};

export const TEXT_FILE = 'Text.tftext';
export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];

export function encodeText(spec: TextSpec): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(spec)).buffer as ArrayBuffer;
}

export function decodeText(data: ArrayBuffer): TextSpec {
  try {
    return { ...DEFAULT_TEXT, ...JSON.parse(new TextDecoder().decode(data)) };
  } catch {
    throw new ImportError('This text object’s data is damaged.');
  }
}

/** The name a text object shows in the scene: its first line. */
export function textLabel(spec: TextSpec): string {
  const first = spec.text.split('\n').find((l) => l.trim()) ?? '';
  const t = first.trim().replace(/\s+/g, ' ');
  return t ? (t.length > 32 ? `${t.slice(0, 31)}…` : t) : 'Text';
}

// ------------------------------------------------------------ fonts

const fileFamilies = new Map<string, Promise<string>>();
const googleFamilies = new Map<string, Promise<void>>();

function hashBytes(data: ArrayBuffer): string {
  // FNV-1a over the length and up to 256 KB, enough to tell font files apart.
  const b = new Uint8Array(data, 0, Math.min(data.byteLength, 262144));
  let h = 0x811c9dc5 ^ data.byteLength;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return (h >>> 0).toString(36);
}

/** Register an uploaded font file with the browser; returns its private family name. */
function fontFromFile(name: string, data: ArrayBuffer): Promise<string> {
  const key = hashBytes(data);
  let p = fileFamilies.get(key);
  if (!p) {
    p = (async () => {
      const family = `tf-font-${key}`;
      const face = new FontFace(family, data.slice(0));
      try {
        await face.load();
      } catch {
        throw new ImportError(`${name} could not be read as a font (TTF, OTF, WOFF or WOFF2).`);
      }
      document.fonts.add(face);
      return family;
    })();
    fileFamilies.set(key, p);
    p.catch(() => fileFamilies.delete(key));
  }
  return p;
}

function addStylesheet(href: string): Promise<boolean> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve(true);
    link.onerror = () => {
      link.remove();
      resolve(false);
    };
    document.head.appendChild(link);
  });
}

/** Load a Google Fonts family (the requested weight and style, else its default). */
function loadGoogle(family: string, weight: number, italic: boolean): Promise<void> {
  const key = `${family}|${weight}|${italic}`;
  let p = googleFamilies.get(key);
  if (!p) {
    p = (async () => {
      const fam = encodeURIComponent(family.trim()).replace(/%20/g, '+');
      const ok =
        (await addStylesheet(`https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${italic ? 1 : 0},${weight}&display=block`)) ||
        (await addStylesheet(`https://fonts.googleapis.com/css2?family=${fam}&display=block`));
      if (!ok) throw new ImportError(`Google Fonts has no family called “${family}” (or it could not be reached).`);
    })();
    googleFamilies.set(key, p);
    p.catch(() => googleFamilies.delete(key));
  }
  return p;
}

/** The CSS font for the spec, loaded and ready to draw on a canvas. */
async function resolveFont(spec: TextSpec, side: { name: string; data: ArrayBuffer }[], px: number): Promise<string> {
  let css: string;
  let style = `${spec.italic ? 'italic ' : ''}${Math.round(spec.weight)}`;
  if (spec.fontSource === 'file') {
    const f = side.find((s) => s.name === spec.family);
    if (!f) throw new ImportError(`The font file ${spec.family} is missing from this text object.`);
    css = `"${await fontFromFile(f.name, f.data)}", sans-serif`;
    // An uploaded file is one face; asking for another weight would only fake it.
    style = 'normal 400';
  } else if (spec.fontSource === 'google') {
    if (!spec.family.trim()) throw new ImportError('Type the name of a Google font, e.g. “Archivo Black”.');
    await loadGoogle(spec.family, spec.weight, spec.italic);
    css = `"${spec.family.trim()}", sans-serif`;
  } else css = spec.family || SYSTEM_FONTS[0].stack;
  const font = `${style} ${px}px ${css}`;
  try {
    await document.fonts.load(font, spec.text);
  } catch {
    /* system fonts need no loading */
  }
  return font;
}

// ------------------------------------------------------------ tracing

interface Raster {
  alpha: Uint8ClampedArray;
  w: number;
  h: number;
  /** px per em */
  em: number;
  /** Pixel position of the text's origin (alignment point, centre of the cap height). */
  ox: number;
  oy: number;
}

const EM = 160;
const MAX_SIDE = 8192;

function drawLines(spec: TextSpec, font: (px: number) => string): Raster {
  const lines = spec.text.split('\n');
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const hasSpacing: boolean = 'letterSpacing' in (ctx as object);
  const setup = (px: number) => {
    ctx.font = font(px);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    if (hasSpacing) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spec.tracking * px}px`;
  };
  const chars = (l: string) => [...l];
  const widthOf = (l: string, px: number) => {
    if (!l) return 0;
    if (hasSpacing) return ctx.measureText(l).width - spec.tracking * px; // no spacing after the last letter
    return chars(l).reduce((w, ch) => w + ctx.measureText(ch).width, 0) + spec.tracking * px * (chars(l).length - 1);
  };
  const layout = (px: number) => {
    setup(px);
    const widths = lines.map((l) => widthOf(l, px));
    const maxW = Math.max(1, ...widths);
    const m = ctx.measureText('HgÅ');
    const ascent = m.fontBoundingBoxAscent || px * 0.9;
    const cap = ctx.measureText('H').actualBoundingBoxAscent || px * 0.7;
    const lead = spec.lineHeight * px;
    const padX = px * 1.2;
    const padY = px * 0.8;
    const w = Math.ceil(maxW + padX * 2);
    const h = Math.ceil(ascent + lead * (lines.length - 1) + px * 0.5 + padY * 2);
    return { widths, maxW, ascent, cap, lead, padX, padY, w, h };
  };
  let px = EM;
  let L = layout(px);
  const k = Math.min(1, MAX_SIDE / L.w, MAX_SIDE / L.h);
  if (k < 1) {
    px = Math.max(16, Math.floor(EM * k));
    L = layout(px);
  }
  c.width = Math.min(MAX_SIDE, L.w);
  c.height = Math.min(MAX_SIDE, L.h);
  setup(px); // resizing the canvas resets its state
  const base0 = L.padY + L.ascent;
  lines.forEach((line, i) => {
    const y = base0 + i * L.lead;
    let x = L.padX;
    if (spec.align === 'center') x += (L.maxW - L.widths[i]) / 2;
    else if (spec.align === 'right') x += L.maxW - L.widths[i];
    if (hasSpacing) ctx.fillText(line, x, y);
    else
      for (const ch of chars(line)) {
        ctx.fillText(ch, x, y);
        x += ctx.measureText(ch).width + spec.tracking * px;
      }
  });
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const alpha = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3];
  const ox = spec.align === 'left' ? L.padX : spec.align === 'right' ? L.padX + L.maxW : L.padX + L.maxW / 2;
  const lastBase = base0 + (lines.length - 1) * L.lead;
  const oy = (base0 - L.cap + lastBase) / 2;
  return { alpha, w: c.width, h: c.height, em: px, ox, oy };
}

/**
 * Marching squares over the alpha field at the 50% level, with the crossing
 * interpolated along each cell edge. Every crossing edge belongs to exactly two
 * segments, so the segments chain into closed loops. Returns loops in pixels.
 */
function traceLoops(r: Raster): number[][] {
  const { alpha: A, w: W, h: H } = r;
  const T = 127.5;
  const coords: number[] = [];
  const index = new Map<number, number>();
  const n1 = new Map<number, number>();
  const n2 = new Map<number, number>();
  const point = (id: number, i: number, j: number, horizontal: boolean) => {
    if (index.has(id)) return;
    const a = A[j * W + i];
    const b = horizontal ? A[j * W + i + 1] : A[(j + 1) * W + i];
    const t = a === b ? 0.5 : (T - a) / (b - a);
    index.set(id, coords.length);
    coords.push(horizontal ? i + t : i, horizontal ? j : j + t);
  };
  const link = (a: number, b: number) => {
    if (!n1.has(a)) n1.set(a, b);
    else n2.set(a, b);
    if (!n1.has(b)) n1.set(b, a);
    else n2.set(b, a);
  };
  for (let j = 0; j < H - 1; j++) {
    const row = j * W;
    for (let i = 0; i < W - 1; i++) {
      const tl = A[row + i], tr = A[row + i + 1], bl = A[row + W + i], br = A[row + W + i + 1];
      const c = (tl > T ? 1 : 0) | (tr > T ? 2 : 0) | (br > T ? 4 : 0) | (bl > T ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const top = (row + i) * 2, left = top + 1, right = (row + i + 1) * 2 + 1, bottom = (row + W + i) * 2;
      const P = (e: number) => {
        if (e === top) point(e, i, j, true);
        else if (e === bottom) point(e, i, j + 1, true);
        else if (e === left) point(e, i, j, false);
        else point(e, i + 1, j, false);
      };
      const seg = (a: number, b: number) => {
        P(a);
        P(b);
        link(a, b);
      };
      const centre = (tl + tr + bl + br) / 4 > T;
      switch (c) {
        case 1: case 14: seg(left, top); break;
        case 2: case 13: seg(top, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(right, bottom); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, bottom); break;
        case 5:
          if (centre) { seg(top, right); seg(bottom, left); } else { seg(left, top); seg(right, bottom); }
          break;
        case 10:
          if (centre) { seg(left, top); seg(right, bottom); } else { seg(top, right); seg(bottom, left); }
          break;
      }
    }
  }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of n1.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let prev = -1, cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const k = index.get(cur)!;
      loop.push(coords[k], coords[k + 1]);
      const a = n1.get(cur), b = n2.get(cur);
      const next = a !== prev ? a : b;
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

/** Ramer–Douglas–Peucker on a closed loop (flat x,y list). */
function simplify(loop: number[], tol: number): number[] {
  const n = loop.length / 2;
  if (n < 8) return loop;
  // Split at the point farthest from the first, then simplify both halves.
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) {
    const d = (loop[i * 2] - loop[0]) ** 2 + (loop[i * 2 + 1] - loop[1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, n]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const bi = b % n;
    const ax = loop[a * 2], ay = loop[a * 2 + 1], bx = loop[bi * 2], by = loop[bi * 2 + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    let best = -1, bd = t2;
    for (let i = a + 1; i < b; i++) {
      const px = loop[i * 2] - ax, py = loop[i * 2 + 1] - ay;
      const cr = px * dy - py * dx;
      const d = (cr * cr) / L2;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(loop[i * 2], loop[i * 2 + 1]);
  return out;
}

function signedArea(p: number[]): number {
  let s = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    s += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return s / 2;
}

function inside(p: number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Group loops into shapes with holes by how deeply each is nested (even depth = solid, odd = hole). */
function toShapes(loops: number[][]): Shape[] {
  const items = loops
    .map((pts) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
      }
      return { pts, area: Math.abs(signedArea(pts)), box: [x0, y0, x1, y1], depth: 0, parent: -1 };
    })
    .filter((l) => l.area > 1e-7);
  items.sort((a, b) => b.area - a.area);
  items.forEach((it, i) => {
    // Test a point a little inside the loop's first edge, not the vertex itself.
    const x = it.pts[0], y = it.pts[1];
    for (let k = i - 1; k >= 0; k--) {
      const o = items[k];
      if (x < o.box[0] || x > o.box[2] || y < o.box[1] || y > o.box[3]) continue;
      if (!inside(o.pts, x, y)) continue;
      // The smallest container is the parent; its depth is already known (larger loops come first).
      if (it.parent < 0 || o.area < items[it.parent].area) it.parent = k;
    }
    it.depth = it.parent < 0 ? 0 : items[it.parent].depth + 1;
  });
  const shapes = new Map<number, Shape>();
  const vec = (p: number[]) => {
    const out: Vector2[] = [];
    for (let i = 0; i < p.length; i += 2) out.push(new Vector2(p[i], p[i + 1]));
    return out;
  };
  items.forEach((it, i) => {
    if (it.depth % 2 === 0) shapes.set(i, new Shape(vec(it.pts)));
  });
  items.forEach((it) => {
    if (it.depth % 2 === 1) shapes.get(it.parent)?.holes.push(new Path(vec(it.pts)));
  });
  return [...shapes.values()];
}

/** Trace the text into shapes in em units, origin at the alignment point, y up. */
export async function textShapes(spec: TextSpec, side: { name: string; data: ArrayBuffer }[]): Promise<Shape[]> {
  if (!spec.text.trim()) throw new ImportError('A text object needs at least one letter.');
  const font = await resolveFont(spec, side, EM);
  // resolveFont loaded the face at EM px; the size part is swapped when the canvas has to shrink.
  const raster = drawLines(spec, (px) => font.replace(` ${EM}px `, ` ${px}px `));
  const loops = traceLoops(raster);
  const shear = Math.tan((Math.max(-60, Math.min(60, spec.slant)) * Math.PI) / 180);
  const em = raster.em;
  const tol = 0.3;
  const out: number[][] = [];
  for (const loop of loops) {
    if (Math.abs(signedArea(loop)) < 2) continue; // specks
    const s = simplify(loop, tol);
    if (s.length < 6) continue;
    const p = new Array<number>(s.length);
    for (let i = 0; i < s.length; i += 2) {
      const y = (raster.oy - s[i + 1]) / em;
      p[i] = (s[i] - raster.ox) / em + y * shear;
      p[i + 1] = y;
    }
    out.push(p);
  }
  const shapes = toShapes(out);
  if (!shapes.length) throw new ImportError('Nothing to draw: the font has no visible letters for this text.');
  return shapes;
}

/** Build the text object: one mesh, face and side materials, centred in depth, facing +Z. */
export async function parseText(main: { name: string; data: ArrayBuffer }, side: { name: string; data: ArrayBuffer }[]): Promise<Object3D> {
  const spec = decodeText(main.data);
  const shapes = await textShapes(spec, side);
  const depth = Math.max(0, spec.depth);
  let geometry: BufferGeometry;
  const face = new MeshStandardMaterial({ color: spec.faceColor, name: 'Face' });
  const materials = [face];
  if (depth > 1e-4) {
    const bevel = Math.max(0, Math.min(spec.bevel, depth));
    geometry = new ExtrudeGeometry(shapes, {
      depth,
      steps: 1,
      curveSegments: 1,
      bevelEnabled: bevel > 1e-5,
      bevelThickness: bevel,
      bevelSize: bevel * 0.75,
      bevelSegments: 3,
    });
    geometry.translate(0, 0, -depth / 2);
    materials.push(new MeshStandardMaterial({ color: spec.sideColor, name: 'Sides' }));
  } else {
    geometry = new ShapeGeometry(shapes, 1);
    geometry.clearGroups(); // one material for every letter
  }
  geometry.computeBoundingBox();
  const mesh = new Mesh(geometry, materials.length > 1 ? materials : face);
  mesh.name = textLabel(spec);
  const root = new Group();
  root.add(mesh);
  return root;
}
