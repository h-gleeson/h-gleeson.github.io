import { DEFAULT_EFFECTS_DOC, normalizeEffects } from './effects';
import { DEFAULT_OUTPUT } from './output';
import type { SectionSettings, AnnotationSettings, CameraState, DrawingSettings, ExplodeSettings, GraphicStyle, Oblique, ProjectDoc, SceneNode } from './types';

export const DEFAULT_SECTION: SectionSettings = {
  enabled: false,
  placed: false,
  orient: 'plan',
  azimuth: 0,
  elevation: 90,
  flip: false,
  offset: 0,
  caps: true,
  cutLines: true,
};

export const DEFAULT_LABELS: AnnotationSettings = {
  show: true,
  mode: 'leaders',
  layout: 'free',
  font: 'sans',
  size: 15,
  weight: 500,
  color: '#1b1c1f',
  casing: 'upper',
  tracking: 0.06,
  halo: true,
  leaderColor: '#1b1c1f',
  leaderWidth: 0.7,
  leaderEnd: 'dot',
  elbow: true,
  gap: 48,
  keyPos: [0.04, 0.06],
};

export const DEFAULT_EXPLODE: ExplodeSettings = {
  amount: 1,
  offsets: {},
  anchors: {},
  parts: [],
  mode: 'axial',
  axis: 'y',
  direction: 1,
  spacing: 0.25,
  scale: 1,
  connectors: true,
  connectorColor: '#1b1c1f',
  connectorWidth: 0.6,
  connectorStyle: 'dashed',
  connectorOccluded: true,
  states: [],
};

export const DEFAULT_STYLE: GraphicStyle = {
  fillMode: 'material',
  fillColor: '#d9d6cf',
  opacity: 1,
  toning: 0.35,
  showLines: true,
  lineColor: '#1b1c1f',
  lineOpacity: 1,
  lineStyle: 'solid',
  silhouetteWidth: 1.6,
  creaseWidth: 0.8,
  creaseAngle: 30,
  openEdgeWidth: 1,
  materialEdgeWidth: 0.8,
  allEdgesWidth: 0,
  curveWidth: 0.7,
  lineOrder: 'normal',
  hatch: 'none',
  hatchColor: '#55585f',
  hatchSpacing: 8,
  hatchWidth: 0.6,
  hatchAngle: 45,
  castShadow: true,
  receiveShadow: true,
  fxLook: '',
  cutSolid: false,
  cutFill: true,
  cutFillColor: '#1b1c1f',
  cutHatch: 'none',
  cutHatchColor: '#ffffff',
  cutHatchSpacing: 6,
  cutHatchWidth: 0.5,
  cutHatchAngle: 45,
  cutLineColor: '#1b1c1f',
  cutLineWidth: 2.2,
};

export const DEFAULT_DRAWING: DrawingSettings = {
  background: '#f6f5f1',
  showGrid: false,
  hiddenLines: false,
  hiddenColor: '#8c8f96',
  hiddenWidth: 0.5,
  flatShading: true,
  sunAzimuth: 215,
  sunElevation: 50,
  ambient: 0.6,
  referenceWidth: 1600,
  shadows: 'off',
  shadowColor: '#6f7280',
  shadowOpacity: 0.45,
  shadowSoftness: 0.35,
  shadeFaces: true,
  ground: 'off',
  groundColor: '#ffffff',
};

const NO_OBLIQUE: Oblique = { enabled: false, angle: 225, scale: 1 };

export const DEFAULT_CAMERA: CameraState = {
  projection: 'ortho',
  azimuth: 45,
  elevation: 35.264,
  target: [0, 0, 0],
  height: 20,
  fov: 35,
  oblique: NO_OBLIQUE,
  locked: false,
  preset: 'iso',
};

export interface CameraPreset {
  id: string;
  label: string;
  short: string;
  key?: string;
  hint: string;
  group: 'axonometric' | 'orthographic' | 'oblique';
  camera: Pick<CameraState, 'azimuth' | 'elevation' | 'oblique'>;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'iso', label: 'Isometric', short: 'ISO', key: '1', group: 'axonometric', hint: 'Equal foreshortening on all three axes', camera: { azimuth: 45, elevation: 35.264, oblique: NO_OBLIQUE } },
  { id: 'dim', label: 'Dimetric', short: 'DIM', key: '2', group: 'axonometric', hint: 'Two axes equal, the third shortened (2:1)', camera: { azimuth: 45, elevation: 20.705, oblique: NO_OBLIQUE } },
  { id: 'tri', label: 'Trimetric', short: 'TRI', key: '3', group: 'axonometric', hint: 'Three unequal axes', camera: { azimuth: 28, elevation: 23, oblique: NO_OBLIQUE } },
  { id: 'axo', label: 'Axonometric 30/60', short: '30/60', key: '4', group: 'oblique', hint: 'True plan rotated 30°, verticals at full height', camera: { azimuth: 30, elevation: 90, oblique: { enabled: true, angle: 270, scale: 1 } } },
  { id: 'mil', label: 'Plan oblique 45', short: '45/45', group: 'oblique', hint: 'True plan rotated 45°, verticals at full height (military)', camera: { azimuth: 45, elevation: 90, oblique: { enabled: true, angle: 270, scale: 1 } } },
  { id: 'plan', label: 'Plan', short: 'PLAN', key: '5', group: 'orthographic', hint: 'Looking straight down', camera: { azimuth: 0, elevation: 90, oblique: NO_OBLIQUE } },
  { id: 'front', label: 'Front elevation', short: 'FRONT', key: '6', group: 'orthographic', hint: 'Looking along −Z', camera: { azimuth: 0, elevation: 0, oblique: NO_OBLIQUE } },
  { id: 'right', label: 'Right elevation', short: 'RIGHT', key: '7', group: 'orthographic', hint: 'Looking along −X', camera: { azimuth: 90, elevation: 0, oblique: NO_OBLIQUE } },
  { id: 'back', label: 'Back elevation', short: 'BACK', key: '8', group: 'orthographic', hint: 'Looking along +Z', camera: { azimuth: 180, elevation: 0, oblique: NO_OBLIQUE } },
  { id: 'left', label: 'Left elevation', short: 'LEFT', key: '9', group: 'orthographic', hint: 'Looking along +X', camera: { azimuth: 270, elevation: 0, oblique: NO_OBLIQUE } },
  { id: 'cabinet', label: 'Cabinet oblique', short: 'CAB', group: 'oblique', hint: 'True front, depth at 45° and half scale', camera: { azimuth: 0, elevation: 0, oblique: { enabled: true, angle: 45, scale: 0.5 } } },
  { id: 'cavalier', label: 'Cavalier oblique', short: 'CAV', group: 'oblique', hint: 'True front, depth at 45° and full scale', camera: { azimuth: 0, elevation: 0, oblique: { enabled: true, angle: 45, scale: 1 } } },
];

export function createDoc(): ProjectDoc {
  return {
    name: 'Untitled drawing',
    models: {},
    nodes: {},
    roots: [],
    camera: structuredClone(DEFAULT_CAMERA),
    defaults: { ...DEFAULT_STYLE },
    drawing: { ...DEFAULT_DRAWING },
    views: [],
    output: { ...DEFAULT_OUTPUT },
    explode: structuredClone(DEFAULT_EXPLODE),
    annotations: { settings: { ...DEFAULT_LABELS }, items: [] },
    section: { ...DEFAULT_SECTION },
    effects: structuredClone(DEFAULT_EFFECTS_DOC),
  };
}

/** Projects saved before cut styles were per object kept one poché style on the section: carry it over as the default. */
function legacyCutStyle(sec: any): Partial<GraphicStyle> {
  if (!sec || sec.pocheColor === undefined) return {};
  const out: Partial<GraphicStyle> = { cutFillColor: sec.pocheColor, cutHatch: sec.pocheHatch, cutHatchColor: sec.pocheHatchColor, cutHatchSpacing: sec.pocheHatchSpacing, cutHatchAngle: sec.pocheHatchAngle, cutLineColor: sec.cutColor, cutLineWidth: sec.cutWidth };
  for (const k of Object.keys(out) as (keyof GraphicStyle)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** The single-look format switched effects on per object with `style.effects`; that becomes the object's layer look. */
function hasLegacyFx(nodes: Record<string, SceneNode> | undefined): boolean {
  return !!nodes && Object.values(nodes).some((n) => n.style && 'effects' in n.style);
}
function legacyFxNodes(nodes: Record<string, SceneNode>, look: string | null): Record<string, SceneNode> {
  const out: Record<string, SceneNode> = {};
  for (const [id, n] of Object.entries(nodes)) {
    const { effects, ...style } = n.style as Partial<GraphicStyle> & { effects?: boolean };
    if (effects !== undefined && look) (style as Partial<GraphicStyle>).fxLook = effects ? look : '';
    out[id] = { ...n, style };
  }
  return out;
}

function legacyFxDefaults(d: GraphicStyle & { effects?: boolean }, look: string | null): GraphicStyle {
  if (!('effects' in d)) return d;
  const { effects, ...rest } = d;
  return effects && look ? { ...rest, fxLook: look } : rest;
}

/** Fill in fields missing from documents saved by older versions. */
export function normalizeDoc(raw: Partial<ProjectDoc>): ProjectDoc {
  const base = createDoc();
  const fx = normalizeEffects(raw.effects);
  return {
    ...base,
    ...raw,
    camera: { ...base.camera, ...raw.camera, oblique: { ...base.camera.oblique, ...raw.camera?.oblique } },
    defaults: legacyFxDefaults({ ...base.defaults, ...legacyCutStyle(raw.section), ...raw.defaults }, fx.legacyLayerLook),
    drawing: { ...base.drawing, ...raw.drawing },
    views: raw.views ?? [],
    output: { ...base.output, ...raw.output },
    explode: { ...base.explode, ...raw.explode },
    section: { ...base.section, ...raw.section },
    effects: fx.effects,
    annotations: { settings: { ...base.annotations.settings, ...raw.annotations?.settings }, items: raw.annotations?.items ?? [] },
    nodes: fx.legacyLayerLook !== null || hasLegacyFx(raw.nodes) ? legacyFxNodes(raw.nodes ?? {}, fx.legacyLayerLook) : raw.nodes ?? {},
    roots: raw.roots ?? [],
    models: raw.models ?? {},
  };
}
