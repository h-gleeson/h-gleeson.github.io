/**
 * Tracefield document model.
 *
 * The document never stores geometry. Scene nodes reference imported meshes by
 * (model id, mesh index) and carry only transforms, flags and *style overrides*.
 * The imported source (file bytes + parsed geometry/materials) lives in the
 * model registry (src/import/registry.ts) and is never mutated.
 */

export type FillMode = 'material' | 'color' | 'clay' | 'white' | 'none';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

/** Every visual property that can be set globally or overridden per node. */
export interface GraphicStyle {
  fillMode: FillMode;
  fillColor: string;
  opacity: number; // 0..1
  toning: number; // 0 flat fill … 1 full orientation toning
  showLines: boolean;
  lineColor: string;
  lineOpacity: number;
  lineStyle: LineStyle;
  silhouetteWidth: number; // px at reference width
  creaseWidth: number;
  creaseAngle: number; // degrees
  openEdgeWidth: number;
  materialEdgeWidth: number;
  allEdgesWidth: number; // 0 = off; draws every triangle edge
  curveWidth: number;
}

export type StyleKey = keyof GraphicStyle;

export type NodeKind = 'group' | 'mesh' | 'line';

export interface GeomRef {
  model: string;
  /** Index into the parsed model's drawable list (deterministic traversal order). */
  index: number;
}

export interface SceneNode {
  id: string;
  name: string;
  importedName: string;
  parent: string | null;
  children: string[];
  kind: NodeKind;
  /** Local matrix, column-major (THREE.Matrix4.elements). */
  matrix: number[];
  /** Matrix as imported, for "reset to imported". */
  baseMatrix: number[];
  geom?: GeomRef;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  style: Partial<GraphicStyle>;
}

export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'fbx';

export interface ModelFile {
  name: string;
  size: number;
}

export interface ModelRecord {
  id: string;
  name: string;
  format: ModelFormat;
  /** Main file first; .gltf side files (bin, textures) follow. */
  files: ModelFile[];
  upAxis: 'y' | 'z';
  drawables: number;
}

export type Projection = 'ortho' | 'persp';

export interface Oblique {
  enabled: boolean;
  /** Screen direction of the receding axis, degrees. */
  angle: number;
  /** Receding axis scale: 1 cavalier/military, 0.5 cabinet. */
  scale: number;
}

export interface CameraState {
  projection: Projection;
  azimuth: number;
  elevation: number;
  target: [number, number, number];
  /** World units visible vertically. Drives ortho scale and perspective distance. */
  height: number;
  fov: number;
  oblique: Oblique;
  locked: boolean;
  preset: string | null;
}

export interface SavedView {
  id: string;
  name: string;
  camera: CameraState;
  thumb?: string;
}

export interface DrawingSettings {
  background: string;
  showGrid: boolean;
  hiddenLines: boolean;
  hiddenColor: string;
  hiddenWidth: number;
  flatShading: boolean;
  sunAzimuth: number;
  sunElevation: number;
  ambient: number;
  /** Lineweights are authored at this output width (px). */
  referenceWidth: number;
}

export interface ProjectDoc {
  name: string;
  models: Record<string, ModelRecord>;
  nodes: Record<string, SceneNode>;
  roots: string[];
  camera: CameraState;
  defaults: GraphicStyle;
  drawing: DrawingSettings;
  views: SavedView[];
}

export interface BusyState {
  label: string;
  progress?: number;
}

export interface UIState {
  selection: string[];
  /** Anchor for shift-range selection in the tree. */
  selectionAnchor: string | null;
  isolated: string[] | null;
  renaming: string | null;
  busy: BusyState | null;
  status: { text: string; kind: 'info' | 'error' } | null;
  restoreAvailable: boolean;
  fitRequest: number;
  stats: { objects: number; triangles: number; edges: number };
}
