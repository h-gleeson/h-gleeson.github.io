import type { CameraState, DrawingSettings, GraphicStyle, Oblique, ProjectDoc } from './types';

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
  };
}

/** Fill in fields missing from documents saved by older versions. */
export function normalizeDoc(raw: Partial<ProjectDoc>): ProjectDoc {
  const base = createDoc();
  return {
    ...base,
    ...raw,
    camera: { ...base.camera, ...raw.camera, oblique: { ...base.camera.oblique, ...raw.camera?.oblique } },
    defaults: { ...base.defaults, ...raw.defaults },
    drawing: { ...base.drawing, ...raw.drawing },
    views: raw.views ?? [],
    nodes: raw.nodes ?? {},
    roots: raw.roots ?? [],
    models: raw.models ?? {},
  };
}
