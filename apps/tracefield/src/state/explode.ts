import { Box3, Vector3 } from 'three';
import { registry } from '../import/registry';
import { descendants, topmost, worldMatrix } from './scene';
import type { ExplodeSettings, ProjectDoc, Vec3 } from './types';

/**
 * Exploded-drawing helpers. Everything here works on the *assembled* model:
 * bounds come from imported geometry and the document's own transforms, never
 * from the exploded scene, so arranging is repeatable.
 */

const boxCache = new WeakMap<object, Map<string, Box3>>();

/** World bounding box of a node and its subtree, assembled. Empty if it has no geometry. */
export function assembledBox(doc: ProjectDoc, id: string): Box3 {
  let cache = boxCache.get(doc.nodes);
  if (!cache) {
    cache = new Map();
    boxCache.set(doc.nodes, cache);
  }
  const hit = cache.get(id);
  if (hit) return hit;
  const box = new Box3();
  const tmp = new Box3();
  for (const nid of [id, ...descendants(doc, id)]) {
    const g = doc.nodes[nid]?.geom;
    if (!g) continue;
    const d = registry.get(g.model)?.drawables[g.index];
    if (!d) continue;
    if (!d.geometry.boundingBox) d.geometry.computeBoundingBox();
    box.union(tmp.copy(d.geometry.boundingBox!).applyMatrix4(worldMatrix(doc, nid)));
  }
  cache.set(id, box);
  return box;
}

export const ZERO: Vec3 = [0, 0, 0];
export const isZero = (v: Vec3 | undefined) => !v || (v[0] === 0 && v[1] === 0 && v[2] === 0);

/** Sum of the ancestors' offsets (what the node inherits), not including its own. */
export function inheritedOffset(doc: ProjectDoc, id: string): Vector3 {
  const v = new Vector3();
  let p = doc.nodes[id]?.parent;
  while (p) {
    const o = doc.explode.offsets[p];
    if (o) v.add(new Vector3(...o));
    p = doc.nodes[p]?.parent ?? null;
  }
  return v;
}

/** Where a node's bounding box currently sits, at the document's explode amount. */
export function explodedBox(doc: ProjectDoc, id: string): Box3 {
  const b = assembledBox(doc, id).clone();
  if (b.isEmpty()) return b;
  const own = doc.explode.offsets[id];
  const shift = inheritedOffset(doc, id);
  if (own) shift.add(new Vector3(...own));
  return b.translate(shift.multiplyScalar(doc.explode.amount));
}

/**
 * What to explode: the children of a single selected group; several selected
 * items as they are; or, with nothing selected, the first level of the model
 * that branches (skipping wrappers like "file › root").
 */
export function chooseParts(doc: ProjectDoc, selection: string[]): string[] {
  const shown = (id: string) => doc.nodes[id]?.visible && !assembledBox(doc, id).isEmpty();
  const sel = topmost(doc, selection.filter((id) => doc.nodes[id]));
  if (sel.length === 1) {
    const kids = doc.nodes[sel[0]].children.filter(shown);
    return kids.length > 1 ? kids : [];
  }
  if (sel.length > 1) return sel.filter(shown);
  let level = doc.roots.filter(shown);
  while (level.length === 1 && doc.nodes[level[0]].children.filter(shown).length) level = doc.nodes[level[0]].children.filter(shown);
  return level.length > 1 ? level : [];
}

const AXES: Record<ExplodeSettings['axis'], Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

/**
 * Auto-explode offsets for `parts`.
 *  Axial: parts are ranked by level along the axis (parts whose bases are at
 *  about the same height share a level) and each level moves one more step; Scale also
 *  stretches distances along the axis.
 *  Radial: parts move away from the group centre, perpendicular to the axis.
 */
export function autoOffsets(doc: ProjectDoc, parts: string[], s: ExplodeSettings): Record<string, Vec3> {
  const items = parts.map((id) => ({ id, box: assembledBox(doc, id) })).filter((p) => !p.box.isEmpty());
  const out: Record<string, Vec3> = {};
  if (!items.length) return out;
  const all = new Box3();
  items.forEach((p) => all.union(p.box));
  const size = all.getSize(new Vector3());
  const extent = Math.max(size.x, size.y, size.z) || 1;
  const step = s.spacing * extent;
  const axis = AXES[s.axis].clone().multiplyScalar(s.direction);
  const centre = all.getCenter(new Vector3());

  if (s.mode === 'axial') {
    // Rank by the base of each part along the axis: things standing on the same floor share a level.
    const k = s.axis === 'x' ? 'x' : s.axis === 'y' ? 'y' : 'z';
    const proj = items.map((p) => ({ id: p.id, t: s.direction > 0 ? p.box.min[k] : -p.box.max[k] }));
    proj.sort((a, b) => a.t - b.t);
    const span = Math.abs(size.dot(AXES[s.axis])) || extent;
    const tol = span * 0.04;
    let level = 0, levelStart = proj[0].t;
    const t0 = proj[0].t;
    for (const p of proj) {
      if (p.t - levelStart > tol) {
        level++;
        levelStart = p.t;
      }
      const d = level * step + (p.t - t0) * (s.scale - 1);
      out[p.id] = round3(axis.clone().multiplyScalar(d));
    }
    return out;
  }
  const along = AXES[s.axis];
  for (const p of items) {
    const d = p.box.getCenter(new Vector3()).sub(centre);
    d.addScaledVector(along, -d.dot(along)); // radial: perpendicular to the axis
    const len = d.length();
    if (len < extent * 1e-3) {
      out[p.id] = [0, 0, 0];
      continue;
    }
    out[p.id] = round3(d.clone().multiplyScalar(s.scale - 1).addScaledVector(d.normalize(), step));
  }
  return out;
}

function round3(v: Vector3): Vec3 {
  const r = (x: number) => (Math.abs(x) < 1e-9 ? 0 : Number(x.toPrecision(7)));
  return [r(v.x), r(v.y), r(v.z)];
}

/** Connector segments (world space) for every node with its own offset, at the current amount. */
export function connectorSegments(doc: ProjectDoc, isShown: (id: string) => boolean): number[] {
  const e = doc.explode;
  const out: number[] = [];
  if (!e.connectors || e.amount <= 0) return out;
  for (const [id, own] of Object.entries(e.offsets)) {
    if (!doc.nodes[id] || isZero(own) || !isShown(id)) continue;
    const box = assembledBox(doc, id);
    if (box.isEmpty()) continue;
    const base = inheritedOffset(doc, id).multiplyScalar(e.amount);
    const move = new Vector3(...own).multiplyScalar(e.amount);
    for (const u of effectiveAnchors(doc, id)) {
      const a = anchorPoint(box, u).add(base);
      const b = a.clone().add(move);
      out.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return out;
}

const MAX_AUTO_PIECES = 40;

/**
 * The visible pieces a moved node is made of: the node itself if it is a
 * single object, otherwise its children (looking through wrapper groups that
 * hold just one child). Connectors run through each piece, not through the
 * empty middle of a scattered group.
 */
export function pieces(doc: ProjectDoc, id: string): string[] {
  const usable = (nid: string) => doc.nodes[nid]?.visible && !assembledBox(doc, nid).isEmpty();
  let cur = id;
  for (;;) {
    const kids = (doc.nodes[cur]?.children ?? []).filter(usable);
    if (kids.length === 1) cur = kids[0];
    else if (kids.length > 1 && kids.length <= MAX_AUTO_PIECES) return kids;
    else return [cur];
  }
}

/**
 * Anchors used for a node's connectors, as fractions of its assembled box.
 * Explicit anchors win; otherwise one at the centre of each piece.
 */
export function effectiveAnchors(doc: ProjectDoc, id: string): Vec3[] {
  const explicit = doc.explode.anchors[id];
  if (explicit) return explicit;
  const box = assembledBox(doc, id);
  if (box.isEmpty()) return [];
  const size = box.getSize(new Vector3());
  const frac = (v: number, lo: number, s: number) => (s > 1e-12 ? Math.min(1, Math.max(0, (v - lo) / s)) : 0.5);
  return pieces(doc, id).map((p) => {
    const c = assembledBox(doc, p).getCenter(new Vector3());
    return [frac(c.x, box.min.x, size.x), frac(c.y, box.min.y, size.y), frac(c.z, box.min.z, size.z)] as Vec3;
  });
}

export function anchorPoint(box: Box3, u: Vec3): Vector3 {
  return new Vector3(box.min.x + (box.max.x - box.min.x) * u[0], box.min.y + (box.max.y - box.min.y) * u[1], box.min.z + (box.max.z - box.min.z) * u[2]);
}
