import { Group, LoadingManager, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { ModelFormat } from '../state/types';

export interface SourceFile {
  name: string;
  data: ArrayBuffer;
}

export class ImportError extends Error {}

const EXT: Record<string, ModelFormat> = { glb: 'glb', gltf: 'gltf', obj: 'obj', stl: 'stl', fbx: 'fbx' };
export const MODEL_EXTENSIONS = Object.keys(EXT);
/** Files that may accompany a model (glTF buffers/textures, OBJ materials). */
export const SIDE_EXTENSIONS = ['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp', 'ktx2', 'tga', 'bmp'];

export function extOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function formatOf(name: string): ModelFormat | null {
  return EXT[extOf(name)] ?? null;
}

const baseName = (url: string) => decodeURIComponent(url.split(/[\\/]/).pop()?.split('?')[0] ?? url).toLowerCase();

/**
 * Loading manager that resolves relative resource URIs (buffers, textures)
 * to in-memory side files, so multi-file glTF / OBJ+MTL imports work offline.
 */
function managerFor(files: SourceFile[]): { manager: LoadingManager; dispose: () => void; missing: Set<string> } {
  const urls = new Map<string, string>();
  for (const f of files) urls.set(f.name.toLowerCase(), URL.createObjectURL(new Blob([f.data])));
  const missing = new Set<string>();
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/.test(url)) return url;
    const hit = urls.get(baseName(url));
    if (!hit) missing.add(baseName(url));
    // Never fall through to the network: a missing side file must fail here, not fetch something else.
    return hit ?? 'blob:tracefield-missing-file';
  });
  return { manager, missing, dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}

let draco: DRACOLoader | null = null;
function dracoLoader() {
  if (!draco) {
    draco = new DRACOLoader();
  }
  return draco;
}

function checkGlb(data: ArrayBuffer) {
  const magic = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(4, data.byteLength)));
  if (magic !== 'glTF') throw new ImportError('This .glb file is not valid binary glTF (missing "glTF" header).');
}

/** Parse the main file (plus side files) into a three.js object tree. Never mutates the input buffers. */
export async function parseModel(main: SourceFile, side: SourceFile[], format: ModelFormat): Promise<{ root: Object3D; warnings: string[] }> {
  if (main.data.byteLength === 0) throw new ImportError(`${main.name} is empty.`);
  const { manager, dispose, missing } = managerFor(side);
  const warnings: string[] = [];
  try {
    let root: Object3D;
    switch (format) {
      case 'glb':
      case 'gltf': {
        if (format === 'glb') checkGlb(main.data);
        const loader = new GLTFLoader(manager);
        loader.setDRACOLoader(dracoLoader());
        loader.setMeshoptDecoder(MeshoptDecoder);
        const input = format === 'gltf' ? new TextDecoder().decode(main.data) : main.data.slice(0);
        if (format === 'gltf') {
          try {
            JSON.parse(input as string);
          } catch {
            throw new ImportError(`${main.name} is not valid glTF JSON.`);
          }
        }
        const gltf = await loader.parseAsync(input, '');
        root = gltf.scene;
        if (gltf.scenes.length > 1) warnings.push(`File has ${gltf.scenes.length} scenes; imported the default scene.`);
        break;
      }
      case 'obj': {
        const loader = new OBJLoader(manager);
        const mtl = side.find((f) => extOf(f.name) === 'mtl');
        if (mtl) {
          const materials = new MTLLoader(manager).parse(new TextDecoder().decode(mtl.data), '');
          materials.preload();
          loader.setMaterials(materials);
        }
        root = loader.parse(new TextDecoder().decode(main.data));
        break;
      }
      case 'stl': {
        const geometry = new STLLoader(manager).parse(main.data.slice(0));
        const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0xcccccc }));
        mesh.name = main.name.replace(/\.stl$/i, '');
        root = new Group();
        root.add(mesh);
        break;
      }
      case 'fbx':
        root = new FBXLoader(manager).parse(main.data.slice(0), '');
        break;
    }
    // Let texture requests settle so missing-file warnings are complete.
    await new Promise((r) => setTimeout(r, 0));
    if (missing.size) warnings.push(`Missing referenced files: ${[...missing].slice(0, 4).join(', ')}${missing.size > 4 ? '…' : ''}`);
    root.updateMatrixWorld(true);
    return { root, warnings };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    const bins = [...missing].filter((m) => !/\.(png|jpe?g|webp|ktx2|tga|bmp)$/.test(m));
    if (bins.length) throw new ImportError(`${main.name} needs ${bins.join(', ')}. Select or drop it together with the ${format === 'obj' ? '.obj' : '.gltf'} file.`);
    const msg = e instanceof Error ? e.message : String(e);
    throw new ImportError(`Could not read ${main.name}: ${msg.replace(/^THREE\.\w+:\s*/, '')}`);
  } finally {
    // Textures may still be decoding; release URLs a little later.
    setTimeout(dispose, 30000);
  }
}
