import { DEFAULT_EFFECTS, EFFECT_PRESETS, NO_LOOK, presetEffects, type EffectLook, type Effects, type EffectsSettings } from '../state/effects';
import { descendants, resolveStyle, setStyle } from '../state/scene';
import { store, uid } from '../state/store';
import type { ProjectDoc } from '../state/types';

/** 'drawing' edits the whole-drawing look; anything else is a layer look's id. */
export type LookRef = 'drawing' | string;

const doc = () => store.get().doc;

function setEffects(fn: (e: Effects, d: ProjectDoc) => Effects, opts?: { coalesce?: string }) {
  store.setDoc((d) => ({ ...d, effects: fn(d.effects, d) }), opts);
}

/** Apply a change to one look. */
function updateLook(e: Effects, ref: LookRef, fn: (l: EffectsSettings) => EffectsSettings): Effects {
  if (ref === 'drawing') return { ...e, drawing: fn(e.drawing) };
  return { ...e, looks: e.looks.map((l) => (l.id === ref ? ({ ...l, ...fn(l) } as EffectLook) : l)) };
}

export function lookSettings(e: Effects, ref: LookRef): EffectsSettings | null {
  return ref === 'drawing' ? e.drawing : e.looks.find((l) => l.id === ref) ?? null;
}

/** Image-effect commands. */
export const effectsActions = {
  /** Edit one setting of a look. Editing switches the effects on. */
  set<K extends keyof EffectsSettings>(ref: LookRef, key: K, value: EffectsSettings[K]) {
    setEffects((e) => ({ ...updateLook(e, ref, (l) => ({ ...l, [key]: value })), enabled: true }), { coalesce: `fx-${ref}-${String(key)}` });
  },
  toggle() {
    const on = !doc().effects.enabled;
    setEffects((e) => ({ ...e, enabled: on }));
    store.status(on ? 'Image effects on (Shift+X to toggle)' : 'Image effects off');
  },
  applyPreset(ref: LookRef, id: string) {
    const p = EFFECT_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setEffects((e) => ({ ...updateLook(e, ref, () => presetEffects(p)), enabled: true }));
    store.status(`Look “${p.name}” — Ctrl+Z to undo`);
  },
  reset(ref: LookRef) {
    setEffects((e) => updateLook(e, ref, () => ({ ...DEFAULT_EFFECTS })));
  },

  // ---------------------------------------------------------- layer looks
  /** A new layer look, given to the selected objects / layers if there are any. Returns its id. */
  newLook(fromSelection = true): string {
    const id = uid();
    const n = doc().effects.looks.length + 1;
    let name = `Look ${n}`;
    while (doc().effects.looks.some((l) => l.name === name)) name += '′';
    const look: EffectLook = { ...presetEffects(EFFECT_PRESETS[0]), id, name };
    const sel = fromSelection ? store.get().ui.selection.filter((x) => doc().nodes[x]) : [];
    store.setDoc((d) => {
      let next: ProjectDoc = { ...d, effects: { ...d.effects, enabled: true, looks: [...d.effects.looks, look] } };
      if (sel.length) next = assign(next, sel, id);
      return next;
    });
    store.status(sel.length ? `${name} applies to ${describe(sel)}` : `${name} created. Select layers and add them to it.`);
    return id;
  },
  duplicateLook(ref: string): string | null {
    const src = doc().effects.looks.find((l) => l.id === ref);
    if (!src) return null;
    const id = uid();
    setEffects((e) => {
      const i = e.looks.findIndex((l) => l.id === ref);
      const looks = [...e.looks];
      looks.splice(i + 1, 0, { ...src, id, name: `${src.name} copy` });
      return { ...e, looks };
    });
    return id;
  },
  renameLook(ref: string, name: string) {
    const v = name.trim();
    if (!v) return;
    setEffects((e) => ({ ...e, looks: e.looks.map((l) => (l.id === ref ? { ...l, name: v } : l)) }), { coalesce: `fx-name-${ref}` });
  },
  /** Delete a layer look; its layers go back to the whole-drawing look. */
  deleteLook(ref: string) {
    const look = doc().effects.looks.find((l) => l.id === ref);
    if (!look) return;
    store.setDoc((d) => {
      const users = Object.values(d.nodes).filter((n) => n.style.fxLook === ref).map((n) => n.id);
      let next = setStyle(d, users, { fxLook: undefined });
      if (d.defaults.fxLook === ref) next = { ...next, defaults: { ...next.defaults, fxLook: NO_LOOK } };
      return { ...next, effects: { ...next.effects, looks: next.effects.looks.filter((l) => l.id !== ref) } };
    });
    store.status(`Deleted ${look.name} — Ctrl+Z to undo`);
  },
  moveLook(ref: string, dir: -1 | 1) {
    setEffects((e) => {
      const i = e.looks.findIndex((l) => l.id === ref), j = i + dir;
      if (i < 0 || j < 0 || j >= e.looks.length) return e;
      const looks = [...e.looks];
      [looks[i], looks[j]] = [looks[j], looks[i]];
      return { ...e, looks };
    });
  },
  /** Give objects / layers a layer look ('' = back to the whole-drawing look). */
  assign(ids: string[], ref: string) {
    const targets = ids.filter((id) => doc().nodes[id]);
    if (!targets.length) return store.status('Select the layers or objects first');
    store.setDoc((d) => {
      const next = assign(d, targets, ref);
      return ref ? { ...next, effects: { ...next.effects, enabled: true } } : next;
    });
    const look = doc().effects.looks.find((l) => l.id === ref);
    store.status(look ? `${look.name} applies to ${describe(targets)}` : `${describe(targets)} back to the whole-drawing look`);
  },
};

function describe(ids: string[]) {
  return ids.length === 1 ? doc().nodes[ids[0]]?.name ?? 'object' : `${ids.length} items`;
}

/**
 * Set the look on each target, keeping an override only where it differs from
 * what the target inherits. Objects inside a target that had their own look
 * keep it; the target's look covers everything else inside.
 */
function assign(d: ProjectDoc, ids: string[], ref: string): ProjectDoc {
  let next = d;
  for (const id of ids) {
    const parent = next.nodes[id].parent;
    const inherited = parent ? resolveStyle(next, parent).fxLook : next.defaults.fxLook;
    next = setStyle(next, [id], { fxLook: ref === inherited ? undefined : ref });
    // Inside a target, drop overrides that just repeat the new look.
    const inside = descendants(next, id).filter((c) => next.nodes[c]?.style.fxLook === ref);
    if (inside.length) next = setStyle(next, inside, { fxLook: undefined });
  }
  return next;
}
