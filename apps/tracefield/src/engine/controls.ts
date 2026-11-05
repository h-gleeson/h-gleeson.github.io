import { Vector3 } from 'three';
import { store } from '../state/store';
import { basis } from './camera';
import type { Engine } from './Engine';

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Viewport navigation.
 *  Left drag: orbit · Right / middle / Shift+left drag: pan · Wheel: zoom at cursor
 *  Click: select object · Ctrl/Shift+click: add/remove · Alt+click: select its parent group
 */
export function attachControls(engine: Engine): () => void {
  const el = engine.canvas;
  let mode: 'none' | 'orbit' | 'pan' = 'none';
  let startX = 0, startY = 0, lastX = 0, lastY = 0, moved = false, button = 0;

  const down = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    moved = false;
    button = e.button;
    // Shift+drag pans; Shift+click (no movement) still adds to the selection.
    mode = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey) ? 'pan' : e.button === 0 ? 'orbit' : 'none';
  };

  const move = (e: PointerEvent) => {
    if (mode === 'none') return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
    moved = true;
    el.style.cursor = mode === 'pan' ? 'grabbing' : 'move';
    const c = store.get().doc.camera;
    if (mode === 'orbit') {
      if (c.locked) {
        store.status('View is locked — unlock (Shift+L) to orbit. Pan and zoom still work.');
        mode = 'pan';
        return;
      }
      const azimuth = (((c.azimuth - dx * 0.35) % 360) + 360) % 360;
      // Oblique drawings keep their elevation; orbiting only turns the plan.
      const elevation = c.oblique.enabled && c.projection === 'ortho' ? c.elevation : Math.max(-90, Math.min(90, c.elevation + dy * 0.35));
      store.setDoc((d) => ({ ...d, camera: { ...d.camera, azimuth: round(azimuth), elevation: round(elevation), preset: null } }), { history: false });
    } else {
      const wpp = engine.worldPerPixel(c);
      const { right, up } = basis(c);
      const t = new Vector3(...c.target).addScaledVector(right, -dx * wpp).addScaledVector(up, dy * wpp);
      store.setDoc((d) => ({ ...d, camera: { ...d.camera, target: [t.x, t.y, t.z] } }), { history: false });
    }
  };

  const up = (e: PointerEvent) => {
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.style.cursor = '';
    const wasClick = !moved && button === 0;
    mode = 'none';
    if (!wasClick) return;
    const { doc, ui } = store.get();
    let id = engine.pick(e.clientX, e.clientY);
    if (id && e.altKey) id = doc.nodes[id]?.parent ?? id;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!id) {
      if (!additive) store.setUI({ selection: [], selectionAnchor: null });
      return;
    }
    const sel = additive ? (ui.selection.includes(id) ? ui.selection.filter((s) => s !== id) : [...ui.selection, id]) : [id];
    // Reveal the picked node in the tree.
    const ancestorsToOpen: string[] = [];
    let p = doc.nodes[id]?.parent;
    while (p) {
      if (!doc.nodes[p].expanded) ancestorsToOpen.push(p);
      p = doc.nodes[p].parent;
    }
    if (ancestorsToOpen.length)
      store.setDoc((d) => {
        const nodes = { ...d.nodes };
        for (const a of ancestorsToOpen) nodes[a] = { ...nodes[a], expanded: true };
        return { ...d, nodes };
      }, { history: false });
    store.setUI({ selection: sel, selectionAnchor: id });
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const c = store.get().doc.camera;
    const factor = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = -(e.clientY - rect.top - rect.height / 2);
    const wpp = engine.worldPerPixel(c);
    const next = wpp * factor;
    const { right, up } = basis(c);
    // Keep the point under the cursor fixed while zooming.
    const t = new Vector3(...c.target).addScaledVector(right, mx * (wpp - next)).addScaledVector(up, my * (wpp - next));
    store.setDoc((d) => ({ ...d, camera: { ...d.camera, height: Math.max(1e-6, c.height * factor), target: [t.x, t.y, t.z] } }), { history: false });
  };

  const menu = (e: Event) => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', menu);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', menu);
  };
}
