import { registry } from '../import/registry';
import type { SourceFile } from '../import/loaders';
import { createDoc, normalizeDoc } from '../state/defaults';
import { store } from '../state/store';
import type { ProjectDoc } from '../state/types';

/**
 * .tracefield project file — a single portable binary:
 *
 *   u32 magic 'TFLD' · u32 version · u32 manifest length · manifest JSON (UTF-8)
 *   followed by every model file's original bytes, in manifest order.
 *
 * Geometry is never re-encoded: the original GLB/glTF/OBJ/… bytes are embedded
 * and re-parsed on open, and scene nodes re-attach by (model, drawable index).
 * Nothing depends on temporary paths or blob URLs.
 */

const MAGIC = 0x444c4654; // 'TFLD' little-endian
const VERSION = 1;

interface Manifest {
  format: 'tracefield';
  version: number;
  savedAt: string;
  doc: ProjectDoc;
  files: { model: string; name: string; byteLength: number }[];
}

export function referencedModels(doc: ProjectDoc): string[] {
  const used = new Set<string>();
  for (const n of Object.values(doc.nodes)) if (n.geom) used.add(n.geom.model);
  return Object.keys(doc.models).filter((m) => used.has(m));
}

export function buildProjectBlob(doc: ProjectDoc): Blob {
  const files: Manifest['files'] = [];
  const parts: ArrayBuffer[] = [];
  for (const id of referencedModels(doc)) {
    const m = registry.get(id);
    if (!m) throw new Error(`Model data for ${doc.models[id].name} is not loaded`);
    for (const f of m.files) {
      files.push({ model: id, name: f.name, byteLength: f.data.byteLength });
      parts.push(f.data);
    }
  }
  const manifest: Manifest = { format: 'tracefield', version: VERSION, savedAt: new Date().toISOString(), doc, files };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const header = new DataView(new ArrayBuffer(12));
  header.setUint32(0, MAGIC, true);
  header.setUint32(4, VERSION, true);
  header.setUint32(8, json.byteLength, true);
  return new Blob([header.buffer, json, ...parts], { type: 'application/octet-stream' });
}

export async function readProjectBlob(blob: Blob): Promise<{ doc: ProjectDoc; files: Record<string, SourceFile[]> }> {
  if (blob.size < 12) throw new Error('File is too small to be a Tracefield project.');
  const header = new DataView(await blob.slice(0, 12).arrayBuffer());
  if (header.getUint32(0, true) !== MAGIC) throw new Error('Not a Tracefield project (bad header).');
  const version = header.getUint32(4, true);
  if (version > VERSION) throw new Error(`Project was saved by a newer Tracefield (format v${version}).`);
  const len = header.getUint32(8, true);
  const manifest = JSON.parse(new TextDecoder().decode(await blob.slice(12, 12 + len).arrayBuffer())) as Manifest;
  if (manifest.format !== 'tracefield') throw new Error('Not a Tracefield project.');
  const files: Record<string, SourceFile[]> = {};
  let offset = 12 + len;
  for (const f of manifest.files) {
    const data = await blob.slice(offset, offset + f.byteLength).arrayBuffer();
    if (data.byteLength !== f.byteLength) throw new Error('Project file is truncated.');
    (files[f.model] ??= []).push({ name: f.name, data });
    offset += f.byteLength;
  }
  return { doc: normalizeDoc(manifest.doc), files };
}

/** Re-parse every model of a document and make it current. */
export async function loadDocument(doc: ProjectDoc, files: Record<string, SourceFile[]>) {
  registry.clear();
  const ids = Object.keys(doc.models);
  for (let i = 0; i < ids.length; i++) {
    const rec = doc.models[ids[i]];
    const f = files[rec.id];
    if (!f?.length) throw new Error(`Project is missing data for ${rec.name}`);
    store.setUI({ busy: { label: `Loading ${rec.name}`, progress: i / ids.length } });
    await registry.add(rec.id, rec.format, f);
  }
  store.resetDoc(doc);
}

export async function openProjectFile(file: File) {
  store.setUI({ busy: { label: `Opening ${file.name}` } });
  try {
    const { doc, files } = await readProjectBlob(file);
    await loadDocument(doc, files);
    store.status(`Opened ${file.name}`);
  } catch (e) {
    console.error(e);
    store.status(`Could not open ${file.name}: ${(e as Error).message}`, 'error');
  } finally {
    store.setUI({ busy: null });
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFileName(name: string) {
  return (name || 'drawing').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'drawing';
}

export function saveProject() {
  const { doc } = store.get();
  try {
    const blob = buildProjectBlob(doc);
    download(blob, `${safeFileName(doc.name)}.tracefield`);
    store.status(`Saved ${safeFileName(doc.name)}.tracefield (${(blob.size / 1e6).toFixed(1)} MB)`);
  } catch (e) {
    store.status(`Save failed: ${(e as Error).message}`, 'error');
  }
}

export function newProject() {
  registry.clear();
  store.resetDoc(createDoc());
  store.status('New drawing');
}
