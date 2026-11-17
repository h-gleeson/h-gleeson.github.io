import { importModel } from '../import/importFiles';
import { ImportError, type SourceFile } from '../import/loaders';
import { registry } from '../import/registry';
import { DEFAULT_TEXT, decodeText, encodeText, textLabel, TEXT_FILE, type TextSpec } from '../import/text';
import { store, uid } from '../state/store';
import type { ProjectDoc, SceneNode } from '../state/types';

/**
 * Text objects are models (format `text`) whose bytes are a spec. Editing one
 * parses a new model from the new spec and points the text's mesh node at it,
 * keeping the node, its transform, style overrides, explode moves and labels.
 * The previous model stays in the registry, so undo can point back at it.
 */

export interface TextTarget {
  /** The mesh node that draws the text. */
  mesh: SceneNode;
  spec: TextSpec;
  files: SourceFile[];
  model: string;
}

/** The text object behind a node: the text mesh itself, or a group holding exactly one text mesh. */
export function textTarget(doc: ProjectDoc, id: string): TextTarget | null {
  const n = doc.nodes[id];
  if (!n) return null;
  const isText = (m: SceneNode | undefined) => !!m?.geom && doc.models[m.geom.model]?.format === 'text';
  let mesh: SceneNode | undefined = isText(n) ? n : undefined;
  if (!mesh && n.kind === 'group') {
    const found: SceneNode[] = [];
    const walk = (k: string) => {
      const c = doc.nodes[k];
      if (!c) return;
      if (isText(c)) found.push(c);
      c.children.forEach(walk);
    };
    n.children.forEach(walk);
    if (found.length === 1) mesh = found[0];
  }
  if (!mesh?.geom) return null;
  const parsed = registry.get(mesh.geom.model);
  if (!parsed) return null;
  return { mesh, spec: specOf(mesh.geom.model, parsed.files[0].data), files: parsed.files, model: mesh.geom.model };
}

const specCache = new Map<string, TextSpec>();
function specOf(model: string, data: ArrayBuffer): TextSpec {
  let s = specCache.get(model);
  if (!s) {
    s = decodeText(data);
    specCache.set(model, s);
  }
  return s;
}

const latest = new Map<string, number>();
let seq = 0;
const listeners = new Set<() => void>();
/** Number of text edits still being traced (for a busy hint in the Inspector). */
export let pendingText = 0;
function setPending(d: number) {
  pendingText += d;
  listeners.forEach((l) => l());
}
export function onTextPending(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const textActions = {
  /** Add a text object at the camera target, facing the view, and select it. */
  async add(patch: Partial<TextSpec> = {}, font?: SourceFile) {
    const spec: TextSpec = { ...DEFAULT_TEXT, ...patch };
    const files: SourceFile[] = [{ name: TEXT_FILE, data: encodeText(spec) }];
    if (font) {
      spec.fontSource = 'file';
      spec.family = font.name;
      if (!patch.text) spec.text = font.name.replace(/\.[^.]+$/, '');
      files[0].data = encodeText(spec);
      files.push(font);
    }
    store.setUI({ busy: { label: 'Setting text' } });
    try {
      const rootId = await importModel(files, 'text');
      store.setUI((u) => ({ selection: [rootId], selectionAnchor: rootId, inspectorTab: { tab: 'object', n: (u.inspectorTab?.n ?? 0) + 1 } }));
    } catch (e) {
      if (!(e instanceof ImportError)) console.error(e);
      store.status(e instanceof ImportError ? e.message : `Could not add text: ${(e as Error).message}`, 'error');
    } finally {
      store.setUI({ busy: null });
    }
  },

  /**
   * Change a text object. `font` replaces its font with an uploaded file. Rapid
   * edits (typing, dragging a slider) are traced in order and only the newest
   * result is applied; consecutive edits merge into one undo step.
   */
  async update(nodeId: string, patch: Partial<TextSpec>, font?: SourceFile): Promise<boolean> {
    const t = textTarget(store.get().doc, nodeId);
    if (!t) return false;
    const spec: TextSpec = { ...t.spec, ...patch };
    if (font) {
      spec.fontSource = 'file';
      spec.family = font.name;
    }
    if (!spec.text.trim()) return false;
    const files: SourceFile[] = [{ name: TEXT_FILE, data: encodeText(spec) }];
    if (spec.fontSource === 'file') {
      const f = font ?? t.files.slice(1).find((x) => x.name === spec.family);
      if (f) files.push(f);
    }
    const meshId = t.mesh.id;
    const mine = ++seq;
    latest.set(meshId, mine);
    const id = uid('model');
    setPending(1);
    try {
      const parsed = await registry.add(id, 'text', files);
      if (latest.get(meshId) !== mine) {
        registry.remove(id); // a newer edit has started; drop this one
        return false;
      }
      specCache.set(id, spec);
      const label = textLabel(spec);
      store.setDoc(
        (d) => {
          const m = d.nodes[meshId];
          if (!m?.geom) return d;
          const old = m.geom.model;
          const nodes = { ...d.nodes, [meshId]: { ...m, geom: { model: id, index: 0 }, name: m.name === m.importedName ? label : m.name, importedName: label } };
          // The top group of a text object is named after it too, until renamed.
          const top = m.parent ? d.nodes[m.parent] : null;
          if (top && top.children.length === 1 && top.name === top.importedName) nodes[top.id] = { ...top, name: label, importedName: label };
          const models = { ...d.models, [id]: { id, name: label, format: 'text' as const, files: files.map((f) => ({ name: f.name, size: f.data.byteLength })), upAxis: 'y' as const, drawables: parsed.drawables.length } };
          if (!Object.values(nodes).some((n) => n.geom?.model === old)) delete models[old];
          return { ...d, nodes, models };
        },
        { coalesce: `text:${meshId}` },
      );
      return true;
    } catch (e) {
      registry.remove(id);
      if (latest.get(meshId) === mine) store.status(e instanceof ImportError ? e.message : `Text could not be drawn: ${(e as Error).message}`, 'error');
      if (!(e instanceof ImportError)) console.error(e);
      return false;
    } finally {
      setPending(-1);
    }
  },
};
