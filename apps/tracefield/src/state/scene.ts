import { Matrix4 } from 'three';
import { uid } from './store';
import type { GraphicStyle, ProjectDoc, SceneNode, StyleKey } from './types';

/** Pure functions over the scene tree. All return a new document. */

export const IDENTITY = new Matrix4().toArray();

export function worldMatrix(doc: ProjectDoc, id: string): Matrix4 {
  const chain: SceneNode[] = [];
  let n: SceneNode | undefined = doc.nodes[id];
  while (n) {
    chain.push(n);
    n = n.parent ? doc.nodes[n.parent] : undefined;
  }
  const m = new Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) m.multiply(new Matrix4().fromArray(chain[i].matrix));
  return m;
}

export function descendants(doc: ProjectDoc, id: string, out: string[] = []): string[] {
  const n = doc.nodes[id];
  if (!n) return out;
  for (const c of n.children) {
    out.push(c);
    descendants(doc, c, out);
  }
  return out;
}

export function ancestors(doc: ProjectDoc, id: string): string[] {
  const out: string[] = [];
  let p = doc.nodes[id]?.parent ?? null;
  while (p) {
    out.push(p);
    p = doc.nodes[p]?.parent ?? null;
  }
  return out;
}

/** Drop ids whose ancestor is also in the list, so operations do not apply twice. */
export function topmost(doc: ProjectDoc, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => doc.nodes[id] && !ancestors(doc, id).some((a) => set.has(a)));
}

export function isLockedInTree(doc: ProjectDoc, id: string): boolean {
  let n: SceneNode | undefined = doc.nodes[id];
  while (n) {
    if (n.locked) return true;
    n = n.parent ? doc.nodes[n.parent] : undefined;
  }
  return false;
}

/** Style resolution: defaults, then each ancestor's overrides from root down, then the node's own. */
export function resolveStyle(doc: ProjectDoc, id: string): GraphicStyle {
  const chain = [id, ...ancestors(doc, id)].reverse();
  let s = doc.defaults;
  for (const nid of chain) {
    const o = doc.nodes[nid]?.style;
    if (o && Object.keys(o).length) s = { ...s, ...o };
  }
  return s;
}

/** Which node (or 'defaults') supplies the effective value of `key` for `id`. */
export function styleSource(doc: ProjectDoc, id: string, key: StyleKey): string | 'defaults' {
  for (const nid of [id, ...ancestors(doc, id)]) {
    if (doc.nodes[nid]?.style[key] !== undefined) return nid;
  }
  return 'defaults';
}

export function updateNodes(doc: ProjectDoc, ids: string[], fn: (n: SceneNode) => SceneNode): ProjectDoc {
  const nodes = { ...doc.nodes };
  let changed = false;
  for (const id of ids) {
    if (!nodes[id]) continue;
    nodes[id] = fn(nodes[id]);
    changed = true;
  }
  return changed ? { ...doc, nodes } : doc;
}

export function patchNodes(doc: ProjectDoc, ids: string[], patch: Partial<SceneNode>): ProjectDoc {
  return updateNodes(doc, ids, (n) => ({ ...n, ...patch }));
}

export function setStyle(doc: ProjectDoc, ids: string[], patch: Partial<Record<StyleKey, unknown>>): ProjectDoc {
  return updateNodes(doc, ids, (n) => {
    const style: Record<string, unknown> = { ...n.style };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete style[k];
      else style[k] = v;
    }
    return { ...n, style: style as Partial<GraphicStyle> };
  });
}

function detach(doc: ProjectDoc, id: string): ProjectDoc {
  const n = doc.nodes[id];
  if (!n) return doc;
  if (n.parent) {
    const p = doc.nodes[n.parent];
    return { ...doc, nodes: { ...doc.nodes, [p.id]: { ...p, children: p.children.filter((c) => c !== id) } } };
  }
  return { ...doc, roots: doc.roots.filter((r) => r !== id) };
}

function attach(doc: ProjectDoc, id: string, parent: string | null, index?: number): ProjectDoc {
  let nodes = { ...doc.nodes, [id]: { ...doc.nodes[id], parent } };
  let roots = doc.roots;
  if (parent) {
    const p = nodes[parent];
    const children = [...p.children];
    children.splice(index ?? children.length, 0, id);
    nodes = { ...nodes, [parent]: { ...p, children } };
  } else {
    roots = [...roots];
    roots.splice(index ?? roots.length, 0, id);
  }
  return { ...doc, nodes, roots };
}

/** Move a node to a new parent, preserving its world transform. */
export function reparent(doc: ProjectDoc, id: string, parent: string | null, index?: number): ProjectDoc {
  if (parent && (parent === id || descendants(doc, id).includes(parent))) return doc;
  const world = worldMatrix(doc, id);
  const parentWorld = parent ? worldMatrix(doc, parent) : new Matrix4();
  const local = parentWorld.invert().multiply(world);
  let d = detach(doc, id);
  d = { ...d, nodes: { ...d.nodes, [id]: { ...d.nodes[id], matrix: local.toArray() } } };
  return attach(d, id, parent, index);
}

export function siblingsOf(doc: ProjectDoc, id: string): string[] {
  const n = doc.nodes[id];
  return n?.parent ? doc.nodes[n.parent].children : doc.roots;
}

export function groupNodes(doc: ProjectDoc, ids: string[], name = 'Group'): { doc: ProjectDoc; groupId: string | null } {
  const top = topmost(doc, ids);
  if (!top.length) return { doc, groupId: null };
  const first = doc.nodes[top[0]];
  const index = siblingsOf(doc, first.id).indexOf(first.id);
  const gid = uid('g');
  const group: SceneNode = {
    id: gid,
    name,
    importedName: name,
    parent: null,
    children: [],
    kind: 'group',
    matrix: IDENTITY,
    baseMatrix: IDENTITY,
    visible: true,
    locked: false,
    expanded: true,
    style: {},
  };
  let d: ProjectDoc = { ...doc, nodes: { ...doc.nodes, [gid]: group } };
  d = attach(d, gid, first.parent, Math.max(0, index));
  for (const id of top) d = reparent(d, id, gid);
  return { doc: d, groupId: gid };
}

/** Dissolve groups; children move to the group's parent and absorb its style overrides. */
export function ungroupNodes(doc: ProjectDoc, ids: string[]): { doc: ProjectDoc; released: string[] } {
  let d = doc;
  const released: string[] = [];
  for (const id of ids) {
    const g = d.nodes[id];
    if (!g || g.kind !== 'group') continue;
    let index = siblingsOf(d, id).indexOf(id);
    for (const c of [...g.children]) {
      if (Object.keys(g.style).length) d = setStyle(d, [c], { ...g.style, ...d.nodes[c].style });
      d = reparent(d, c, g.parent, ++index);
      released.push(c);
    }
    d = detach(d, id);
    const nodes = { ...d.nodes };
    delete nodes[id];
    d = { ...d, nodes };
  }
  return { doc: d, released };
}

export function deleteNodes(doc: ProjectDoc, ids: string[]): ProjectDoc {
  let d = doc;
  for (const id of topmost(doc, ids)) {
    const all = [id, ...descendants(d, id)];
    d = detach(d, id);
    const nodes = { ...d.nodes };
    for (const a of all) delete nodes[a];
    d = { ...d, nodes };
  }
  const used = new Set(Object.values(d.nodes).map((n) => n.geom?.model).filter(Boolean));
  const models = Object.fromEntries(Object.entries(d.models).filter(([k]) => used.has(k)));
  return { ...d, models };
}

function cloneSubtree(doc: ProjectDoc, id: string, parent: string | null, out: Record<string, SceneNode>): string {
  const n = doc.nodes[id];
  const nid = uid(n.kind === 'group' ? 'g' : 'm');
  const children = n.children.map((c) => cloneSubtree(doc, c, nid, out));
  out[nid] = { ...n, id: nid, parent, children };
  return nid;
}

export function duplicateNodes(doc: ProjectDoc, ids: string[]): { doc: ProjectDoc; created: string[] } {
  let d = doc;
  const created: string[] = [];
  for (const id of topmost(doc, ids)) {
    const src = d.nodes[id];
    const fresh: Record<string, SceneNode> = {};
    const nid = cloneSubtree(d, id, src.parent, fresh);
    fresh[nid] = { ...fresh[nid], name: `${src.name} copy` };
    d = { ...d, nodes: { ...d.nodes, ...fresh } };
    d = attach(d, nid, src.parent, siblingsOf(d, id).indexOf(id) + 1);
    created.push(nid);
  }
  return { doc: d, created };
}

/** Restore imported names, transforms and styling for nodes and their subtrees. */
export function resetToImported(doc: ProjectDoc, ids: string[]): ProjectDoc {
  const all = new Set<string>();
  for (const id of ids) {
    all.add(id);
    descendants(doc, id).forEach((x) => all.add(x));
  }
  return updateNodes(doc, [...all], (n) => ({ ...n, name: n.importedName, matrix: n.baseMatrix, style: { ...n.importedStyle } }));
}

/** Depth-first order of nodes currently visible in the tree (respecting expansion). */
export function visibleTreeOrder(doc: ProjectDoc): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    const n = doc.nodes[id];
    if (!n) return;
    out.push(id);
    if (n.expanded) n.children.forEach(walk);
  };
  doc.roots.forEach(walk);
  return out;
}
