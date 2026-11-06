import { Vector3 } from 'three';
import { basis } from '../engine/camera';
import { getEngine } from '../engine/engineRef';
import { applyPreset as applySizePreset, aspectOf, MAX_SIDE, SIZE_PRESETS } from '../state/output';
import { CAMERA_PRESETS } from '../state/defaults';
import { presetStyle, type StylePreset } from '../state/stylePresets';
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
import type { CameraState, DrawingSettings, GraphicStyle, OutputSettings, StyleKey } from '../state/types';

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
  /** Apply a drawing-style preset to the defaults and drawing settings. Object overrides stay unless asked. */
  applyStylePreset(p: StylePreset, clearOverrides = false) {
    const { defaults, drawing } = presetStyle(p);
    store.setDoc((d) => {
      let nodes = d.nodes;
      if (clearOverrides) {
        nodes = { ...d.nodes };
        for (const id in nodes) if (Object.keys(nodes[id].style).length) nodes[id] = { ...nodes[id], style: {} };
      }
      return { ...d, nodes, defaults, drawing: { ...d.drawing, ...drawing } };
    });
    const overrides = Object.values(doc().nodes).filter((n) => Object.keys(n.style).length).length;
    store.status(`Applied “${p.name}”${!clearOverrides && overrides ? ` · ${overrides} object${overrides > 1 ? 's keep their' : ' keeps its'} own overrides` : ''}`);
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

  // ---------------------------------------------------------- drawing frame & output
  setOutput(patch: Partial<OutputSettings>, coalesce = Object.keys(patch).join()) {
    store.setDoc((d) => ({ ...d, output: { ...d.output, ...patch } }), { coalesce: `output-${coalesce}` });
  },
  applySizePreset(id: string) {
    store.setDoc((d) => ({ ...d, output: applySizePreset(d.output, id) }));
  },
  setDpi(dpi: number) {
    store.setDoc((d) => {
      const isPaper = SIZE_PRESETS.find((p) => p.id === d.output.preset)?.group === 'paper';
      return { ...d, output: isPaper ? applySizePreset(d.output, d.output.preset, dpi) : { ...d.output, dpi } };
    });
  },
  /** Edit one side; with the aspect locked the other side follows. */
  setOutputSide(side: 'width' | 'height', value: number) {
    const v = Math.max(16, Math.min(MAX_SIDE, Math.round(value)));
    store.setDoc(
      (d) => {
        const o = d.output;
        const a = aspectOf(o);
        const next = side === 'width' ? { width: v, height: o.lockAspect ? Math.max(16, Math.round(v / a)) : o.height } : { height: v, width: o.lockAspect ? Math.max(16, Math.round(v * a)) : o.width };
        // A locked aspect keeps paper/screen proportions; only the pixel count changes, so keep the preset name.
        return { ...d, output: { ...o, ...next, preset: o.lockAspect ? o.preset : 'custom' } };
      },
      { coalesce: `output-size-${side}` },
    );
  },
  swapOrientation() {
    store.setDoc((d) => {
      const o = d.output;
      const id = o.preset.endsWith('L') ? o.preset.slice(0, -1) + 'P' : o.preset.endsWith('P') ? o.preset.slice(0, -1) + 'L' : 'custom';
      const known = SIZE_PRESETS.some((p) => p.id === id);
      return { ...d, output: { ...o, width: o.height, height: o.width, preset: known ? id : 'custom' } };
    });
  },
  /**
   * Crop by moving frame edges. Deltas are in viewport CSS pixels, positive
   * right/down. The drawing stays where it is on the sheet: the camera target
   * moves by half the change, and pixel density is kept so the output grows or
   * shrinks with the crop.
   */
  cropFrame(edges: { left?: number; right?: number; top?: number; bottom?: number }) {
    const engine = getEngine();
    if (!engine) return;
    store.setDoc((d) => {
      const c = d.camera, o = d.output;
      const wpp = c.height / engine.frame.h;
      const worldW0 = c.height * aspectOf(o);
      const dl = (edges.left ?? 0) * wpp, dr = (edges.right ?? 0) * wpp;
      const dt = (edges.top ?? 0) * wpp, db = (edges.bottom ?? 0) * wpp;
      const minWorld = c.height * 0.05;
      const worldW = Math.max(minWorld, worldW0 - dl + dr);
      const worldH = Math.max(minWorld, c.height + dt * -1 + db);
      const { right, up } = basis(c);
      // Centre moves by the mean of the two edges' movements (y is down on screen).
      const shiftX = (dl + dr) / 2;
      const shiftY = -(dt + db) / 2;
      const t = new Vector3(...c.target).addScaledVector(right, shiftX).addScaledVector(up, shiftY);
      const pxPerWorld = o.width / worldW0;
      const width = Math.max(16, Math.min(MAX_SIDE, Math.round(worldW * pxPerWorld)));
      const height = Math.max(16, Math.min(MAX_SIDE, Math.round(worldH * pxPerWorld)));
      return {
        ...d,
        // In perspective, widen the field of view instead of dollying, so the crop never changes the perspective.
        camera: {
          ...c,
          height: worldH,
          target: [t.x, t.y, t.z],
          fov: c.projection === "persp" ? (2 * Math.atan(Math.tan((c.fov * Math.PI) / 360) * (worldH / c.height)) * 180) / Math.PI : c.fov,
        },
        output: { ...o, width, height, preset: 'custom', lockAspect: false },
      };
    });
  },
  /** Make lineweights literal pixels at the current output size. */
  matchReferenceToOutput() {
    store.setDoc((d) => ({ ...d, drawing: { ...d.drawing, referenceWidth: d.output.width } }));
    store.status(`Lineweights now mean exact pixels in a ${store.get().doc.output.width}px-wide export`);
  },

  // ---------------------------------------------------------- saved views
  saveView(name?: string) {
    const d = doc();
    const thumb = getEngine()?.thumbnail();
    const v = { id: uid('v'), name: name?.trim() || `View ${d.views.length + 1}`, camera: structuredClone(d.camera), section: structuredClone(d.section), thumb };
    store.setDoc((x) => ({ ...x, views: [...x.views, v] }));
    store.status(`Saved “${v.name}”`);
  },
  applyView(id: string) {
    const v = doc().views.find((x) => x.id === id);
    if (!v) return;
    actions.setCamera(structuredClone(v.camera), true);
    // Views saved with a section bring their cut back (and views saved without one turn it off).
    if (v.section) store.setDoc((d) => ({ ...d, section: structuredClone(v.section!) }));
  },
  updateView(id: string) {
    const thumb = getEngine()?.thumbnail();
    store.setDoc((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, camera: structuredClone(d.camera), section: structuredClone(d.section), thumb } : v)) }));
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
