import { InstancedMesh, Matrix4, Object3D } from 'three';
import { uid } from '../state/store';
import type { NodeKind, SceneNode } from '../state/types';
import { displayName, type Drawable } from './drawables';

/**
 * Turn a parsed object tree into Tracefield scene nodes. Nothing is merged or
 * flattened: every Object3D that leads to geometry becomes a node with its
 * original name and local transform. Empty branches (cameras, lights, bones
 * without meshes) are skipped. Instanced meshes become a group of instances.
 */
export function buildNodes(
  root: Object3D,
  drawables: { list: Drawable[]; byObject: Map<Object3D, number> },
  modelId: string,
  fileName: string,
  upAxis: 'y' | 'z',
): { nodes: Record<string, SceneNode>; rootId: string } {
  const nodes: Record<string, SceneNode> = {};
  const hasGeometry = new Map<Object3D, boolean>();
  const probe = (o: Object3D): boolean => {
    const v = drawables.byObject.has(o) || o.children.map(probe).some(Boolean);
    hasGeometry.set(o, v);
    return v;
  };
  probe(root);

  const make = (p: { name: string; kind: NodeKind; parent: string | null; matrix: number[]; index?: number }): SceneNode => {
    const id = uid(p.kind === 'group' ? 'g' : 'm');
    const node: SceneNode = {
      id,
      name: p.name,
      importedName: p.name,
      parent: p.parent,
      children: [],
      kind: p.kind,
      matrix: p.matrix,
      baseMatrix: p.matrix,
      geom: p.index !== undefined ? { model: modelId, index: p.index } : undefined,
      visible: true,
      locked: false,
      expanded: false,
      style: {},
    };
    nodes[id] = node;
    if (p.parent) nodes[p.parent].children.push(id);
    return node;
  };

  const rootMatrix = new Matrix4();
  if (upAxis === 'z') rootMatrix.makeRotationX(-Math.PI / 2);
  rootMatrix.multiply(root.matrix);
  const top = make({ name: fileName, kind: 'group', parent: null, matrix: rootMatrix.toArray() });
  top.expanded = true;

  const walk = (o: Object3D, parent: string) => {
    if (!hasGeometry.get(o)) return;
    const index = drawables.byObject.get(o);
    const inst = o as InstancedMesh;
    let node: SceneNode;
    if (index !== undefined && inst.isInstancedMesh) {
      node = make({ name: displayName(o, 'Instances'), kind: 'group', parent, matrix: o.matrix.toArray() });
      const m = new Matrix4();
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m);
        make({ name: `${drawables.list[index].name} ${i + 1}`, kind: 'mesh', parent: node.id, matrix: m.toArray(), index });
      }
    } else if (index !== undefined) {
      const d = drawables.list[index];
      node = make({ name: d.name, kind: d.kind, parent, matrix: o.matrix.toArray(), index });
    } else {
      node = make({ name: displayName(o, 'Group'), kind: 'group', parent, matrix: o.matrix.toArray() });
    }
    for (const c of o.children) walk(c, node.id);
  };

  // The loader's root is our top node; a root that is itself a mesh keeps its geometry there.
  const rootIndex = drawables.byObject.get(root);
  if (rootIndex !== undefined) {
    make({ name: drawables.list[rootIndex].name, kind: drawables.list[rootIndex].kind, parent: top.id, matrix: new Matrix4().toArray(), index: rootIndex });
  }
  for (const c of root.children) walk(c, top.id);

  // A single wrapper group directly under the root adds nothing to the tree; open it.
  if (top.children.length === 1) nodes[top.children[0]].expanded = true;
  return { nodes, rootId: top.id };
}
