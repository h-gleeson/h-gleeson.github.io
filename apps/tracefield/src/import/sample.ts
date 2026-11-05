import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Scene } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A small studio building generated in code and exported to GLB, so the
 * sample goes through exactly the same import path as a user's file.
 * Named groups: Site / Ground floor / Upper floor / Roof / Stair / Furniture.
 */
export async function buildSampleGlb(): Promise<ArrayBuffer> {
  const mat = (hex: string, name: string, opacity = 1) =>
    new MeshStandardMaterial({ color: new Color(hex).convertSRGBToLinear(), name, transparent: opacity < 1, opacity });
  const concrete = mat('#cfcac0', 'Concrete');
  const timber = mat('#b98b5e', 'Timber');
  const steel = mat('#43474f', 'Steel');
  const glass = mat('#a9cad6', 'Glass', 0.45);
  const plaster = mat('#f1eee7', 'Plaster');
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const mesh = (g: BufferGeometry, m: MeshStandardMaterial, name: string, parent: Object3D) => {
    const o = new Mesh(g, m);
    o.name = name;
    parent.add(o);
    return o;
  };
  const group = (name: string, parent: Object3D) => {
    const g = new Group();
    g.name = name;
    parent.add(g);
    return g;
  };

  const scene = new Scene();
  const building = group('Studio building', scene);

  const site = group('Site', building);
  mesh(box(22, 0.4, 14, 0, -0.4, 0), concrete, 'Ground slab', site);
  mesh(box(6, 0.15, 3, -6, 0, 5.2), timber, 'Deck', site);

  const ground = group('Ground floor', building);
  const walls = group('Walls', ground);
  mesh(box(12, 3, 0.3, 0, 0, -3.85), plaster, 'North wall', walls);
  mesh(box(0.3, 3, 8, -6.15, 0, 0), plaster, 'West wall', walls);
  mesh(box(0.3, 3, 8, 6.15, 0, 0), plaster, 'East wall', walls);
  const glazing = group('Glazing', ground);
  mesh(box(12, 2.8, 0.06, 0, 0.1, 3.9), glass, 'South curtain wall', glazing);
  const mullions: BufferGeometry[] = [];
  for (let i = 0; i <= 8; i++) mullions.push(box(0.08, 2.9, 0.12, -6 + i * 1.5, 0.05, 3.9));
  mesh(mergeGeometries(mullions)!, steel, 'Mullions', glazing);
  mesh(box(12.6, 0.35, 8.6, 0, 3, 0), concrete, 'First floor slab', ground);

  const upper = group('Upper floor', building);
  mesh(box(7, 2.8, 8, 2.5, 3.35, 0), plaster, 'Upper volume', upper);
  mesh(box(0.06, 2.2, 3, -1.03, 3.6, 1.5), glass, 'Terrace door', upper);
  const rail: BufferGeometry[] = [];
  for (let i = 0; i <= 10; i++) rail.push(box(0.05, 1, 0.05, -6 + i * 0.5, 3.35, 3.9));
  rail.push(box(5, 0.06, 0.08, -3.5, 4.35, 3.9));
  mesh(mergeGeometries(rail)!, steel, 'Terrace balustrade', upper);

  const roof = group('Roof', building);
  mesh(box(7.8, 0.3, 8.8, 2.5, 6.15, 0), concrete, 'Roof slab', roof);
  const fins: BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) fins.push(box(0.1, 0.5, 8.8, -1.25 + i * 0.68, 6.45, 0));
  mesh(mergeGeometries(fins)!, timber, 'Roof fins', roof);
  mesh(new CylinderGeometry(0.35, 0.35, 0.9, 24).translate(4.6, 6.9, -2.6), steel, 'Flue', roof);

  const stair = group('Stair', building);
  for (let i = 0; i < 10; i++) mesh(box(1.1, 0.18, 0.3, -5.3, i * 0.335, -2.4 + i * 0.3), timber, `Tread ${i + 1}`, stair);
  mesh(box(0.06, 3.35, 3.2, -4.72, 0, -1.05), steel, 'Stringer', stair);

  const furniture = group('Furniture', building);
  mesh(box(2.4, 0.06, 1, 1.5, 0.74, 0.5), timber, 'Table top', furniture);
  for (const [x, z] of [[0.4, 0.1], [2.6, 0.1], [0.4, 0.9], [2.6, 0.9]]) mesh(box(0.06, 0.74, 0.06, x, 0, z), steel, 'Table leg', furniture);
  mesh(new CylinderGeometry(0.5, 0.5, 0.45, 32).translate(-2.5, 0.225, 1.5), timber, 'Stool', furniture);

  scene.updateMatrixWorld(true);
  return (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
}
