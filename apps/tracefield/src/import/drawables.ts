import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Line, LineSegments, Material, Mesh, NoColorSpace, Object3D, Texture } from 'three';
import type { ModelFormat } from '../state/types';

/** The imported look of one material slot, kept read-only for "Original material" display. */
export interface MaterialInfo {
  name: string;
  color: string;
  map: Texture | null;
  opacity: number;
}

export interface Drawable {
  index: number;
  kind: 'mesh' | 'line';
  object: Object3D;
  name: string;
  geometry: BufferGeometry;
  materials: MaterialInfo[];
  triangles: number;
}

export function displayName(o: Object3D, fallback: string): string {
  return (o.userData?.name as string) || o.name || fallback;
}

function colorHex(c: Color | undefined, linear: boolean): string {
  if (!c) return '#cccccc';
  const col = c.clone();
  if (linear) col.convertLinearToSRGB();
  return '#' + col.getHexString();
}

function materialInfo(m: Material | undefined, linear: boolean): MaterialInfo {
  const anyM = m as (Material & { color?: Color; map?: Texture | null }) | undefined;
  const map = anyM?.map ?? null;
  // Colour management is off app-wide; sample textures as stored (sRGB values).
  if (map) map.colorSpace = NoColorSpace;
  return { name: m?.name ?? '', color: colorHex(anyM?.color, linear), map, opacity: m?.opacity ?? 1 };
}

/** Plain float32 positions; loaders sometimes hand back interleaved or quantized attributes. */
function plainGeometry(g: BufferGeometry): BufferGeometry {
  const pos = g.attributes.position;
  if (!pos || pos.itemSize !== 3) return g;
  if (pos instanceof BufferAttribute && pos.array instanceof Float32Array && !pos.normalized) return g;
  const out = g.clone();
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    arr[i * 3] = pos.getX(i);
    arr[i * 3 + 1] = pos.getY(i);
    arr[i * 3 + 2] = pos.getZ(i);
  }
  out.setAttribute('position', new BufferAttribute(arr, 3));
  return out;
}

function lineSegments(line: Line): Float32Array {
  const g = line.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const at = (i: number) => (idx ? idx.getX(i) : i);
  const pairs: number[] = [];
  if ((line as LineSegments).isLineSegments) for (let i = 0; i + 1 < n; i += 2) pairs.push(at(i), at(i + 1));
  else {
    for (let i = 0; i + 1 < n; i++) pairs.push(at(i), at(i + 1));
    if ((line as Line & { isLineLoop?: boolean }).isLineLoop && n > 2) pairs.push(at(n - 1), at(0));
  }
  const out = new Float32Array(pairs.length * 3);
  pairs.forEach((v, i) => {
    out[i * 3] = pos.getX(v);
    out[i * 3 + 1] = pos.getY(v);
    out[i * 3 + 2] = pos.getZ(v);
  });
  return out;
}

/**
 * Collect meshes and curves in a deterministic depth-first order. The order is
 * the contract that lets a saved project re-attach to geometry after re-parsing
 * the same file bytes.
 */
export function collectDrawables(root: Object3D, format: ModelFormat): { list: Drawable[]; byObject: Map<Object3D, number> } {
  const linear = format === 'glb' || format === 'gltf';
  const list: Drawable[] = [];
  const byObject = new Map<Object3D, number>();
  root.traverse((o) => {
    const line = o as Line;
    if (line.isLine && line.geometry?.attributes?.position) {
      const segs = lineSegments(line);
      if (!segs.length) return;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(segs, 3));
      const mat = Array.isArray(line.material) ? line.material[0] : line.material;
      byObject.set(o, list.length);
      list.push({ index: list.length, kind: 'line', object: o, name: displayName(o, `Curve ${list.length + 1}`), geometry: g, materials: [materialInfo(mat, linear)], triangles: 0 });
      return;
    }
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const geometry = plainGeometry(mesh.geometry);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const tri = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    byObject.set(o, list.length);
    list.push({
      index: list.length,
      kind: 'mesh',
      object: o,
      name: displayName(o, `Mesh ${list.length + 1}`),
      geometry,
      materials: mats.map((m) => materialInfo(m, linear)),
      triangles: Math.floor(tri) * ((o as InstancedMesh).isInstancedMesh ? (o as InstancedMesh).count : 1),
    });
  });
  return { list, byObject };
}
