import {
  Box3,
  BufferGeometry,
  type Camera,
  Color,
  ColorManagement,
  DepthTexture,
  LessEqualCompare,
  LinearFilter,
  Matrix3,
  Matrix4,
  OrthographicCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  type Texture,
  type Material,
  UnsignedIntType,
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
  WebGLRenderTarget,
  LinearSRGBColorSpace,
} from 'three';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';
import { registry } from '../import/registry';
import { effectReach, hasFinish, type EffectLook } from '../state/effects';
import { PostFX, type PassGeometry } from './post';
import { descendants, ancestors, isLockedInTree, resolveStyle } from '../state/scene';
import { store } from '../state/store';
import type { CameraState, GraphicStyle, ProjectDoc, UIState } from '../state/types';
import { aspectOf, validateSize } from '../state/output';
import { connectorSegments } from '../state/explode';
import { sectionNormal } from '../state/section';
import { drawPrims, layoutAnnotations, measureText, type LayoutResult, type Pt } from '../annotate/layout';
import type { Annotation } from '../state/types';
import { applyCamera, framePoints, ObliqueCamera, shearOf } from './camera';
import {
  createEdgeGeometry,
  createFillMaterial,
  createGroundMaterial,
  createLineMaterial,
  createShadowDepthMaterial,
  createCutoutDepthMaterial,
  createCapMaterial,
  createCapStencilMaterial,
  shared,
  type CutoutDepthMaterial,
  type FillMaterial,
  type GroundMaterial,
  type LineMaterial,
} from './materials';

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
  cast: boolean;
  fillNone: boolean;
  /** Section caps: stencil-parity pass (shares the body geometry) and the cap quad on the plane. */
  capStencil: Mesh | null;
  /** Texture whose transparent pixels are cut out (shown image planes, glTF MASK), and its shadow-depth material. */
  cutout: { map: Texture; cut: number } | null;
  cutoutDepth: CutoutDepthMaterial | null;
}

/** A solid for section poché: one or more meshes whose faces are counted together. */
interface CapUnit {
  key: string;
  /** Node whose style colours the poché (the group, for combined solids). */
  styleId: string;
  members: RenderObject[];
  box: Box3;
  cut: boolean;
}

const HATCH: Record<string, number> = { none: 0, lines: 1, cross: 2, dots: 3 };

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
  private ground: Mesh | null = null;
  private groundMat: GroundMaterial | null = null;
  private shadowRT: WebGLRenderTarget | null = null;
  /** Image effects: the scene is drawn into fxScene, then the effect chain runs in fxTargets onto the canvas. */
  private fx: PostFX | null = null;
  private fxScene: WebGLRenderTarget | null = null;
  private fxTargets: FxTargets = { mid: [], masks: [] };
  /** Layer-look numbers (1-based) that some object uses, from the last style sync. */
  private usedLooks = new Set<number>();
  private lookKey = '';
  private shadowCam = new OrthographicCamera();
  private shadowDepthMat: ShaderMaterial | null = null;
  private shadowDirty = true;
  private connectors: Mesh | null = null;
  private connectorMat: LineMaterial | null = null;
  private renderListeners = new Set<() => void>();
  private capStencilMat = createCapStencilMaterial();
  private capQuad = new PlaneGeometry(1, 1);
  /** Poché caps, one per cut solid. */
  private caps = new Map<string, { mesh: Mesh; mat: FillMaterial }>();
  private openCache = new Map<string, boolean>();
  /** One cut-line mesh per distinct (colour, weight), so objects can have their own cut lineweights. */
  private cutLines: { mesh: Mesh; mat: LineMaterial }[] = [];
  readonly clipPlane = new Plane(new Vector3(0, 1, 0), 0);
  cssW = 1;
  cssH = 1;
  onRender: (() => void) | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, stencil: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
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
    this.ground?.geometry.dispose();
    this.groundMat?.dispose();
    this.shadowRT?.dispose();
    this.shadowDepthMat?.dispose();
    this.fx?.dispose();
    this.fxScene?.dispose();
    disposeTargets(this.fxTargets);
    this.connectors?.geometry.dispose();
    this.connectorMat?.dispose();
    this.capStencilMat.dispose();
    this.capQuad.dispose();
    this.caps.forEach((c) => c.mat.dispose());
    this.clearCutLines();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ------------------------------------------------------------ sync

  private onStore() {
    const { doc, ui } = store.get();
    if (doc === this.lastDoc && ui === this.lastUI) return;
    const prev = this.lastDoc;
    const tree = !prev || doc.nodes !== prev.nodes || doc.roots !== prev.roots;
    const exploded = !prev || doc.explode !== prev.explode;
    const structural = tree || exploded;
    if (structural) this.syncStructure(doc);
    const lookKey = doc.effects.looks.map((l) => l.id).join('|');
    const looksMoved = lookKey !== this.lookKey;
    this.lookKey = lookKey;
    if (structural || looksMoved || ui.selection !== this.lastUI?.selection || ui.isolated !== this.lastUI?.isolated || doc.defaults !== prev?.defaults || doc.drawing !== prev?.drawing)
      this.syncStyles(doc, ui);
    if (tree || doc.drawing.showGrid !== prev?.drawing.showGrid) this.syncGrid(doc);
    if (structural || doc.drawing !== prev?.drawing) this.syncGround(doc);
    if (structural || ui.isolated !== this.lastUI?.isolated) this.syncConnectors(doc, ui);
    if (structural || looksMoved || doc.section !== prev?.section || doc.defaults !== prev?.defaults || ui.isolated !== this.lastUI?.isolated) this.syncSection(doc);
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
    const ex = doc.explode;
    const local = new Matrix4();
    const lin = new Matrix3();
    const off = new Vector3();
    const walk = (id: string, parent: Object3D, parentWorld: Matrix4) => {
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
      local.fromArray(n.matrix);
      g.matrix.copy(local);
      // Exploded: a world-space move, expressed in the parent's frame so the
      // node also carries everything its exploded ancestors did.
      const o = ex.offsets[id];
      if (o && ex.amount > 0 && (o[0] || o[1] || o[2]) && Math.abs(parentWorld.determinant()) > 1e-18) {
        lin.setFromMatrix4(parentWorld).invert();
        off.set(o[0], o[1], o[2]).multiplyScalar(ex.amount).applyMatrix3(lin);
        g.matrix.premultiply(new Matrix4().makeTranslation(off.x, off.y, off.z));
      }
      g.matrixWorldNeedsUpdate = true;
      const assembledWorld = parentWorld.clone().multiply(local);
      if (g.parent !== parent) parent.add(g);
      if (n.geom) this.ensureRObj(id, `${n.geom.model}|${n.geom.index}`, n.geom.model, n.geom.index, g);
      else this.dropRObj(id);
      n.children.forEach((c) => walk(c, g!, assembledWorld));
    };
    doc.roots.forEach((r) => walk(r, this.world, new Matrix4()));
    for (const [id, g] of this.groups) {
      if (seen.has(id)) continue;
      g.removeFromParent();
      this.groups.delete(id);
      this.dropRObj(id);
    }
    // Keep children in document order (affects transparent sorting ties only).
    this.world.updateMatrixWorld(true);
    this.boundsCache = null;
    this.shadowDirty = true;

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
      r = { id, key, host, body: null, fillMats: [], lines: null, hidden: null, lineMat: createLineMaterial(false), hiddenMat: createLineMaterial(true), cast: true, fillNone: false, capStencil: null, cutout: null, cutoutDepth: null };
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
    r.capStencil?.removeFromParent();
    r.fillMats.forEach((m) => m.dispose());
    r.cutoutDepth?.dispose();
    r.lineMat.dispose();
    r.hiddenMat.dispose();
    this.robjs.delete(id);
  }

  private syncStyles(doc: ProjectDoc, ui: UIState) {
    this.usedLooks.clear();
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
      r.cutout = null;
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
        const cut = map ? info?.alphaCut ?? 0 : 0;
        u.uAlphaCut.value = cut;
        // Shadows follow the cutout of a single-material mesh (image planes); multi-material casts its full shape.
        if (map && cut > 0 && r.fillMats.length === 1) r.cutout = { map, cut };
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
        u.uReceive.value = s.receiveShadow ? 1 : 0;
        u.uHatch.value = HATCH[s.hatch] ?? 0;
        u.uHatchColor.value.set(s.hatchColor);
        u.uHatchSpacing.value = s.hatchSpacing;
        u.uHatchWidth.value = s.hatchWidth;
        const ha = MathUtils.degToRad(s.hatchAngle);
        u.uHatchDir.value.set(Math.cos(ha), Math.sin(ha));
      });
      const look = lookNumber(doc, s.fxLook);
      if (look) this.usedLooks.add(look);
      r.fillMats.forEach((m) => (m.uniforms.uFx.value = look));
      r.lineMat.uniforms.uFx.value = r.hiddenMat.uniforms.uFx.value = look;
      r.cast = s.castShadow && !isLine;
      r.fillNone = s.fillMode === 'none';
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
      if (r.hidden) r.hidden.visible = (s.showLines || isLine) && dr.hiddenLines && s.lineOrder === 'normal';
      // Draw order. "behind" moves the lines into the opaque pass, before every fill.
      const order = s.lineOrder;
      const lm = r.lineMat;
      const transparent = order !== 'behind';
      if (lm.transparent !== transparent) {
        lm.transparent = transparent;
        lm.needsUpdate = true;
      }
      lm.depthTest = order === 'normal';
      if (r.lines) r.lines.renderOrder = order === 'front' ? 20 : order === 'behind' ? -1 : 10;
    }
    shared.uShadowOn.value = dr.shadows === 'off' ? 0 : 1;
    shared.uShadowMode.value = dr.shadows === 'soft' ? 1 : 0;
    shared.uShadowColor.value.set(dr.shadowColor);
    shared.uShadowOpacity.value = dr.shadowOpacity;
    shared.uShadeFaces.value = dr.shadeFaces ? 1 : 0;
    this.shadowDirty = true;
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

  // ------------------------------------------------------------ section cut

  /**
   * Plans and sections. Every material discards the cut-away side (shader
   * clipping), each cut solid gets a poché cap via a per-object stencil parity
   * pass, and the exact intersection of the plane with every triangle is drawn
   * as a heavy cut line.
   */
  private syncSection(doc: ProjectDoc) {
    const sec = doc.section;
    const n = sectionNormal(sec);
    this.clipPlane.set(n, -sec.offset);
    shared.uClipOn.value = sec.enabled ? 1 : 0;
    shared.uClipPlane.value.set(n.x, n.y, n.z, -sec.offset);
    this.shadowDirty = true;
    this.world.updateMatrixWorld(true);

    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
    const box = new Box3();
    const cut: { mesh: Mesh; color: string; width: number; fx: number }[] = [];
    const styles = new Map<string, GraphicStyle>();
    const style = (id: string) => {
      let st = styles.get(id);
      if (!st) styles.set(id, (st = resolveStyle(doc, id)));
      return st;
    };

    // 1. Cut lines per mesh, and group meshes into solids for the poché.
    const units = new Map<string, CapUnit>();
    for (const r of this.robjs.values()) {
      if (r.capStencil) r.capStencil.visible = false;
      const mesh = r.body instanceof Mesh ? r.body : null;
      if (!sec.enabled || !mesh || !isShown(r.host)) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
      const on = box.intersectsPlane(this.clipPlane);
      const st = style(r.id);
      if (on && st.cutLineWidth > 0) cut.push({ mesh, color: st.cutLineColor, width: st.cutLineWidth, fx: lookNumber(doc, st.fxLook) });
      if (!sec.caps) continue;
      const { key, styleId } = this.capUnitOf(doc, r, style);
      let u = units.get(key);
      if (!u) units.set(key, (u = { key, styleId, members: [], box: new Box3(), cut: false }));
      u.members.push(r);
      u.box.union(box);
      if (on) u.cut = true;
    }

    // 2. One cap per cut solid. Every member joins the stencil count, including
    //    parts the plane misses (a pot's base closes the wall the cut runs through).
    let i = 0;
    const live = new Set<string>();
    for (const u of units.values()) {
      if (!u.cut) continue;
      const st = style(u.styleId);
      if (!st.cutFill || u.members.every((m) => m.fillNone)) continue;
      let cap = this.caps.get(u.key);
      if (!cap) {
        const mat = createCapMaterial();
        const mesh = new Mesh(this.capQuad, mat);
        mesh.raycast = () => {};
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.caps.set(u.key, (cap = { mesh, mat }));
      }
      live.add(u.key);
      const cu = cap.mat.uniforms;
      cu.uColor.value.set(st.cutFillColor);
      cu.uHatch.value = HATCH[st.cutHatch] ?? 0;
      cu.uHatchColor.value.set(st.cutHatchColor);
      cu.uHatchSpacing.value = st.cutHatchSpacing;
      cu.uHatchWidth.value = st.cutHatchWidth;
      const ha = MathUtils.degToRad(st.cutHatchAngle);
      cu.uHatchDir.value.set(Math.cos(ha), Math.sin(ha));
      cu.uFx.value = lookNumber(doc, st.fxLook);
      // Stencil pass for every member of the solid, then the cap (which clears the stencil).
      for (const m of u.members) {
        if (!m.capStencil) {
          m.capStencil = new Mesh((m.body as Mesh).geometry, this.capStencilMat);
          m.capStencil.matrixAutoUpdate = false;
          m.capStencil.raycast = () => {};
          m.capStencil.frustumCulled = false;
          m.host.add(m.capStencil);
        }
        m.capStencil.renderOrder = 100 + i * 2;
        m.capStencil.visible = true;
      }
      cap.mesh.renderOrder = 101 + i * 2;
      i++;
      const c = u.box.getCenter(new Vector3());
      c.addScaledVector(n, -(n.dot(c) - sec.offset));
      cap.mesh.position.copy(c);
      cap.mesh.quaternion.copy(q);
      const size = u.box.getSize(new Vector3()).length() * 1.2 + 1e-6;
      cap.mesh.scale.set(size, size, 1);
      cap.mesh.updateMatrixWorld();
      cap.mesh.visible = true;
    }
    for (const [key, cap] of this.caps) {
      if (live.has(key)) continue;
      cap.mesh.removeFromParent();
      cap.mat.dispose();
      this.caps.delete(key);
    }
    this.syncCutLines(sec.enabled && sec.cutLines ? cut : [], doc);
  }

  /**
   * The solid a mesh is filled with:
   *  - the topmost group set to "Cut as one solid" above it (or itself);
   *  - otherwise, if the mesh is an open surface, all open surfaces sharing its parent group;
   *  - otherwise the mesh alone (closed meshes stay separate so overlaps don't cancel).
   */
  private capUnitOf(doc: ProjectDoc, r: RenderObject, style: (id: string) => GraphicStyle): { key: string; styleId: string } {
    const chain = [...ancestors(doc, r.id)].reverse();
    chain.push(r.id);
    for (const id of chain) if (style(id).cutSolid) return { key: `solid:${id}`, styleId: id };
    const parent = doc.nodes[r.id]?.parent;
    if (parent && this.isOpenSurface(r.key)) return { key: `open:${parent}`, styleId: parent };
    return { key: `mesh:${r.id}`, styleId: r.id };
  }

  /** True if the mesh has boundary (open) edges, from the edge worker's classification. */
  private isOpenSurface(key: string): boolean {
    const hit = this.openCache.get(key);
    if (hit !== undefined) return hit;
    const [model, index] = key.split('|');
    const e = registry.get(model)?.edges[+index];
    if (!e) return false; // not analysed yet; re-synced when the edge worker finishes
    let open = false;
    for (let k = 0; k < e.count; k++) if (e.kind[k] === 1) { open = true; break; }
    this.openCache.set(key, open);
    return open;
  }

  private clearCutLines() {
    for (const c of this.cutLines) {
      c.mesh.removeFromParent();
      c.mesh.geometry.dispose();
      c.mat.dispose();
    }
    this.cutLines = [];
  }

  /**
   * Intersection of the cut plane with every triangle of the cut meshes, in
   * world space, batched by line style (colour + weight).
   */
  private syncCutLines(items: { mesh: Mesh; color: string; width: number; fx: number }[], _doc: ProjectDoc) {
    this.clearCutLines();
    if (!items.length) return;
    const groups = new Map<string, { color: string; width: number; fx: number; out: number[] }>();
    for (const it of items) {
      const key = `${it.color}|${it.width}|${it.fx}`;
      if (!groups.has(key)) groups.set(key, { color: it.color, width: it.width, fx: it.fx, out: [] });
      this.intersect(it.mesh, groups.get(key)!.out);
    }
    for (const g of groups.values()) {
      if (!g.out.length) continue;
      const count = g.out.length / 6;
      const geom = createEdgeGeometry({ segments: new Float32Array(g.out), n1: new Int8Array(count * 3), n2: new Int8Array(count * 3), kind: new Uint8Array(count).fill(3), count });
      const mat = createLineMaterial(false);
      // Cut lines lie on the plane itself: never clip them.
      mat.uniforms.uClipOn = { value: 0 };
      const u = mat.uniforms;
      u.uSilW.value = u.uCreaseW.value = u.uOpenW.value = u.uMatW.value = u.uAllW.value = 0;
      u.uCurveW.value = g.width;
      u.uColor.value.set(g.color);
      u.uFx.value = g.fx;
      u.uDepthBias.value = 1e-4;
      const mesh = new Mesh(geom, mat);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      // Heavier lines draw last, so they win where cut lines of different weights meet.
      mesh.renderOrder = 11 + Math.min(0.9, g.width / 100);
      mesh.raycast = () => {};
      this.scene.add(mesh);
      this.cutLines.push({ mesh, mat });
    }
  }

  /** Append the plane ∩ triangles of one mesh (world-space segments) to `out`. */
  private intersect(m: Mesh, out: number[]) {
    const local = new Plane();
    const inv = new Matrix4();
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    const pts: Vector3[] = [new Vector3(), new Vector3()];
    {
      const g = m.geometry;
      const pos = g.attributes.position;
      if (!pos) return;
      inv.copy(m.matrixWorld).invert();
      local.copy(this.clipPlane).applyMatrix4(inv);
      const idx = g.index;
      const tris = idx ? idx.count / 3 : pos.count / 3;
      const nx = local.normal.x, ny = local.normal.y, nz = local.normal.z, w = local.constant;
      for (let t = 0; t < tris; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0);
        b.fromBufferAttribute(pos, i1);
        c.fromBufferAttribute(pos, i2);
        const da = nx * a.x + ny * a.y + nz * a.z + w, db = nx * b.x + ny * b.y + nz * b.z + w, dc = nx * c.x + ny * c.y + nz * c.z + w;
        const pa = da >= 0, pb = db >= 0, pc = dc >= 0;
        if (pa === pb && pb === pc) continue;
        let k = 0;
        const edge = (p: Vector3, q: Vector3, dp: number, dq: number) => {
          if (dp >= 0 === dq >= 0 || k > 1) return;
          pts[k++].copy(p).lerp(q, dp / (dp - dq));
        };
        edge(a, b, da, db);
        edge(b, c, db, dc);
        edge(c, a, dc, da);
        if (k < 2) continue;
        pts[0].applyMatrix4(m.matrixWorld);
        pts[1].applyMatrix4(m.matrixWorld);
        out.push(pts[0].x, pts[0].y, pts[0].z, pts[1].x, pts[1].y, pts[1].z);
      }
    }
  }

  /** True if a world point is on the kept side of the cut (or there is no cut). */
  private keptBySection(p: Vector3) {
    return !store.get().doc.section.enabled || this.clipPlane.distanceToPoint(p) <= 1e-9;
  }

  // ------------------------------------------------------------ exploded drawing

  /** Connector lines from each moved part's assembled anchors to where they are now. */
  private syncConnectors(doc: ProjectDoc, ui: UIState) {
    const isoSet = ui.isolated ? new Set(ui.isolated.flatMap((id) => [id, ...descendants(doc, id), ...ancestors(doc, id)])) : null;
    const shown = (id: string) => {
      let n = doc.nodes[id];
      if (isoSet && !isoSet.has(id)) return false;
      while (n) {
        if (!n.visible) return false;
        n = n.parent ? doc.nodes[n.parent] : (undefined as any);
      }
      return true;
    };
    const segs = connectorSegments(doc, shown);
    if (this.connectors) {
      this.connectors.removeFromParent();
      this.connectors.geometry.dispose();
      this.connectors = null;
    }
    if (!segs.length) return;
    const count = segs.length / 6;
    const geom = createEdgeGeometry({
      segments: new Float32Array(segs),
      n1: new Int8Array(count * 3),
      n2: new Int8Array(count * 3),
      kind: new Uint8Array(count).fill(3),
      count,
    });
    if (!this.connectorMat) this.connectorMat = createLineMaterial(false);
    const e = doc.explode;
    const u = this.connectorMat.uniforms;
    u.uSilW.value = u.uCreaseW.value = u.uOpenW.value = u.uMatW.value = u.uAllW.value = 0;
    u.uCurveW.value = e.connectorWidth;
    u.uColor.value.set(e.connectorColor);
    const [dash, gap, dotted] = DASH[e.connectorStyle] ?? DASH.solid;
    u.uDash.value = dash;
    u.uGap.value = gap;
    u.uDotted.value = dotted;
    this.connectorMat.depthTest = e.connectorOccluded;
    this.connectors = new Mesh(geom, this.connectorMat);
    this.connectors.frustumCulled = false;
    this.connectors.matrixAutoUpdate = false;
    this.connectors.renderOrder = 12;
    this.connectors.raycast = () => {};
    this.scene.add(this.connectors);
  }

  // ------------------------------------------------------------ annotations

  /** An annotation's anchor in world space: its node-local point through the node's current (exploded) transform. */
  anchorWorld(a: Annotation): Vector3 | null {
    const g = this.groups.get(a.node);
    if (!g || !isShown(g)) return null;
    this.world.updateMatrixWorld();
    return new Vector3(...a.anchor).applyMatrix4(g.matrixWorld);
  }

  /** World point → node-local point, for storing an anchor. */
  toNodeLocal(id: string, world: Vector3): [number, number, number] | null {
    const g = this.groups.get(id);
    if (!g) return null;
    this.world.updateMatrixWorld();
    const v = world.clone().applyMatrix4(g.matrixWorld.clone().invert());
    return [v.x, v.y, v.z];
  }

  /** Surface point and node under the cursor. */
  pickPoint(clientX: number, clientY: number): { id: string; point: Vector3 } | null {
    const { doc } = store.get();
    const candidates = this.visibleBodies().filter((b) => b instanceof Mesh && !isLockedInTree(doc, b.userData.nodeId));
    const rc = this.ray(clientX, clientY);
    if (store.get().doc.section.enabled) (rc as any).firstHitOnly = false;
    const hit = rc.intersectObjects(candidates, false).find((h) => this.keptBySection(h.point));
    return hit ? { id: hit.object.userData.nodeId as string, point: hit.point.clone() } : null;
  }

  /** Visible node ids, as currently drawn (hidden and isolated-out nodes excluded). */
  isNodeShown(id: string) {
    const g = this.groups.get(id);
    return !!g && isShown(g);
  }

  /**
   * Lay out annotations for a frame of W × H px, given a world → frame-pixel
   * projection. The viewport overlay and the PNG export both call this.
   */
  layoutLabels(project: (v: Vector3) => Pt | null, W: number, H: number, doc: ProjectDoc = store.get().doc): LayoutResult {
    const k = W / doc.drawing.referenceWidth;
    let rect: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (doc.annotations.items.length && doc.annotations.settings.layout !== 'free') {
      for (const v of this.corners()) {
        const q = project(v);
        if (!q) continue;
        rect = rect ? { x0: Math.min(rect.x0, q[0]), y0: Math.min(rect.y0, q[1]), x1: Math.max(rect.x1, q[0]), y1: Math.max(rect.y1, q[1]) } : { x0: q[0], y0: q[1], x1: q[0], y1: q[1] };
      }
    }
    return layoutAnnotations({
      doc,
      frameW: W,
      frameH: H,
      scale: k,
      anchorOf: (a) => {
        const w = this.anchorWorld(a);
        return w ? project(w) : null;
      },
      modelRect: rect,
      measure: measureText,
      background: doc.drawing.background,
    });
  }

  /** Viewport CSS position of a world point, using the camera of the last render. */
  project(p: Vector3): { x: number; y: number; behind: boolean } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.cssW, y: ((1 - v.y) / 2) * this.cssH, behind: v.z > 1 || v.z < -1 };
  }

  /** Called after every viewport render (overlays that track the scene). */
  onAfterRender(fn: () => void) {
    this.renderListeners.add(fn);
    return () => {
      this.renderListeners.delete(fn);
    };
  }

  // ------------------------------------------------------------ ground & shadows

  private syncGround(doc: ProjectDoc) {
    const dr = doc.drawing;
    if (dr.ground === 'off') {
      if (this.ground) this.ground.visible = false;
      return;
    }
    if (!this.ground) {
      this.groundMat = createGroundMaterial();
      this.ground = new Mesh(new PlaneGeometry(1, 1), this.groundMat);
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.renderOrder = -2;
      this.ground.raycast = () => {};
      this.ground.frustumCulled = false;
      this.scene.add(this.ground);
    }
    const b = this.sceneBounds();
    const size = b.isEmpty() ? 20 : Math.max(...b.getSize(new Vector3()).toArray());
    const c = b.isEmpty() ? new Vector3() : b.getCenter(new Vector3());
    // Large enough that its edge stays out of view at any normal framing.
    this.ground.scale.set(size * 60, size * 60, 1);
    this.ground.position.set(c.x, b.isEmpty() ? 0 : b.min.y, c.z);
    this.ground.visible = true;
    const shadowOnly = dr.ground === 'shadow';
    const m = this.groundMat!;
    m.uniforms.uColor.value.set(dr.groundColor);
    m.uniforms.uShadowOnly.value = shadowOnly ? 1 : 0;
    if (m.transparent !== shadowOnly) {
      m.transparent = shadowOnly;
      m.needsUpdate = true;
    }
    m.depthWrite = !shadowOnly;
  }

  /**
   * Directional shadow map, fitted to the bounds of the shadow-casting objects
   * as seen from the sun. Re-rendered only when the scene, styles or light
   * change, not per frame: the camera does not affect it.
   */
  private renderShadowMap(doc: ProjectDoc) {
    this.shadowDirty = false;
    if (doc.drawing.shadows === 'off') return;
    const casters = [...this.robjs.values()].filter((r) => r.cast && r.body instanceof Mesh && isShown(r.host));
    const size = Math.min(4096, this.renderer.capabilities.maxTextureSize);
    if (!this.shadowRT) {
      const dt = new DepthTexture(size, size);
      dt.type = UnsignedIntType;
      dt.compareFunction = LessEqualCompare;
      dt.minFilter = dt.magFilter = LinearFilter;
      this.shadowRT = new WebGLRenderTarget(size, size, { depthBuffer: true, depthTexture: dt });
      this.shadowDepthMat = createShadowDepthMaterial();
      shared.uShadowMap.value = dt;
    }
    const L = shared.uLightDir.value;
    this.world.updateMatrixWorld(true);
    const box = new Box3();
    const tmp = new Box3();
    for (const r of casters) {
      const g = r.body!.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      box.union(tmp.copy(g.boundingBox!).applyMatrix4(r.body!.matrixWorld));
    }
    const cam = this.shadowCam;
    const center = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
    const radius = box.isEmpty() ? 1 : Math.max(box.getSize(new Vector3()).length() / 2, 1e-6);
    cam.position.copy(center).addScaledVector(L, radius * 3);
    cam.up.set(0, Math.abs(L.y) > 0.99 ? 0 : 1, Math.abs(L.y) > 0.99 ? 1 : 0);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    // Tight fit of the casters' corners in light space.
    const inv = cam.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const v = new Vector3();
    for (const r of casters) {
      const bb = r.body!.geometry.boundingBox!;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(r.body!.matrixWorld).applyMatrix4(inv);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
        z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      }
    }
    if (!casters.length) { x0 = y0 = -1; x1 = y1 = 1; z0 = -radius * 4; z1 = -radius * 2; }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.02 + 1e-6;
    cam.left = x0 - pad; cam.right = x1 + pad; cam.bottom = y0 - pad; cam.top = y1 + pad;
    cam.near = Math.max(1e-6, -z1 - pad); cam.far = -z0 + pad;
    cam.updateProjectionMatrix();
    const extent = Math.max(cam.right - cam.left, cam.top - cam.bottom);
    const texel = extent / size;
    shared.uShadowTexel.value = texel;
    shared.uShadowBias.value = (1.5 * texel) / (cam.far - cam.near);
    shared.uShadowRadius.value = (Math.pow(doc.drawing.shadowSoftness, 1.5) * radius * 0.08) / extent;
    shared.uShadowMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);

    // Depth-only pass with just the casters.
    const restore: [Object3D, boolean][] = [];
    const hide = (o: Object3D | null | undefined) => {
      if (!o) return;
      restore.push([o, o.visible]);
      o.visible = false;
    };
    for (const r of this.robjs.values()) {
      hide(r.lines);
      hide(r.hidden);
      hide(r.capStencil);
      if (!casters.includes(r)) hide(r.body);
    }
    hide(this.grid);
    hide(this.ground);
    this.caps.forEach((c) => hide(c.mesh));
    hide(this.connectors);
    this.cutLines.forEach((c) => hide(c.mesh));
    // Each caster draws with the depth-only material, or a cutout one so transparent pixels cast nothing.
    const swapped: [Mesh, Material | Material[]][] = [];
    for (const r of casters) {
      const body = r.body as Mesh;
      swapped.push([body, body.material]);
      if (r.cutout) {
        r.cutoutDepth ??= createCutoutDepthMaterial();
        r.cutoutDepth.uniforms.uMap.value = r.cutout.map;
        r.cutoutDepth.uniforms.uAlphaCut.value = r.cutout.cut;
        body.material = r.cutoutDepth;
      } else body.material = this.shadowDepthMat!;
    }
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.shadowRT);
    this.renderer.clear(true, true, false);
    if (casters.length) this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(prevTarget);
    for (const [m, mat] of swapped) m.material = mat;
    for (const [o, vis] of restore) o.visible = vis;
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
    this.updateFrame(aspectOf(doc.output));
    const f = framePoints(doc.camera, this.corners(only), aspectOf(doc.output), 1.1);
    if (!f) return;
    store.setDoc((d) => ({ ...d, camera: { ...d.camera, ...f } }), { history: false });
  }

  worldPerPixel(c: CameraState = store.get().doc.camera) {
    return c.height / this.frame.h;
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
    const rc = this.ray(clientX, clientY);
    if (store.get().doc.section.enabled) (rc as any).firstHitOnly = false;
    const hits = rc.intersectObjects(candidates, false).filter((h) => this.keptBySection(h.point));
    return (hits[0]?.object.userData.nodeId as string) ?? null;
  }

  // ------------------------------------------------------------ render

  private resize() {
    const r = this.container.getBoundingClientRect();
    this.cssW = Math.max(1, Math.floor(r.width));
    this.cssH = Math.max(1, Math.floor(r.height));
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.updateFrame(aspectOf(store.get().doc.output));
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

  // ------------------------------------------------------------ frame

  /** Drawing frame in viewport CSS pixels: the export aspect, fitted inside the viewport with a margin. */
  frame: Frame = { x: 0, y: 0, w: 1, h: 1 };
  private frameListeners = new Set<(f: Frame) => void>();

  onFrame(fn: (f: Frame) => void) {
    this.frameListeners.add(fn);
    fn(this.frame);
    return () => {
      this.frameListeners.delete(fn);
    };
  }

  private updateFrame(aspect: number) {
    const mx = FRAME_MARGIN.side, top = FRAME_MARGIN.top, bottom = FRAME_MARGIN.bottom;
    const aw = Math.max(16, this.cssW - mx * 2), ah = Math.max(16, this.cssH - top - bottom);
    let w = aw, h = aw / aspect;
    if (h > ah) {
      h = ah;
      w = ah * aspect;
    }
    const f = { x: Math.round((this.cssW - w) / 2), y: Math.round(top + (ah - h) / 2), w: Math.round(w), h: Math.round(h) };
    const old = this.frame;
    if (f.x === old.x && f.y === old.y && f.w === old.w && f.h === old.h) return;
    this.frame = f;
    this.frameListeners.forEach((l) => l(f));
  }

  // ------------------------------------------------------------ render

  private sceneRadius(c: CameraState) {
    const b = this.sceneBounds();
    return b.isEmpty() ? 1000 : (b.getCenter(new Vector3()).distanceTo(new Vector3(...c.target)) + b.getSize(new Vector3()).length() / 2) * 4 + 1;
  }

  /** Uniforms that depend on the camera and the pixel grid being drawn into. */
  private setViewUniforms(c: CameraState, resolutionX: number, resolutionY: number, lineScale: number, hatchOrigin: [number, number]) {
    shared.uHatchOrigin.value.set(hatchOrigin[0], hatchOrigin[1]);
    shared.uPersp.value = c.projection === 'persp' ? 1 : 0;
    const [sx, sy] = shearOf(c);
    shared.uViewDirOrtho.value.set(sx, sy, 1).normalize();
    shared.uResolution.value.set(resolutionX, resolutionY);
    shared.uLineScale.value = lineScale;
  }

  render() {
    if (this.exporting) return;
    const { doc } = store.get();
    this.updateFrame(aspectOf(doc.output));
    const f = this.frame;
    // The camera frames the drawing frame; the viewport sees a little more around it.
    this.camera = applyCamera(doc.camera, this.ortho, this.persp, this.cssW / this.cssH, this.sceneRadius(doc.camera), this.cssH / f.h);
    const pr = this.renderer.getPixelRatio();
    // Lineweights are authored at the reference width and scale with the frame, exactly as in the export.
    // gl_FragCoord is bottom-up; the hatch origin is the frame centre.
    this.setViewUniforms(doc.camera, this.cssW * pr, this.cssH * pr, (f.w * pr) / doc.drawing.referenceWidth, [(f.x + f.w / 2) * pr, (this.cssH - f.y - f.h / 2) * pr]);
    if (this.shadowDirty) this.renderShadowMap(doc);
    this.renderer.setClearColor(doc.drawing.background, 1);
    if (doc.effects.enabled) this.renderEffects(doc, f, pr);
    else this.renderer.render(this.scene, this.camera);
    this.onRender?.();
    this.renderListeners.forEach((l) => l());
  }

  private renderEffects(doc: ProjectDoc, f: Frame, pr: number) {
    const W = this.canvas.width, H = this.canvas.height;
    const samples = Math.min(4, this.renderer.capabilities.maxSamples);
    if (!this.fxScene) this.fxScene = new WebGLRenderTarget(W, H, { samples, depthBuffer: true, stencilBuffer: true });
    if (this.fxScene.width !== W || this.fxScene.height !== H) this.fxScene.setSize(W, H);
    this.fx ??= new PostFX();
    this.renderer.setRenderTarget(this.fxScene);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    const refW = doc.drawing.referenceWidth;
    this.runEffects({
      doc,
      cam: this.camera,
      scene: this.fxScene,
      sceneOrigin: [-(f.x + f.w / 2) * pr, -(this.cssH - f.y - f.h / 2) * pr],
      mid: { w: W, h: H, offset: [0, 0] },
      out: { target: null, offset: [0, 0] },
      scale: (f.w * pr) / refW,
      frameHalf: [refW / 2, ((refW / 2) * f.h) / f.w],
      transparent: false,
      targets: this.fxTargets,
      samples,
    });
  }

  /** Layer looks that some object uses, with their 1-based numbers (the value in the mask). */
  private activeLooks(doc: ProjectDoc): { n: number; e: EffectLook }[] {
    return doc.effects.looks.map((e, i) => ({ n: i + 1, e })).filter((l) => this.usedLooks.has(l.n));
  }

  /** How far the effect chain looks around a pixel (px at the reference width): stylize, then the finishes in sequence. */
  private effectsReach(doc: ProjectDoc): { stylize: number; finish: number } {
    const looks = this.activeLooks(doc).map((l) => l.e);
    const stylize = Math.max(...[doc.effects.drawing, ...looks].map((e) => effectReach(e).stylize));
    const layerFinish = Math.max(0, ...looks.filter(hasFinish).map((e) => effectReach(e).finish));
    return { stylize, finish: effectReach(doc.effects.drawing).finish + layerFinish };
  }

  /**
   * The effect chain. Every look samples the plain drawing (`scene`):
   *  1. the whole-drawing look, then each layer look over it, on its own layers;
   *  2. each layer look's finish, on its own layers;
   *  3. the whole-drawing finish over everything, into `out`.
   * Intermediate results cover `mid` (placed at `mid.offset` in the scene);
   * `out` is placed at `out.offset` in `mid`. Positions are bottom-up pixels.
   */
  private runEffects(p: {
    doc: ProjectDoc;
    cam: Camera;
    scene: WebGLRenderTarget;
    /** Device px from the scene's pixel (0,0) to the frame centre. */
    sceneOrigin: [number, number];
    mid: { w: number; h: number; offset: [number, number] };
    out: { target: WebGLRenderTarget | null; offset: [number, number] };
    scale: number;
    frameHalf: [number, number];
    transparent: boolean;
    targets: FxTargets;
    samples: number;
  }) {
    const { doc, scale, frameHalf, transparent: tr } = p;
    const fx = (this.fx ??= new PostFX());
    const r = this.renderer;
    const bg = doc.drawing.background;
    const looks = this.activeLooks(doc);
    const sw = p.scene.width, sh = p.scene.height;

    // Masks: three looks per render, one per colour channel.
    for (const gi of new Set(looks.map((l) => Math.floor((l.n - 1) / 3)))) {
      let m = p.targets.masks[gi];
      if (!m) m = p.targets.masks[gi] = new WebGLRenderTarget(sw, sh, { samples: p.samples, depthBuffer: true, stencilBuffer: true });
      else if (m.width !== sw || m.height !== sh) m.setSize(sw, sh);
      this.renderMask(m, p.cam, bg, gi * 3);
    }
    for (let i = 0; i < 3; i++) {
      const t = p.targets.mid[i];
      if (!t) p.targets.mid[i] = new WebGLRenderTarget(p.mid.w, p.mid.h, { depthBuffer: false });
      else if (t.width !== p.mid.w || t.height !== p.mid.h) t.setSize(p.mid.w, p.mid.h);
    }
    const [M0, M1, M2] = p.targets.mid;
    const maskOf = (n: number) => p.targets.masks[Math.floor((n - 1) / 3)].texture;
    const midOrigin: [number, number] = [p.sceneOrigin[0] + p.mid.offset[0], p.sceneOrigin[1] + p.mid.offset[1]];

    // 1. Stylize
    const gS: PassGeometry = { srcSize: [sw, sh], srcOffset: p.mid.offset, fragToFrame: midOrigin, scale };
    let cur = M0, spare = M1;
    fx.stylize(r, p.scene.texture, cur, gS, doc.effects.drawing, bg, tr);
    for (const l of looks) {
      fx.stylize(r, p.scene.texture, spare, gS, l.e, bg, tr, { mask: maskOf(l.n), channel: (l.n - 1) % 3, base: cur.texture });
      [cur, spare] = [spare, cur];
    }

    // 2. Layer finishes, each over the stylized result on its own layers
    const C = cur;
    const gM: PassGeometry = { srcSize: [p.mid.w, p.mid.h], srcOffset: [0, 0], fragToFrame: midOrigin, scale };
    let prev = C;
    let flip = false;
    for (const l of looks) {
      if (!hasFinish(l.e)) continue;
      const t = flip ? M2 : spare;
      flip = !flip;
      fx.finish(r, C.texture, t, gM, l.e, frameHalf, tr, { mask: maskOf(l.n), channel: (l.n - 1) % 3, base: prev === C ? null : prev.texture, maskSize: [sw, sh], maskOffset: p.mid.offset });
      prev = t;
    }

    // 3. Whole-drawing finish into the output
    const gO: PassGeometry = { srcSize: [p.mid.w, p.mid.h], srcOffset: p.out.offset, fragToFrame: [midOrigin[0] + p.out.offset[0], midOrigin[1] + p.out.offset[1]], scale };
    fx.finish(r, prev.texture, p.out.target, gO, doc.effects.drawing, frameHalf, tr);
  }

  /**
   * An image-effect mask: the scene drawn again with every material showing
   * which layer look its object uses, one-hot in RGB for looks base+1 … base+3.
   * The mask is exactly the visible surface of each look's layers.
   */
  private renderMask(target: WebGLRenderTarget, cam: Camera, background: string, base: number) {
    const gridWas = this.grid?.visible;
    if (this.grid) this.grid.visible = false;
    shared.uMaskPass.value = 1;
    shared.uMaskBase.value = base;
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor('#000000', 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(null);
    shared.uMaskPass.value = 0;
    this.renderer.setClearColor(background, 1);
    if (this.grid && gridWas !== undefined) this.grid.visible = gridWas;
  }

  /** Small JPEG of the frame for the saved-view strip. */
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
    const pr = this.renderer.getPixelRatio();
    const f = this.frame;
    const fx = f.x * pr, fy = f.y * pr, fw = f.w * pr, fh = f.h * pr;
    const scale = Math.max(w / fw, h / fh);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(this.canvas, fx + (fw - sw) / 2, fy + (fh - sh) / 2, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  }

  // ------------------------------------------------------------ export

  private exporting = false;

  /**
   * Render the drawing frame to a PNG at full output size. Large outputs are
   * rendered as tiles (each a slice of the same camera via setViewOffset) and
   * stitched on a 2D canvas, so the size is limited by the browser canvas,
   * not the GPU texture limit. Lines are drawn at output width / reference
   * width, matching the viewport.
   */
  async exportPNG(onProgress: (p: number) => void, signal: { cancelled: boolean }): Promise<Blob> {
    const { doc, ui } = store.get();
    const o = doc.output;
    const W = Math.round(o.width), H = Math.round(o.height);
    const problem = validateSize(W, H);
    if (problem) throw new Error(problem);
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) throw new Error('The graphics context was lost. Reload the page and try again.');
    const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    const refW = doc.drawing.referenceWidth;
    // With effects, each tile is rendered with a margin the effect can look into, so tiles join without seams.
    const fx = doc.effects.enabled;
    this.syncStyles(doc, { ...ui, selection: [] });
    const reach = fx ? this.effectsReach(doc) : { stylize: 0, finish: 0 };
    const apA = fx ? Math.min(1024, Math.ceil(reach.stylize * (W / refW)) + 1) : 0;
    const apB = fx ? Math.min(1024, Math.ceil(reach.finish * (W / refW)) + 1) : 0;
    const T = apA + apB;
    const tile = Math.max(256, Math.min(4096, maxRb, this.renderer.capabilities.maxTextureSize) - 2 * T);
    const samples = Math.min(o.antialias, this.renderer.capabilities.maxSamples);

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error(`Could not allocate a ${W} × ${H} canvas. Try a smaller size.`);

    this.exporting = true;
    const gridWas = this.grid?.visible;
    if (this.grid) this.grid.visible = o.includeGrid;
    const ortho = new ObliqueCamera();
    const persp = new PerspectiveCamera();
    const cam = applyCamera(doc.camera, ortho, persp, W / H, this.sceneRadius(doc.camera), 1);
    const rt = new WebGLRenderTarget(tile + 2 * T, tile + 2 * T, { samples, depthBuffer: true, stencilBuffer: true });
    const fxOut = fx ? new WebGLRenderTarget(tile, tile, { depthBuffer: false }) : null;
    const fxTargets: FxTargets = { mid: [], masks: [] };
    const pixels = new Uint8Array(tile * tile * 4);
    this.renderShadowMap(doc);
    const cols = Math.ceil(W / tile), rows = Math.ceil(H / tile);
    try {
      let done = 0;
      for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
          if (signal.cancelled) throw new ExportCancelled();
          const x = tx * tile, y = ty * tile;
          const w = Math.min(tile, W - x), h = Math.min(tile, H - y);
          // The rendered region: the tile plus the effect margin (none without effects).
          const sx = x - T, sy = y - T, sw = w + 2 * T, sh = h + 2 * T;
          cam.setViewOffset(W, H, sx, sy, sw, sh);
          rt.setSize(sw, sh);
          // Tile (x, y) is top-down; gl_FragCoord inside the tile is bottom-up.
          this.setViewUniforms(doc.camera, sw, sh, W / refW, [W / 2 - sx, sy + sh - H / 2]);
          this.renderer.setRenderTarget(rt);
          this.renderer.setClearColor(doc.drawing.background, o.transparent ? 0 : 1);
          this.renderer.clear(true, true, true);
          this.renderer.render(this.scene, cam);
          this.renderer.setRenderTarget(null);
          if (fx && fxOut) {
            fxOut.setSize(w, h);
            this.runEffects({
              doc,
              cam,
              scene: rt,
              sceneOrigin: [sx - W / 2, H / 2 - sy - sh],
              mid: { w: w + 2 * apB, h: h + 2 * apB, offset: [apA, apA] },
              out: { target: fxOut, offset: [apB, apB] },
              scale: W / refW,
              frameHalf: [refW / 2, (refW / 2) * (H / W)],
              transparent: o.transparent,
              targets: fxTargets,
              samples,
            });
            this.renderer.readRenderTargetPixels(fxOut, 0, 0, w, h, pixels);
          } else {
            this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
          }
          const img = ctx.createImageData(w, h);
          copyFlipped(pixels, img.data, w, h, o.transparent);
          ctx.putImageData(img, x, y);
          onProgress(++done / (cols * rows));
          // Yield so the progress bar paints and cancel stays responsive.
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (gl.isContextLost()) throw new Error('The graphics context was lost during export. Try a smaller size.');
      // Labels are vector-drawn on top at full resolution, with the same layout as the viewport.
      if (doc.annotations.settings.show && doc.annotations.items.length) {
        cam.clearViewOffset();
        cam.updateMatrixWorld();
        const project = (v: Vector3): Pt | null => {
          const q = v.clone().project(cam);
          if (q.z < -1 || q.z > 1) return null;
          return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H];
        };
        drawPrims(ctx, this.layoutLabels(project, W, H).prims);
      }
      return await new Promise<Blob>((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode the PNG (it may be too large).'))), 'image/png'),
      );
    } finally {
      rt.dispose();
      fxOut?.dispose();
      disposeTargets(fxTargets);
      this.renderer.setRenderTarget(null);
      if (this.grid && gridWas !== undefined) this.grid.visible = gridWas;
      this.exporting = false;
      this.syncStyles(store.get().doc, store.get().ui);
      this.invalidate();
    }
  }
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
  }
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FRAME_MARGIN = { side: 32, top: 34, bottom: 30 };

/** WebGL rows are bottom-up; canvas rows are top-down. Transparent output is un-premultiplied. */
function copyFlipped(src: Uint8Array, dst: Uint8ClampedArray, w: number, h: number, transparent: boolean) {
  const row = w * 4;
  for (let y = 0; y < h; y++) {
    const s = (h - 1 - y) * row, d = y * row;
    if (!transparent) {
      dst.set(src.subarray(s, s + row), d);
      for (let i = d + 3; i < d + row; i += 4) dst[i] = 255;
      continue;
    }
    for (let i = 0; i < row; i += 4) {
      const a = src[s + i + 3];
      if (a > 0 && a < 255) {
        const k = 255 / a;
        dst[d + i] = Math.min(255, src[s + i] * k);
        dst[d + i + 1] = Math.min(255, src[s + i + 1] * k);
        dst[d + i + 2] = Math.min(255, src[s + i + 2] * k);
      } else {
        dst[d + i] = src[s + i];
        dst[d + i + 1] = src[s + i + 1];
        dst[d + i + 2] = src[s + i + 2];
      }
      dst[d + i + 3] = a;
    }
  }
}

function isShown(o: Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

/** Render targets for the effect chain: three intermediate results, and one mask per three layer looks. */
interface FxTargets {
  mid: WebGLRenderTarget[];
  masks: WebGLRenderTarget[];
}

function disposeTargets(t: FxTargets) {
  t.mid.forEach((x) => x.dispose());
  t.masks.forEach((x) => x.dispose());
  t.mid.length = 0;
  t.masks.length = 0;
}

/** The mask value of a layer look: its 1-based position in the list, 0 for none (or a look that no longer exists). */
function lookNumber(doc: ProjectDoc, id: string): number {
  if (!id) return 0;
  return doc.effects.looks.findIndex((l) => l.id === id) + 1;
}

