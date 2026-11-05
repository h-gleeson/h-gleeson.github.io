import { CAMERA_PRESETS } from '../state/defaults';
import { store } from '../state/store';
import { newProject, saveProject } from '../project/projectFile';
import { exportPNG } from '../project/exportImage';
import { actions } from './actions';

export interface Shortcut {
  keys: string;
  label: string;
}

/** Listed in the help panel; tooltips show the same keys. */
export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: 'File',
    items: [
      { keys: 'Ctrl+I', label: 'Import model' },
      { keys: 'Ctrl+O', label: 'Open project' },
      { keys: 'Ctrl+S', label: 'Save project' },
      { keys: 'Ctrl+E', label: 'Export PNG' },
      { keys: 'Ctrl+Z / Ctrl+Shift+Z', label: 'Undo / redo' },
    ],
  },
  {
    group: 'Scene',
    items: [
      { keys: 'Click · Ctrl+click · Shift+click', label: 'Select · add · range (tree)' },
      { keys: 'Alt+click', label: 'Select parent group (viewport)' },
      { keys: 'P', label: 'Select parent' },
      { keys: 'Ctrl+A / Esc', label: 'Select all / clear' },
      { keys: 'F2 or double-click', label: 'Rename' },
      { keys: 'Ctrl+G / Ctrl+Shift+G', label: 'Group / ungroup' },
      { keys: 'Ctrl+D / Del', label: 'Duplicate / delete' },
      { keys: 'H / Alt+H', label: 'Hide · show / show all' },
      { keys: 'I', label: 'Isolate selection' },
      { keys: 'L', label: 'Lock / unlock selection' },
    ],
  },
  {
    group: 'View',
    items: [
      { keys: 'Left drag', label: 'Orbit' },
      { keys: 'Right / middle / Shift drag', label: 'Pan' },
      { keys: 'Wheel', label: 'Zoom at cursor' },
      { keys: 'F / Shift+F', label: 'Fit all / fit selection' },
      { keys: '1 – 9', label: 'Projection presets' },
      { keys: 'O', label: 'Parallel ↔ perspective' },
      { keys: 'Shift+L', label: 'Lock view orientation' },
      { keys: 'Shift+V', label: 'Save current view' },
      { keys: 'G', label: 'Ground grid' },
      { keys: '?', label: 'This list' },
    ],
  },
];

export function installShortcuts(handlers: { openImport: () => void; openProject: () => void; toggleHelp: () => void }) {
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    if (mod) {
      if (k === 'z') return run(e.shiftKey ? store.redo : store.undo);
      if (k === 'y') return run(store.redo);
      if (k === 's') return run(saveProject);
      if (k === 'e') return run(exportPNG);
      if (k === 'o') return run(handlers.openProject);
      if (k === 'i') return run(handlers.openImport);
      if (k === 'g') return run(e.shiftKey ? actions.ungroup : actions.group);
      if (k === 'd') return run(actions.duplicate);
      if (k === 'a') return run(actions.selectAll);
      if (k === 'n' && e.altKey) return run(newProject);
      return;
    }
    if (e.altKey && k === 'h') return run(actions.showAll);
    if (e.altKey) return;
    if (k === 'delete' || k === 'backspace') return run(actions.delete);
    if (k === 'escape') {
      if (store.get().ui.isolated) return run(() => store.setUI({ isolated: null }));
      return run(actions.clearSelection);
    }
    if (k === 'f2') {
      const s = store.get().ui.selection;
      if (s.length === 1) run(() => store.setUI({ renaming: s[0] }));
      return;
    }
    if (k === 'f') return run(e.shiftKey ? actions.fitSelection : actions.fitAll);
    if (k === 'h') return run(() => actions.toggleHidden());
    if (k === 'i') return run(actions.isolate);
    if (k === 'l') return run(e.shiftKey ? actions.toggleViewLock : () => actions.toggleLock());
    if (k === 'p') return run(actions.selectParent);
    if (k === 'o') return run(actions.toggleProjection);
    if (k === 'g') return run(() => actions.setDrawing('showGrid', !store.get().doc.drawing.showGrid));
    if (k === 'v' && e.shiftKey) return run(() => actions.saveView());
    if (e.key === '?') return run(handlers.toggleHelp);
    const preset = CAMERA_PRESETS.find((p) => p.key === e.key);
    if (preset) return run(() => actions.applyPreset(preset.id));
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
