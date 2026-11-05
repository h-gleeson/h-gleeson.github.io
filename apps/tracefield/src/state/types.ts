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
export type HatchMode = 'none' | 'lines' | 'cross' | 'dots';
/** normal: hidden by geometry in front · front: always on top · behind: under every fill. */
export type LineOrder = 'normal' | 'front' | 'behind';
export type ShadowMode = 'off' | 'graphic' | 'soft';
export type GroundMode = 'off' | 'solid' | 'shadow';

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
  lineOrder: LineOrder;
  /** Drawing-space hatch over the fill; spacing and weight are px at reference width. */
  hatch: HatchMode;
  hatchColor: string;
  hatchSpacing: number;
  hatchWidth: number;
  hatchAngle: number; // degrees
  castShadow: boolean;
  receiveShadow: boolean;
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
  /** graphic: crisp flat-colour shadows · soft: blurred, multiplied over the fill. */
  shadows: ShadowMode;
  shadowColor: string;
  shadowOpacity: number;
  /** 0 sharp … 1 very soft (soft mode only). */
  shadowSoftness: number;
  /** Faces turned away from the sun take the shadow too (shade and shadow). */
  shadeFaces: boolean;
  /** Plane under the model: solid colour, or invisible except for the shadows it catches. */
  ground: GroundMode;
  groundColor: string;
}

/** The drawing frame and PNG output. The frame *is* the drawing: the camera's height is the frame's height. */
export interface OutputSettings {
  /** Output size in pixels; their ratio is the frame's aspect. */
  width: number;
  height: number;
  /** Size preset id ('custom' once edited freely). */
  preset: string;
  /** Pixels per inch for paper presets and the physical-size readout. */
  dpi: number;
  lockAspect: boolean;
  transparent: boolean;
  showFrame: boolean;
  includeGrid: boolean;
  antialias: 0 | 4 | 8;
  fileName: string;
}

export type Vec3 = [number, number, number];

/** A named snapshot of an exploded arrangement. */
export interface ExplodeState {
  id: string;
  name: string;
  offsets: Record<string, Vec3>;
  anchors: Record<string, Vec3[]>;
}

/**
 * Exploded drawing. Offsets are world-space moves per node, applied on top of
 * the assembled model (which is never changed). A node moves with its exploded
 * ancestors, then by its own offset. `amount` blends assembled (0) → exploded (1).
 */
export interface ExplodeSettings {
  amount: number;
  offsets: Record<string, Vec3>;
  /** Connector anchors per node, as fractions (0…1) of the node's assembled bounding box. None = one at the centre. */
  anchors: Record<string, Vec3[]>;
  /** Parts of the last auto-explode; the explode controls re-arrange these live. */
  parts: string[];
  mode: 'axial' | 'radial';
  axis: 'x' | 'y' | 'z';
  direction: 1 | -1;
  /** Gap per step, as a fraction of the parts' overall size. */
  spacing: number;
  /** Spread in proportion to distance: 1 = none, 2 = double every distance. */
  scale: number;
  connectors: boolean;
  connectorColor: string;
  connectorWidth: number;
  connectorStyle: LineStyle;
  /** Connectors are hidden where parts cover them (otherwise drawn on top). */
  connectorOccluded: boolean;
  states: ExplodeState[];
}

export type LabelFont = 'sans' | 'grotesk' | 'geometric' | 'serif' | 'mono';
export type LabelCasing = 'asis' | 'upper' | 'lower' | 'title';
export type LeaderEnd = 'dot' | 'arrow' | 'tick' | 'none';
/** free: labels where you put them · left/right/both: tag columns beside the model. */
export type LabelLayout = 'free' | 'left' | 'right' | 'both';

/** One label: a point on an object, a leader, and text. */
export interface Annotation {
  id: string;
  node: string;
  /** Custom text; null follows the object's name. */
  text: string | null;
  /** Anchor point in the node's local space, so it follows moves and explodes. */
  anchor: Vec3;
  /** Leader end in the frame, as fractions of its width and height (free layout). */
  pos: [number, number];
  size?: number;
  weight?: number;
  color?: string;
}

export interface AnnotationSettings {
  show: boolean;
  /** leaders: text with leader lines · key: numbered tags at the anchors and a legend. */
  mode: 'leaders' | 'key';
  layout: LabelLayout;
  font: LabelFont;
  /** px at the reference width, like lineweights. */
  size: number;
  weight: number;
  color: string;
  casing: LabelCasing;
  /** Letter spacing, em. */
  tracking: number;
  /** Knock the drawing out behind the text in the background colour. */
  halo: boolean;
  leaderColor: string;
  leaderWidth: number;
  leaderEnd: LeaderEnd;
  /** Leaders end in a short horizontal shoulder. */
  elbow: boolean;
  /** Distance from the model to the tag columns, px at reference width. */
  gap: number;
  /** Legend position for the numbered key, frame fractions (top-left of the list). */
  keyPos: [number, number];
}

export interface Annotations {
  settings: AnnotationSettings;
  items: Annotation[];
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
  output: OutputSettings;
  explode: ExplodeSettings;
  annotations: Annotations;
}

export interface BusyState {
  label: string;
  progress?: number;
  /** Present when the job can be cancelled. */
  cancel?: () => void;
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
  /** Viewport tool: select only, or show the move gizmo on the selection. */
  tool: 'select' | 'move';
  /** Selected annotation (labels are selected separately from scene nodes). */
  label: string | null;
  stats: { objects: number; triangles: number; edges: number };
}
