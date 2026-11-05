import { getEngine } from '../engine/engineRef';
import { CAMERA_PRESETS } from '../state/defaults';
import {
  deleteNodes,
  descendants,
  duplicateNodes,
  groupNodes,
  patchNodes,
  reparent,
  resetToImported,
  setStyle,
  topmost,
  ungroupNodes,
  visibleTreeOrder,
} from '../state/scene';
import { store, uid } from '../state/store';
import type { CameraState, DrawingSettings, GraphicStyle, StyleKey } from '../state/types';

const sel = () => store.get().ui.selection;
const doc = () => store.get().doc;

/** Every user-facing command. UI components and keyboard shortcuts call these. */
export const actions = {
  // ---------------------------------------------------------- selection
  select(ids: string[], anchor?: string) {
    store.setUI({ selection: ids, selectionAnchor: anchor ?? ids[ids.length - 1] ?? null });
  },
  /** Tree click semantics: plain, Ctrl toggle, Shift range. */
  clickInTree(id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    const { ui } = store.get();
    if (e.shiftKey && ui.selectionAnchor) {
      const order = visibleTreeOrder(doc());
      const a = order.indexOf(ui.selectionAnchor), b = order.indexOf(id);
      if (a >= 0 && b >= 0) {
        const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
        store.setUI({ selection: [...new Set([...(e.ctrlKey || e.metaKey ? ui.selection : []), ...range])] });
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      store.setUI({ selection: ui.selection.includes(id) ? ui.selection.filter((s) => s !== id) : [...ui.selection, id], selectionAnchor: id });
      return;
    }
    store.setUI({ selection: [id], selectionAnchor: id });
  },
  selectAll() {
    store.setUI({ selection: [...doc().roots], selectionAnchor: null });
  },
  clearSelection() {
    store.setUI({ selection: [], selectionAnchor: null });
  },
  selectParent() {
    const d = doc();
    const parents = [...new Set(sel().map((id) => d.nodes[id]?.parent).filter((p): p is string => !!p))];
    if (parents.length) store.setUI({ selection: parents, selectionAnchor: parents[0] });
  },
  selectChildren() {
    const d = doc();
    const kids = sel().flatMap((id) => d.nodes[id]?.children ?? []);
    if (kids.length) {
      store.setDoc((x) => patchNodes(x, sel(), { expanded: true }), { history: false });
      store.setUI({ selection: kids, selectionAnchor: kids[0] });
    }
  },

  // ---------------------------------------------------------- structure
  group() {
    const ids = sel();
    if (!ids.length) return;
    let gid: string | null = null;
    store.setDoc((d) => {
      const r = groupNodes(d, ids);
      gid = r.groupId;
      return r.doc;
    });
    if (gid) store.setUI({ selection: [gid], selectionAnchor: gid, renaming: gid });
  },
  ungroup() {
    const ids = sel().filter((id) => doc().nodes[id]?.kind === 'group');
    if (!ids.length) return store.status('Select a group to ungroup');
    let released: string[] = [];
    store.setDoc((d) => {
      const r = ungroupNodes(d, ids);
      released = r.released;
      return r.doc;
    });
    store.setUI({ selection: released });
  },
  duplicate() {
    const ids = sel();
    if (!ids.length) return;
    let created: string[] = [];
    store.setDoc((d) => {
      const r = duplicateNodes(d, ids);
      created = r.created;
      return r.doc;
    });
    store.setUI({ selection: created, selectionAnchor: created[0] ?? null });
  },
  delete() {
    const ids = sel();
    if (!ids.length) return;
    const n = topmost(doc(), ids).length;
    store.setDoc((d) => deleteNodes(d, ids));
    store.setUI({ selection: [], selectionAnchor: null, isolated: null });
    store.status(`Deleted ${n} item${n > 1 ? 's' : ''} — Ctrl+Z to undo`);
  },
  rename(id: string, name: string) {
    const v = name.trim();
    if (v && v !== doc().nodes[id]?.name) store.setDoc((d) => patchNodes(d, [id], { name: v }));
    store.setUI({ renaming: null });
  },
  setNodeMatrix(id: string, matrix: number[]) {
    store.setDoc((d) => patchNodes(d, [id], { matrix }), { coalesce: `move-${id}` });
  },
  reparent(id: string, parent: string | null, index?: number) {
    store.setDoc((d) => reparent(d, id, parent, index));
  },
  setExpanded(id: string, expanded: boolean, recursive = false) {
    const ids = recursive ? [id, ...descendants(doc(), id)] : [id];
    store.setDoc((d) => patchNodes(d, ids, { expanded }), { history: false });
  },

  // ---------------------------------------------------------- visibility & locking
  toggleHidden(ids = sel()) {
    if (!ids.length) return;
    const anyVisible = ids.some((id) => doc().nodes[id]?.visible);
    store.setDoc((d) => patchNodes(d, ids, { visible: !anyVisible }));
  },
  setVisible(ids: string[], visible: boolean) {
    store.setDoc((d) => patchNodes(d, ids, { visible }));
  },
  showAll() {
    store.setDoc((d) => patchNodes(d, Object.keys(d.nodes), { visible: true }));
    store.setUI({ isolated: null });
  },
  toggleLock(ids = sel()) {
    if (!ids.length) return;
    const anyUnlocked = ids.some((id) => !doc().nodes[id]?.locked);
    store.setDoc((d) => patchNodes(d, ids, { locked: anyUnlocked }));
    store.status(anyUnlocked ? 'Locked — not selectable in the viewport' : 'Unlocked');
  },
  isolate() {
    const { ui } = store.get();
    if (ui.isolated) store.setUI({ isolated: null });
    else if (ui.selection.length) store.setUI({ isolated: [...ui.selection] });
    else store.status('Select something to isolate');
  },

  // ---------------------------------------------------------- styles
  /** Edit a style property: overrides on the selection, or the drawing defaults if nothing is selected. */
  setStyle<K extends StyleKey>(key: K, value: GraphicStyle[K]) {
    const ids = sel();
    if (ids.length) store.setDoc((d) => setStyle(d, ids, { [key]: value }), { coalesce: `style-${key}-${ids.join()}` });
    else store.setDoc((d) => ({ ...d, defaults: { ...d.defaults, [key]: value } }), { coalesce: `defaults-${key}` });
  },
  clearStyle(key: StyleKey) {
    store.setDoc((d) => setStyle(d, sel(), { [key]: undefined }));
  },
  clearAllOverrides() {
    store.setDoc((d) => setStyle(d, sel(), Object.fromEntries(Object.keys(d.defaults).map((k) => [k, undefined]))));
  },
  resetToImported() {
    const ids = sel();
    if (!ids.length) return;
    store.setDoc((d) => resetToImported(d, ids));
    store.status('Restored imported names, positions and materials');
  },
  setDrawing<K extends keyof DrawingSettings>(key: K, value: DrawingSettings[K]) {
    store.setDoc((d) => ({ ...d, drawing: { ...d.drawing, [key]: value } }), { coalesce: `drawing-${String(key)}` });
  },

  // ---------------------------------------------------------- camera
  setCamera(patch: Partial<CameraState>, history = false) {
    store.setDoc((d) => ({ ...d, camera: { ...d.camera, ...patch } }), { history });
  },
  applyPreset(id: string) {
    const p = CAMERA_PRESETS.find((x) => x.id === id);
    if (!p) return;
    const c = doc().camera;
    if (c.locked) return store.status('View is locked — unlock (Shift+L) to change orientation');
    // Oblique drawings are parallel projections by definition.
    const projection = p.camera.oblique.enabled ? 'ortho' : c.projection;
    actions.setCamera({ ...structuredClone(p.camera), projection, preset: p.id });
    requestAnimationFrame(() => getEngine()?.fit());
  },
  toggleProjection() {
    const c = doc().camera;
    if (c.projection === 'ortho' && c.oblique.enabled) {
      actions.setCamera({ projection: 'persp', oblique: { ...c.oblique, enabled: false }, preset: null });
      store.status('Perspective has no oblique mode; switched to a regular perspective of the same orientation');
    } else actions.setCamera({ projection: c.projection === 'ortho' ? 'persp' : 'ortho' });
  },
  toggleViewLock() {
    const locked = !doc().camera.locked;
    actions.setCamera({ locked });
    store.status(locked ? 'View orientation locked' : 'View orientation unlocked');
  },
  fitAll() {
    getEngine()?.fit();
  },
  fitSelection() {
    const ids = sel();
    if (ids.length) getEngine()?.fit(ids);
    else getEngine()?.fit();
  },

  // ---------------------------------------------------------- saved views
  saveView(name?: string) {
    const d = doc();
    const thumb = getEngine()?.thumbnail();
    const v = { id: uid('v'), name: name?.trim() || `View ${d.views.length + 1}`, camera: structuredClone(d.camera), thumb };
    store.setDoc((x) => ({ ...x, views: [...x.views, v] }));
    store.status(`Saved “${v.name}”`);
  },
  applyView(id: string) {
    const v = doc().views.find((x) => x.id === id);
    if (v) actions.setCamera(structuredClone(v.camera), true);
  },
  updateView(id: string) {
    const thumb = getEngine()?.thumbnail();
    store.setDoc((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, camera: structuredClone(d.camera), thumb } : v)) }));
    store.status('View updated to the current camera');
  },
  renameView(id: string, name: string) {
    if (!name.trim()) return;
    store.setDoc((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)) }));
  },
  deleteView(id: string) {
    store.setDoc((d) => ({ ...d, views: d.views.filter((v) => v.id !== id) }));
  },
  moveView(id: string, dir: -1 | 1) {
    store.setDoc((d) => {
      const i = d.views.findIndex((v) => v.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.views.length) return d;
      const views = [...d.views];
      [views[i], views[j]] = [views[j], views[i]];
      return { ...d, views };
    });
  },
};
