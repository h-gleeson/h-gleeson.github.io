import { autoOffsets, chooseParts, effectiveAnchors, isZero } from '../state/explode';
import { descendants, isLockedInTree, topmost } from '../state/scene';
import { store, uid } from '../state/store';
import type { ExplodeSettings, ProjectDoc, Vec3 } from '../state/types';

const doc = () => store.get().doc;
const sel = () => store.get().ui.selection.filter((id) => doc().nodes[id]);

function setExplode(fn: (e: ExplodeSettings, d: ProjectDoc) => Partial<ExplodeSettings>, opts?: { history?: boolean; coalesce?: string }) {
  store.setDoc((d) => ({ ...d, explode: { ...d.explode, ...fn(d.explode, d) } }), opts);
}

let anim = 0;

/** Exploded-drawing commands. */
export const explodeActions = {
  setTool(tool: 'select' | 'move') {
    store.setUI({ tool });
  },
  toggleMoveTool() {
    const tool = store.get().ui.tool === 'move' ? 'select' : 'move';
    store.setUI({ tool });
    store.status(tool === 'move' ? 'Move tool: drag an arrow to move the selection along an axis, the square to move it in the view plane (W to exit)' : 'Select tool');
  },

  /** Arrange the parts of the selection (or of the model) automatically, using the current mode and spacing. */
  autoExplode() {
    const d = doc();
    const parts = chooseParts(d, sel());
    if (!parts.length) {
      store.status(sel().length === 1 ? 'Select a group with several parts, or several objects, to explode' : 'Nothing to explode: the model has a single part', 'error');
      return;
    }
    setExplode((e, d) => ({ parts, amount: 1, offsets: { ...e.offsets, ...autoOffsets(d, parts, e) } }));
    store.status(`Exploded ${parts.length} parts · ${parts.slice(0, 4).map((id) => d.nodes[id].name).join(', ')}${parts.length > 4 ? '…' : ''}`);
  },

  /** Change an arrangement setting; the parts of the last auto-explode follow live. */
  setParams(patch: Partial<Pick<ExplodeSettings, 'mode' | 'axis' | 'direction' | 'spacing' | 'scale'>>) {
    setExplode(
      (e, d) => {
        const next = { ...e, ...patch };
        const parts = e.parts.filter((id) => d.nodes[id]);
        return parts.length ? { ...patch, parts, amount: 1, offsets: { ...e.offsets, ...autoOffsets(d, parts, next) } } : patch;
      },
      { coalesce: `explode-${Object.keys(patch).join()}` },
    );
  },

  /** Connector and display settings. */
  set<K extends keyof ExplodeSettings>(key: K, value: ExplodeSettings[K]) {
    setExplode(() => ({ [key]: value }), { coalesce: `explode-${String(key)}` });
  },

  /** Blend assembled ↔ exploded. Animated; not part of undo (like the camera). */
  animateTo(target: number, ms = 450) {
    cancelAnimationFrame(anim);
    const from = doc().explode.amount;
    if (from === target) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setExplode(() => ({ amount: from + (target - from) * ease }), { history: false });
      if (k < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  },
  setAmount(amount: number) {
    cancelAnimationFrame(anim);
    setExplode(() => ({ amount }), { history: false });
  },
  toggleExploded() {
    const e = doc().explode;
    if (!Object.values(e.offsets).some((o) => !isZero(o))) {
      explodeActions.autoExplode();
      return;
    }
    explodeActions.animateTo(e.amount > 0.5 ? 0 : 1);
  },

  /** Move the selection's own offsets by a world-space delta (gizmo drags, nudges). */
  moveBy(ids: string[], delta: Vec3, coalesce?: string) {
    const d = doc();
    const targets = topmost(d, ids).filter((id) => !isLockedInTree(d, id));
    if (!targets.length) return;
    cancelAnimationFrame(anim);
    setExplode(
      (e) => {
        const offsets = { ...e.offsets };
        for (const id of targets) {
          const o = offsets[id] ?? [0, 0, 0];
          offsets[id] = [o[0] + delta[0], o[1] + delta[1], o[2] + delta[2]];
        }
        return { offsets, amount: 1 };
      },
      { coalesce },
    );
  },
  setOffset(id: string, value: Vec3) {
    setExplode((e) => ({ offsets: { ...e.offsets, [id]: value }, amount: 1 }), { coalesce: `offset-${id}` });
  },

  /** Put parts back: the selection and everything inside it, or everything. */
  reset(all = false): void {
    const d = doc();
    const ids = all ? null : new Set(sel().flatMap((id) => [id, ...descendants(d, id)]));
    if (ids && !ids.size) return explodeActions.reset(true);
    setExplode((e) => {
      const offsets: Record<string, Vec3> = {};
      if (ids) for (const [id, o] of Object.entries(e.offsets)) if (!ids.has(id)) offsets[id] = o;
      return { offsets, parts: ids ? e.parts.filter((p) => !ids.has(p)) : [] };
    });
    store.status(all || !ids ? 'All parts returned to the assembled position' : 'Selected parts returned to the assembled position');
  },

  // ---------------------------------------------------------- connector anchors
  addAnchor(id: string) {
    setExplode((e, d) => {
      const list = effectiveAnchors(d, id);
      // New anchors start at a corner of the top face, then the next corner, and so on.
      const corners: Vec3[] = [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]];
      const next = corners.find((c) => !list.some((a) => a.every((v, i) => Math.abs(v - c[i]) < 1e-6))) ?? [0.5, 0.5, 0.5];
      return { anchors: { ...e.anchors, [id]: [...list, next] } };
    });
  },
  setAnchor(id: string, index: number, u: Vec3, coalesce = true) {
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setExplode(
      (e, d) => {
        const list = [...effectiveAnchors(d, id)];
        list[index] = [clamp(u[0]), clamp(u[1]), clamp(u[2])];
        return { anchors: { ...e.anchors, [id]: list } };
      },
      coalesce ? { coalesce: `anchor-${id}-${index}` } : undefined,
    );
  },
  removeAnchor(id: string, index: number) {
    setExplode((e, d) => {
      const list = [...effectiveAnchors(d, id)];
      list.splice(index, 1);
      // An empty list means "no connectors" for this part.
      return { anchors: { ...e.anchors, [id]: list } };
    });
  },
  /** Turn the automatic (per-piece) connectors into explicit, editable anchors. */
  customiseAnchors(id: string) {
    setExplode((e, d) => ({ anchors: { ...e.anchors, [id]: effectiveAnchors(d, id) } }));
  },
  resetAnchors(id: string) {
    setExplode((e) => {
      const anchors = { ...e.anchors };
      delete anchors[id];
      return { anchors };
    });
  },

  // ---------------------------------------------------------- saved exploded states
  saveState(name?: string) {
    const e = doc().explode;
    const st = { id: uid('x'), name: name ?? `State ${e.states.length + 1}`, offsets: structuredClone(e.offsets), anchors: structuredClone(e.anchors) };
    setExplode((e) => ({ states: [...e.states, st] }));
    store.status(`Saved exploded state “${st.name}”`);
  },
  applyState(id: string) {
    const st = doc().explode.states.find((s) => s.id === id);
    if (!st) return;
    setExplode(() => ({ offsets: structuredClone(st.offsets), anchors: structuredClone(st.anchors), parts: [] }));
    explodeActions.animateTo(1);
    store.status(`Restored “${st.name}”`);
  },
  updateState(id: string) {
    setExplode((e) => ({ states: e.states.map((s) => (s.id === id ? { ...s, offsets: structuredClone(e.offsets), anchors: structuredClone(e.anchors) } : s)) }));
  },
  renameState(id: string, name: string) {
    if (!name.trim()) return;
    setExplode((e) => ({ states: e.states.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) }));
  },
  deleteState(id: string) {
    setExplode((e) => ({ states: e.states.filter((s) => s.id !== id) }));
  },
};
