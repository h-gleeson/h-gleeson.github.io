import { Vector3 } from 'three';
import { getEngine } from '../engine/engineRef';
import { chooseParts, explodedBox } from '../state/explode';
import { descendants, topmost } from '../state/scene';
import { store, uid } from '../state/store';
import type { Annotation, AnnotationSettings, ProjectDoc } from '../state/types';

const doc = () => store.get().doc;

function setAnn(fn: (d: ProjectDoc) => Partial<ProjectDoc['annotations']>, opts?: { history?: boolean; coalesce?: string }) {
  store.setDoc((d) => ({ ...d, annotations: { ...d.annotations, ...fn(d) } }), opts);
}

/**
 * A new label for a node: anchored on its visible surface (the point under the
 * centre of its box, if the object is there) and placed a little way out from
 * the model, on the side of the frame it is on.
 */
function makeLabel(d: ProjectDoc, id: string, index: number): Annotation | null {
  const engine = getEngine();
  if (!engine || !engine.isNodeShown(id)) return null;
  const box = explodedBox(d, id);
  if (box.isEmpty()) return null;
  const centre = box.getCenter(new Vector3());
  let world = centre;
  const p = engine.project(centre);
  const rect = engine.canvas.getBoundingClientRect();
  const hit = engine.pickPoint(rect.left + p.x, rect.top + p.y);
  const subtree = new Set([id, ...descendants(d, id)]);
  if (hit && subtree.has(hit.id)) world = hit.point;
  const anchor = engine.toNodeLocal(id, world);
  if (!anchor) return null;
  const f = engine.frame;
  const ax = (p.x - f.x) / f.w, ay = (p.y - f.y) / f.h;
  const side = ax < 0.5 ? -1 : 1;
  const k = f.w / d.drawing.referenceWidth;
  const dx = (70 * k) / f.w, dy = ((-36 - (index % 3) * 14) * k) / f.h;
  const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
  return { id: uid('a'), node: id, text: null, anchor, pos: [clamp(ax + side * dx), clamp(ay + dy)] };
}

export const annotateActions = {
  /** Label the selection, or with nothing selected, the model's main parts. Objects already labelled are skipped. */
  labelSelection() {
    const d = doc();
    const sel = store.get().ui.selection.filter((id) => d.nodes[id]);
    const ids = sel.length ? topmost(d, sel) : chooseParts(d, []);
    const have = new Set(d.annotations.items.map((a) => a.node));
    const fresh = ids.filter((id) => !have.has(id)).map((id, i) => makeLabel(d, id, i)).filter((a): a is Annotation => !!a);
    if (!fresh.length) {
      store.status(ids.length ? 'Those objects are already labelled (or hidden)' : 'Select objects to label', 'error');
      return;
    }
    // Start new labels in tidy columns beside the model (as "Both sides" would place them), then free to drag.
    const engine = getEngine()!;
    if (d.annotations.settings.layout === 'free') {
      const f = engine.frame;
      const trial: ProjectDoc = { ...d, annotations: { settings: { ...d.annotations.settings, layout: 'both' }, items: fresh } };
      const project = (v: Vector3): [number, number] | null => {
        const q = engine.project(v);
        return q.behind ? null : [q.x - f.x, q.y - f.y];
      };
      const { positions } = engine.layoutLabels(project, f.w, f.h, trial);
      fresh.forEach((a) => positions[a.id] && (a.pos = positions[a.id]));
    }
    setAnn((d) => ({ items: [...d.annotations.items, ...fresh] }));
    store.setUI({ label: fresh[fresh.length - 1].id });
    store.status(`Added ${fresh.length} label${fresh.length > 1 ? 's' : ''} · drag text to place, drag the dot to re-anchor`);
  },
  select(id: string | null) {
    if (store.get().ui.label !== id) store.setUI({ label: id });
  },
  update(id: string, patch: Partial<Annotation>, coalesce?: string) {
    setAnn((d) => ({ items: d.annotations.items.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), coalesce ? { coalesce } : undefined);
  },
  /** Clear a per-label override so it follows the drawing's label style again. */
  clearOverride(id: string, key: 'size' | 'weight' | 'color') {
    setAnn((d) => ({ items: d.annotations.items.map((a) => (a.id === id ? (({ [key]: _, ...rest }) => rest as Annotation)(a) : a)) }));
  },
  remove(id: string) {
    setAnn((d) => ({ items: d.annotations.items.filter((a) => a.id !== id) }));
    if (store.get().ui.label === id) store.setUI({ label: null });
  },
  clearAll() {
    setAnn(() => ({ items: [] }));
    store.setUI({ label: null });
  },
  set<K extends keyof AnnotationSettings>(key: K, value: AnnotationSettings[K]) {
    setAnn((d) => ({ settings: { ...d.annotations.settings, [key]: value } }), { coalesce: `labels-${String(key)}` });
  },
  /** Freeze an automatic (column) layout into free positions, so labels can be dragged individually. */
  bake(positions: Record<string, [number, number]>) {
    setAnn((d) => ({
      settings: { ...d.annotations.settings, layout: 'free' },
      items: d.annotations.items.map((a) => (positions[a.id] ? { ...a, pos: positions[a.id] } : a)),
    }));
  },
  /** Order of labels (the numbering in key mode). */
  move(id: string, delta: -1 | 1) {
    setAnn((d) => {
      const items = [...d.annotations.items];
      const i = items.findIndex((a) => a.id === id), j = i + delta;
      if (i < 0 || j < 0 || j >= items.length) return {};
      [items[i], items[j]] = [items[j], items[i]];
      return { items };
    });
  },
};
