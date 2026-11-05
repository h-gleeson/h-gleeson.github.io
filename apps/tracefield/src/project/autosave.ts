import { registry } from '../import/registry';
import type { SourceFile } from '../import/loaders';
import { normalizeDoc } from '../state/defaults';
import { store } from '../state/store';
import type { ProjectDoc } from '../state/types';
import { loadDocument, referencedModels } from './projectFile';

/**
 * Local recovery. The document is written to IndexedDB shortly after every
 * change; model bytes are written once per model. On the next visit the empty
 * state offers to restore the session.
 */

const DB = 'tracefield';
const STORE = 'autosave';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await open();
  const v = await new Promise<T | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return v;
}

const written = new Set<string>();

export function startAutosave() {
  let timer = 0;
  let last: ProjectDoc | null = null;
  store.subscribe(() => {
    const { doc, ui } = store.get();
    if (doc === last) return;
    last = doc;
    // Never overwrite a restorable session with an empty startup document.
    if (!doc.roots.length && ui.restoreAvailable) return;
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        for (const id of referencedModels(doc)) {
          if (written.has(id)) continue;
          const m = registry.get(id);
          if (!m) continue;
          await put(`model:${id}`, m.files);
          written.add(id);
        }
        await put('doc', { doc, savedAt: Date.now() });
      } catch (e) {
        console.warn('Autosave failed', e);
        store.status('Autosave failed — the browser may be out of storage. Save the project to keep your work.', 'error');
      }
    }, 1200);
  });
}

export async function hasAutosave(): Promise<{ name: string; savedAt: number } | null> {
  try {
    const v = await get<{ doc: ProjectDoc; savedAt: number }>('doc');
    return v && v.doc.roots?.length ? { name: v.doc.name, savedAt: v.savedAt } : null;
  } catch {
    return null;
  }
}

export async function restoreAutosave() {
  store.setUI({ busy: { label: 'Restoring last session' } });
  try {
    const v = await get<{ doc: ProjectDoc }>('doc');
    if (!v) throw new Error('nothing saved');
    const doc = normalizeDoc(v.doc);
    const files: Record<string, SourceFile[]> = {};
    for (const id of Object.keys(doc.models)) {
      const f = await get<SourceFile[]>(`model:${id}`);
      if (f) {
        files[id] = f;
        written.add(id);
      }
    }
    await loadDocument(doc, files);
    store.setUI({ restoreAvailable: false });
    store.status(`Restored “${doc.name}”`);
  } catch (e) {
    store.status(`Restore failed: ${(e as Error).message}`, 'error');
  } finally {
    store.setUI({ busy: null });
  }
}
