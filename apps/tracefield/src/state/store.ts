import { useRef, useSyncExternalStore } from 'react';
import { createDoc } from './defaults';
import type { ProjectDoc, UIState } from './types';

/**
 * A small immutable store. `doc` is the saved, undoable project; `ui` is
 * transient session state. History holds whole-document snapshots, which is
 * cheap because edits share structure with the previous snapshot.
 *
 * Camera navigation is deliberately *not* undoable: undo/redo keep the current
 * camera so stepping back through edits never throws the view around.
 */

export interface StoreState {
  doc: ProjectDoc;
  ui: UIState;
  past: ProjectDoc[];
  future: ProjectDoc[];
}

export interface SetDocOptions {
  /** false = do not record an undo step (live drags, camera moves). */
  history?: boolean;
  /** Consecutive edits with the same key within a short window merge into one step. */
  coalesce?: string;
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 800;

const initialUI: UIState = {
  selection: [],
  selectionAnchor: null,
  isolated: null,
  renaming: null,
  busy: null,
  status: null,
  restoreAvailable: false,
  fitRequest: 0,
  tool: 'select',
  matchSource: null,
  matchGroups: { fill: true, lines: true, hatch: true, shadows: true, cut: true },
  label: null,
  sectionHandle: true,
  stats: { objects: 0, triangles: 0, edges: 0 },
};

let state: StoreState = { doc: createDoc(), ui: initialUI, past: [], future: [] };
const listeners = new Set<() => void>();
let lastCoalesce: string | null = null;
let lastCoalesceAt = 0;

function emit() {
  for (const l of listeners) l();
}

function pruneSelection(s: StoreState): StoreState {
  const sel = s.ui.selection.filter((id) => s.doc.nodes[id]);
  return sel.length === s.ui.selection.length ? s : { ...s, ui: { ...s.ui, selection: sel } };
}

export const store = {
  get: () => state,

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  setDoc(fn: (doc: ProjectDoc) => ProjectDoc, opts: SetDocOptions = {}) {
    const prev = state.doc;
    const next = fn(prev);
    if (next === prev) return;
    const record = opts.history !== false;
    let past = state.past;
    if (record) {
      const now = performance.now();
      const merge = opts.coalesce && opts.coalesce === lastCoalesce && now - lastCoalesceAt < COALESCE_MS;
      if (!merge) past = [...past, prev].slice(-HISTORY_LIMIT);
      lastCoalesce = opts.coalesce ?? null;
      lastCoalesceAt = now;
    }
    state = pruneSelection({ ...state, doc: next, past, future: record ? [] : state.future });
    emit();
  },

  /** Replace the document wholesale (open project, new project). Clears history. */
  resetDoc(doc: ProjectDoc) {
    state = { doc, past: [], future: [], ui: { ...state.ui, selection: [], selectionAnchor: null, isolated: null, renaming: null } };
    emit();
  },

  setUI(patch: Partial<UIState> | ((ui: UIState) => Partial<UIState>)) {
    const p = typeof patch === 'function' ? patch(state.ui) : patch;
    state = { ...state, ui: { ...state.ui, ...p } };
    emit();
  },

  /** Break coalescing so the next edit starts a fresh undo step. */
  commit() {
    lastCoalesce = null;
  },

  undo() {
    const prev = state.past[state.past.length - 1];
    if (!prev) return;
    const cur = state.doc;
    state = pruneSelection({
      ...state,
      doc: { ...prev, camera: cur.camera },
      past: state.past.slice(0, -1),
      future: [cur, ...state.future],
    });
    lastCoalesce = null;
    emit();
  },

  redo() {
    const [next, ...rest] = state.future;
    if (!next) return;
    const cur = state.doc;
    state = pruneSelection({ ...state, doc: { ...next, camera: cur.camera }, past: [...state.past, cur], future: rest });
    lastCoalesce = null;
    emit();
  },

  status(text: string, kind: 'info' | 'error' = 'info') {
    store.setUI({ status: { text, kind } });
  },
};

/** Subscribe a component to a slice of the store. Return values must be stable references. */
export function useStore<T>(selector: (s: StoreState) => T): T {
  const ref = useRef(selector);
  ref.current = selector;
  return useSyncExternalStore(store.subscribe, () => ref.current(state));
}

let idCounter = 0;
export function uid(prefix = 'n'): string {
  idCounter++;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
