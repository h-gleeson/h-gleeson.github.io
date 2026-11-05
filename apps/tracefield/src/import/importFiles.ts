import { store, uid } from '../state/store';
import type { ModelFormat, ModelRecord } from '../state/types';
import { buildNodes } from './buildNodes';
import { extOf, formatOf, ImportError, MODEL_EXTENSIONS, SIDE_EXTENSIONS, type SourceFile } from './loaders';
import { registry } from './registry';
import { openProjectFile } from '../project/projectFile';

const PROJECT_EXT = 'tracefield';

/** Import one model from in-memory files (main file first). Returns the new root node id. */
export async function importModel(files: SourceFile[], format: ModelFormat): Promise<string> {
  const id = uid('model');
  const upAxis = pendingUpAxis;
  const parsed = await registry.add(id, format, files);
  if (!parsed.drawables.length) {
    registry.remove(id);
    throw new ImportError(`${files[0].name} contains no meshes or curves to draw.`);
  }
  store.setUI({ busy: { label: `Building hierarchy for ${files[0].name}` } });
  const { nodes, rootId } = buildNodes(parsed.root, registry.drawableMap(parsed), id, files[0].name, upAxis);
  const record: ModelRecord = {
    id,
    name: files[0].name,
    format,
    files: files.map((f) => ({ name: f.name, size: f.data.byteLength })),
    upAxis,
    drawables: parsed.drawables.length,
  };
  const first = store.get().doc.roots.length === 0;
  store.setDoc((d) => ({ ...d, models: { ...d.models, [id]: record }, nodes: { ...d.nodes, ...nodes }, roots: [...d.roots, rootId] }));
  store.setUI((u) => ({ restoreAvailable: false, fitRequest: first ? u.fitRequest + 1 : u.fitRequest }));
  if (first) store.setDoc((d) => ({ ...d, name: files[0].name.replace(/\.[^.]+$/, '') }), { history: false });
  const meshes = parsed.drawables.filter((d) => d.kind === 'mesh').length;
  const curves = parsed.drawables.length - meshes;
  const groups = Object.values(nodes).filter((n) => n.kind === 'group').length;
  const msg = `Imported ${files[0].name}: ${meshes} meshes${curves ? `, ${curves} curves` : ''}, ${groups} groups`;
  store.status(parsed.warnings.length ? `${msg}. ${parsed.warnings.join(' ')}` : msg);
  return rootId;
}

/** Up-axis applied to the next import (set from the import options). */
let pendingUpAxis: 'y' | 'z' = 'y';
export function setImportUpAxis(a: 'y' | 'z') {
  pendingUpAxis = a;
}
export function getImportUpAxis() {
  return pendingUpAxis;
}

/**
 * Handle files from drag-and-drop or the file picker. Each model file is
 * imported with every side file (buffers, textures, .mtl) from the same drop,
 * so multi-file glTF and OBJ+MTL work.
 */
export async function importFiles(files: File[]): Promise<void> {
  const project = files.find((f) => extOf(f.name) === PROJECT_EXT);
  if (project) {
    await openProjectFile(project);
    return;
  }
  const mains = files.filter((f) => MODEL_EXTENSIONS.includes(extOf(f.name)));
  const side = files.filter((f) => SIDE_EXTENSIONS.includes(extOf(f.name)));
  const unknown = files.filter((f) => !mains.includes(f) && !side.includes(f));
  if (!mains.length) {
    store.status(
      unknown.length
        ? `Unsupported file${unknown.length > 1 ? 's' : ''}: ${unknown.map((f) => f.name).join(', ')}. Tracefield reads GLB, glTF, OBJ, STL, FBX and .tracefield projects.`
        : 'No model file found. Include the .gltf/.obj alongside its side files.',
      'error',
    );
    return;
  }
  const sideFiles: SourceFile[] = [];
  for (const f of side) sideFiles.push({ name: f.name, data: await f.arrayBuffer() });
  for (const f of mains) {
    store.setUI({ busy: { label: `Reading ${f.name}` } });
    try {
      const data = await f.arrayBuffer();
      store.setUI({ busy: { label: `Parsing ${f.name}` } });
      // Let the busy indicator paint before a long synchronous parse.
      await new Promise((r) => setTimeout(r, 30));
      await importModel([{ name: f.name, data }, ...sideFiles], formatOf(f.name)!);
    } catch (e) {
      if (!(e instanceof ImportError)) console.error(e);
      store.status(e instanceof ImportError ? e.message : `Import of ${f.name} failed: ${(e as Error).message}`, 'error');
    }
  }
  store.setUI({ busy: null });
  if (unknown.length) store.status(`Skipped unsupported: ${unknown.map((f) => f.name).join(', ')}`, 'error');
}
