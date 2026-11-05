import {
  Box3,
  BufferGeometry,
  Color,
  ColorManagement,
  GridHelper,
  Group,
  InstancedBufferGeometry,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Ray,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  LinearSRGBColorSpace,
} from 'three';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';
import { registry } from '../import/registry';
import { descendants, ancestors, isLockedInTree, resolveStyle } from '../state/scene';
import { store } from '../state/store';
import type { CameraState, ProjectDoc, UIState } from '../state/types';
import { applyCamera, basis, framePoints, ObliqueCamera, shearOf } from './camera';
import { createEdgeGeometry, createFillMaterial, createLineMaterial, shared, type FillMaterial, type LineMaterial } from './materials';

ColorManagement.enabled = false;
(BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const CLAY = '#e2dcd0';
const DASH: Record<string, [number, number, number]> = { solid: [0, 0, 0], dashed: [6, 4, 0], dotted: [0, 3, 1] };

interface RenderObject {
  id: string;
  key: string; // model|index
  host: Group;
  body: Mesh | LineSegments | null;
  fillMats: FillMaterial[];
  lines: Mesh | null;
  hidden: Mesh | null;
  lineMat: LineMaterial;
  hiddenMat: LineMaterial;
}

/**
 * The 3D view. Mirrors the document into a three.js scene: one Group per
 * scene node (local matrix from the doc), plus fill and line meshes for
 * nodes that reference imported geometry. Re-syncs only what changed.
 */
export class Engine {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly world = new Group();
  readonly ortho = new ObliqueCamera();
  readonly persp = new PerspectiveCamera(35, 1, 0.1, 1000);
  camera: ObliqueCamera | PerspectiveCamera = this.ortho;

  private groups = new Map<string, Group>();
  private robjs = new Map<string, RenderObject>();
  private edgeGeoms = new Map<string, InstancedBufferGeometry>();
  private grid: GridHelper | null = null;
  private lastDoc: ProjectDoc | null = null;
  private lastUI: UIState | null = null;
  private lastFit = 0;
  private raf = 0;
  private unsub: (() => void)[] = [];
  private resizeObs: ResizeObserver;
  private boundsCache: Box3 | null = null;
  cssW = 1;
  cssH = 1;
  onRender: (() => void) | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'viewport-canvas';
    container.appendChild(this.canvas);
    this.scene.add(this.world);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.unsub.push(store.subscribe(() => this.onStore()));
    this.unsub.push(
      registry.onChange(() => {
        this.lastDoc = null;
        this.onStore();
      }),
    );
    this.onStore();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.unsub.forEach((u) => u());
    this.resizeObs.disconnect();
    for (const id of [...this.robjs.keys()]) this.dropRObj(id);
    this.edgeGeoms.forEach((g) => g.dispose());
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ------------------------------------------------------------ sync

  private onStore() {
    const { doc, ui } = store.get();
    if (doc === this.lastDoc && ui === this.lastUI) return;
    const prev = this.lastDoc;
    const structural = !prev || doc.nodes !== prev.nodes || doc.roots !== prev.roots;
    if (structural) this.syncStructure(doc);
    if (structural || ui.selection !== this.lastUI?.selection || ui.isolated !== this.lastUI?.isolated || doc.defaults !== prev?.defaults || doc.drawing !== prev?.drawing)
      this.syncStyles(doc, ui);
    if (structural || doc.drawing.showGrid !== prev?.drawing.showGrid) this.syncGrid(doc);
    this.lastDoc = doc;
    this.lastUI = ui;
    if (ui.fitRequest !== this.lastFit) {
      this.lastFit = ui.fitRequest;
      requestAnimationFrame(() => this.fit());
    }
    this.invalidate();
  }

  private syncStructure(doc: ProjectDoc) {
    const seen = new Set<string>();
    const walk = (id: string, parent: Object3D) => {
      const n = doc.nodes[id];
      if (!n) return;
      seen.add(id);
      let g = this.groups.get(id);
      if (!g) {
        g = new Group();
        g.matrixAutoUpdate = false;
        g.userData.nodeId = id;
        this.groups.set(id, g);
      }
      g.matrix.fromArray(n.matrix);
      g.matrixWorldNeedsUpdate = true;
      if (g.parent !== parent) parent.add(g);
      if (n.geom) this.ensureRObj(id, `${n.geom.model}|${n.geom.index}`, n.geom.model, n.geom.index, g);
      else this.dropRObj(id);
      n.children.forEach((c) => walk(c, g!));
    };
    doc.roots.forEach((r) => walk(r, this.world));
    for (const [id, g] of this.groups) {
      if (seen.has(id)) continue;
      g.removeFromParent();
      this.groups.delete(id);
      this.dropRObj(id);
    }
    // Keep children in document order (affects transparent sorting ties only).
    this.world.updateMatrixWorld(true);
    this.boundsCache = null;

    let tris = 0, edges = 0;
    for (const r of this.robjs.values()) {
      const [model, index] = r.key.split('|');
      const m = registry.get(model);
      tris += m?.drawables[+index]?.triangles ?? 0;
      edges += m?.edges[+index]?.count ?? 0;
    }
    const s = store.get().ui.stats;
    if (s.objects !== this.robjs.size || s.triangles !== tris || s.edges !== edges)
      queueMicrotask(() => store.setUI({ stats: { objects: this.robjs.size, triangles: tris, edges } }));
  }

  private ensureRObj(id: string, key: string, modelId: string, index: number, host: Group) {
    let r = this.robjs.get(id);
    if (r && r.key !== key) {
      this.dropRObj(id);
      r = undefined;
    }
    const model = registry.get(modelId);
    const d = model?.drawables[index];
    if (!d) return;
    if (!r) {
      r = { id, key, host, body: null, fillMats: [], lines: null, hidden: null, lineMat: createLineMaterial(false), hiddenMat: createLineMaterial(true) };
      this.robjs.set(id, r);
    }
    if (!r.body) {
      if (d.kind === 'mesh') {
        const g = d.geometry;
        if (!(g as any).boundsTree) (g as any).computeBoundsTree({ indirect: true });
        const slots = Math.max(1, d.materials.length);
        r.fillMats = Array.from({ length: slots }, () => createFillMaterial(!!g.attributes.normal, !!g.attributes.uv));
        r.body = new Mesh(g, g.groups.length ? r.fillMats : r.fillMats[0]);
      } else {
        const mat = new LineBasicMaterial({ visible: false });
        r.body = new LineSegments(d.geometry, mat);
      }
      r.body.matrixAutoUpdate = false;
      r.body.userData.nodeId = id;
      host.add(r.body);
      this.boundsCache = null;
    }
    const e = model!.edges[index];
    if (!r.lines && e && e.count > 0) {
      let eg = this.edgeGeoms.get(key);
      if (!eg) {
        eg = createEdgeGeometry(e);
        this.edgeGeoms.set(key, eg);
      }
      r.lines = new Mesh(eg, r.lineMat);
      r.hidden = new Mesh(eg, r.hiddenMat);
      for (const m of [r.lines, r.hidden]) {
        m.frustumCulled = false;
        m.matrixAutoUpdate = false;
        m.raycast = () => {};
      }
      r.lines.renderOrder = 10;
      r.hidden.renderOrder = 9;
      host.add(r.lines, r.hidden);
    }
  }

  private dropRObj(id: string) {
    const r = this.robjs.get(id);
    if (!r) return;
    r.body?.removeFromParent();
    r.lines?.removeFromParent();
    r.hidden?.removeFromParent();
    r.fillMats.forEach((m) => m.dispose());
    r.lineMat.dispose();
    r.hiddenMat.dispose();
    this.robjs.delete(id);
  }

  private syncStyles(doc: ProjectDoc, ui: UIState) {
    const selected = new Set<string>();
    for (const id of ui.selection) {
      selected.add(id);
      descendants(doc, id).forEach((d) => selected.add(d));
    }
    let isoSet: Set<string> | null = null;
    if (ui.isolated) {
      isoSet = new Set();
      for (const id of ui.isolated) {
        isoSet.add(id);
        descendants(doc, id).forEach((d) => isoSet!.add(d));
        ancestors(doc, id).forEach((d) => isoSet!.add(d));
      }
    }
    for (const [id, g] of this.groups) {
      const n = doc.nodes[id];
      g.visible = !!n && n.visible && (!isoSet || isoSet.has(id));
    }
    const dr = doc.drawing;
    for (const r of this.robjs.values()) {
      const n = doc.nodes[r.id];
      if (!n?.geom) continue;
      const s = resolveStyle(doc, r.id);
      const d = registry.get(n.geom.model)?.drawables[n.geom.index];
      const sel = selected.has(r.id);
      const isLine = d?.kind === 'line';
      r.fillMats.forEach((m, slot) => {
        const u = m.uniforms;
        const info = d?.materials[slot] ?? d?.materials[0];
        let color = s.fillColor;
        let toning = s.toning;
        let map = null;
        if (s.fillMode === 'material') {
          color = info?.color ?? '#cccccc';
          map = info?.map ?? null;
        } else if (s.fillMode === 'white') color = '#ffffff';
        else if (s.fillMode === 'clay') {
          color = CLAY;
          toning = Math.max(toning, 0.55);
        }
        u.uColor.value.set(color);
        u.uToning.value = toning;
        u.uMap.value = map;
        u.uHasMap.value = map ? 1 : 0;
        u.uSelected.value = sel ? 1 : 0;
        const opacity = s.opacity * (s.fillMode === 'material' ? info?.opacity ?? 1 : 1);
        u.uOpacity.value = opacity;
        const none = s.fillMode === 'none';
        const transparent = !none && opacity < 0.999;
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.colorWrite = !none;
        m.depthWrite = !none && !transparent;
      });
      const crease = s.allEdgesWidth > 0 ? 2 : Math.cos(MathUtils.degToRad(s.creaseAngle));
      const [dash, gap, dotted] = DASH[s.lineStyle] ?? DASH.solid;
      for (const [m, hidden] of [[r.lineMat, false], [r.hiddenMat, true]] as const) {
        const u = m.uniforms;
        u.uSilW.value = s.silhouetteWidth;
        u.uCreaseW.value = s.creaseWidth;
        u.uOpenW.value = s.openEdgeWidth;
        u.uMatW.value = s.materialEdgeWidth;
        u.uAllW.value = s.allEdgesWidth;
        u.uCurveW.value = s.curveWidth;
        u.uCreaseCos.value = crease;
        u.uHiddenW.value = dr.hiddenWidth;
        if (hidden) {
          u.uColor.value.set(dr.hiddenColor);
          u.uOpacity.value = s.lineOpacity;
        } else {
          u.uColor.value.set(sel ? shared.uHighlight.value : isLine && s.fillMode === 'material' ? d?.materials[0]?.color ?? s.lineColor : s.lineColor);
          u.uOpacity.value = s.lineOpacity;
          u.uDash.value = dash;
          u.uGap.value = gap;
          u.uDotted.value = dotted;
        }
      }
      if (r.lines) r.lines.visible = s.showLines || isLine;
      if (r.hidden) r.hidden.visible = (s.showLines || isLine) && dr.hiddenLines;
    }
    const el = MathUtils.degToRad(dr.sunElevation), az = MathUtils.degToRad(dr.sunAzimuth);
    shared.uLightDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    shared.uAmbient.value = dr.ambient;
    shared.uFlat.value = dr.flatShading ? 1 : 0;
  }

  private syncGrid(doc: ProjectDoc) {
    if (this.grid) {
      this.grid.removeFromParent();
      this.grid.geometry.dispose();
      (this.grid.material as LineBasicMaterial).dispose();
      this.grid = null;
    }
    if (!doc.drawing.showGrid) return;
    const b = this.sceneBounds();
    const size = b.isEmpty() ? 20 : b.getSize(new Vector3());
    const extent = typeof size === 'number' ? size : Math.max(size.x, size.z) * 2.5;
    const step = Math.pow(10, Math.floor(Math.log10(extent / 4)));
    const divisions = Math.min(400, Math.max(4, Math.round(extent / step)));
    this.grid = new GridHelper(divisions * step, divisions, new Color('#b9bcc6'), new Color('#dcdee3'));
    const c = b.isEmpty() ? new Vector3() : b.getCenter(new Vector3());
    this.grid.position.set(Math.round(c.x / step) * step, b.isEmpty() ? 0 : b.min.y, Math.round(c.z / step) * step);
    this.grid.renderOrder = -1;
    (this.grid.material as LineBasicMaterial).depthWrite = false;
    this.grid.raycast = () => {};
    this.scene.add(this.grid);
  }

  // ------------------------------------------------------------ bounds & framing

  private visibleBodies(only?: Set<string>): (Mesh | LineSegments)[] {
    const out: (Mesh | LineSegments)[] = [];
    for (const r of this.robjs.values()) {
      if (!r.body) continue;
      if (only ? !only.has(r.id) : !isShown(r.host)) continue;
      out.push(r.body);
    }
    return out;
  }

  sceneBounds(): Box3 {
    if (this.boundsCache) return this.boundsCache;
    this.world.updateMatrixWorld(true);
    const box = new Box3();
    const tmp = new Box3();
    for (const b of this.visibleBodies()) {
      if (!b.geometry.boundingBox) b.geometry.computeBoundingBox();
      box.union(tmp.copy(b.geometry.boundingBox!).applyMatrix4(b.matrixWorld));
    }
    this.boundsCache = box;
    return box;
  }

  private corners(only?: Set<string>): Vector3[] {
    this.world.updateMatrixWorld(true);
    const pts: Vector3[] = [];
    for (const b of this.visibleBodies(only)) {
      if (!b.geometry.boundingBox) b.geometry.computeBoundingBox();
      const bb = b.geometry.boundingBox!;
      for (let i = 0; i < 8; i++)
        pts.push(new Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(b.matrixWorld));
    }
    return pts;
  }

  /** Frame everything, or the given nodes (and their subtrees). */
  fit(ids?: string[]) {
    const { doc } = store.get();
    let only: Set<string> | undefined;
    if (ids?.length) {
      only = new Set();
      for (const id of ids) {
        only.add(id);
        descendants(doc, id).forEach((d) => only!.add(d));
      }
    }
    const f = framePoints(doc.camera, this.corners(only), this.cssW / this.cssH);
    if (!f) return;
    store.setDoc((d) => ({ ...d, camera: { ...d.camera, ...f } }), { history: false });
  }

  worldPerPixel(c: CameraState = store.get().doc.camera) {
    return c.height / this.cssH;
  }

  // ------------------------------------------------------------ picking

  private ray(clientX: number, clientY: number): Raycaster {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new Raycaster();
    if (this.camera === this.ortho) {
      // Unproject both ends so the oblique shear is honoured.
      const a = new Vector3(ndc.x, ndc.y, -1).unproject(this.ortho);
      const b = new Vector3(ndc.x, ndc.y, 1).unproject(this.ortho);
      rc.ray = new Ray(a, b.sub(a).normalize());
    } else rc.setFromCamera(ndc, this.persp);
    rc.params.Line = { threshold: this.worldPerPixel() * 5 };
    (rc as any).firstHitOnly = true;
    return rc;
  }

  /** Node id under the cursor, skipping hidden and locked nodes. */
  pick(clientX: number, clientY: number): string | null {
    const { doc } = store.get();
    const candidates = this.visibleBodies().filter((b) => !isLockedInTree(doc, b.userData.nodeId));
    const hits = this.ray(clientX, clientY).intersectObjects(candidates, false);
    return (hits[0]?.object.userData.nodeId as string) ?? null;
  }

  // ------------------------------------------------------------ render

  private resize() {
    const r = this.container.getBoundingClientRect();
    this.cssW = Math.max(1, Math.floor(r.width));
    this.cssH = Math.max(1, Math.floor(r.height));
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.invalidate();
  }

  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  render() {
    const { doc } = store.get();
    const b = this.sceneBounds();
    const radius = b.isEmpty() ? 1000 : (b.getCenter(new Vector3()).distanceTo(new Vector3(...doc.camera.target)) + b.getSize(new Vector3()).length() / 2) * 4 + 1;
    this.camera = applyCamera(doc.camera, this.ortho, this.persp, this.cssW / this.cssH, radius);
    const persp = doc.camera.projection === 'persp';
    shared.uPersp.value = persp ? 1 : 0;
    const [sx, sy] = shearOf(doc.camera);
    shared.uViewDirOrtho.value.set(sx, sy, 1).normalize();
    const pr = this.renderer.getPixelRatio();
    shared.uResolution.value.set(this.cssW * pr, this.cssH * pr);
    // Lineweights are authored at the reference width: a viewport that wide shows them 1:1.
    shared.uLineScale.value = (this.cssW * pr) / doc.drawing.referenceWidth;
    this.renderer.setClearColor(doc.drawing.background, 1);
    this.renderer.render(this.scene, this.camera);
    this.onRender?.();
  }

  /** Small JPEG of the current view for the saved-view strip. */
  thumbnail(w = 176, h = 112): string {
    // Capture the drawing as it will look, without the selection highlight.
    const { doc, ui } = store.get();
    this.syncStyles(doc, { ...ui, selection: [] });
    this.render();
    queueMicrotask(() => {
      this.syncStyles(store.get().doc, store.get().ui);
      this.invalidate();
    });
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const src = this.canvas;
    const scale = Math.max(w / src.width, h / src.height);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  }

  /** Screen-space axis directions for the orientation gizmo. */
  axisDirections(): { x: Vector2; y: Vector2; z: Vector2 } {
    const c = store.get().doc.camera;
    const { right, up, back } = basis(c);
    const [sx, sy] = shearOf(c);
    const proj = (v: Vector3) => new Vector2(v.dot(right) - sx * v.dot(back), v.dot(up) - sy * v.dot(back));
    return { x: proj(new Vector3(1, 0, 0)), y: proj(new Vector3(0, 1, 0)), z: proj(new Vector3(0, 0, 1)) };
  }
}

function isShown(o: Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}
