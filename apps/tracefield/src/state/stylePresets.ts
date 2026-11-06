import { DEFAULT_DRAWING, DEFAULT_STYLE } from './defaults';
import type { DrawingSettings, GraphicStyle } from './types';

/**
 * Drawing-style presets: a complete look (default object style plus the
 * drawing-wide graphic settings). Composition settings such as the grid, the
 * sun direction and the lineweight reference are left alone, so a preset
 * changes how the drawing looks, not what it shows. Per-object overrides are
 * kept unless the user asks to clear them.
 */
export const STYLE_DRAWING_KEYS = [
  'background',
  'hiddenLines',
  'hiddenColor',
  'hiddenWidth',
  'flatShading',
  'ambient',
  'shadows',
  'shadowColor',
  'shadowOpacity',
  'shadowSoftness',
  'shadeFaces',
  'ground',
  'groundColor',
] as const satisfies readonly (keyof DrawingSettings)[];

export type StyleDrawing = Pick<DrawingSettings, (typeof STYLE_DRAWING_KEYS)[number]>;

export interface StylePreset {
  id: string;
  name: string;
  hint: string;
  builtIn: boolean;
  defaults: Partial<GraphicStyle>;
  drawing: Partial<StyleDrawing>;
}

export const BUILT_IN_PRESETS: StylePreset[] = [
  {
    id: 'toned',
    name: 'Toned model',
    hint: 'Imported colours, gentle face toning, crisp outlines',
    builtIn: true,
    defaults: {},
    drawing: {},
  },
  {
    id: 'line',
    name: 'Line drawing',
    hint: 'White faces, black linework, no tone',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0, silhouetteWidth: 1.8, creaseWidth: 0.9 },
    drawing: { background: '#ffffff' },
  },
  {
    id: 'graphic-shadow',
    name: 'Shade & shadow',
    hint: 'White faces with flat grey shade and cast shadows on a shadow-only ground',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0 },
    drawing: { background: '#ffffff', shadows: 'graphic', shadowColor: '#9b9ea8', shadowOpacity: 0.55, shadeFaces: true, ground: 'shadow' },
  },
  {
    id: 'clay',
    name: 'Clay study',
    hint: 'Warm clay, soft shadows on a solid ground',
    builtIn: true,
    defaults: { fillMode: 'clay', toning: 0.55, lineColor: '#3a3833', silhouetteWidth: 1.2, creaseWidth: 0.6 },
    drawing: { background: '#efece5', shadows: 'soft', shadowColor: '#5b5650', shadowOpacity: 0.5, shadowSoftness: 0.45, shadeFaces: false, ground: 'solid', groundColor: '#efece5', ambient: 0.65 },
  },
  {
    id: 'hidden',
    name: 'Hidden line',
    hint: 'White faces, hidden edges dashed in grey',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0 },
    drawing: { background: '#ffffff', hiddenLines: true, hiddenColor: '#9a9da5', hiddenWidth: 0.5 },
  },
  {
    id: 'ghost',
    name: 'Ghosted',
    hint: 'See-through faces, light linework and hidden lines',
    builtIn: true,
    defaults: { fillMode: 'white', opacity: 0.35, toning: 0.2, lineOpacity: 0.75, silhouetteWidth: 1.2, creaseWidth: 0.6 },
    drawing: { background: '#f4f4f2', hiddenLines: true, hiddenColor: '#b4b7be', hiddenWidth: 0.4 },
  },
  {
    id: 'poche',
    name: 'Poché',
    hint: 'Grey faces with a fine diagonal hatch',
    builtIn: true,
    defaults: { fillMode: 'color', fillColor: '#e6e5e1', toning: 0.15, hatch: 'lines', hatchColor: '#6b6e75', hatchSpacing: 7, hatchWidth: 0.5, hatchAngle: 45 },
    drawing: { background: '#ffffff' },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    hint: 'Linework only, white on deep blue',
    builtIn: true,
    defaults: { fillMode: 'none', lineColor: '#f2f4ff', silhouetteWidth: 1.4, creaseWidth: 0.8, cutFillColor: '#f2f4ff', cutLineColor: '#f2f4ff', cutHatchColor: '#1f3a8f' },
    drawing: { background: '#1f3a8f', hiddenLines: true, hiddenColor: '#7f93d6', hiddenWidth: 0.45 },
  },
];

/** The full style a preset produces: built on the stock defaults so presets never inherit leftovers from each other. */
export function presetStyle(p: StylePreset): { defaults: GraphicStyle; drawing: StyleDrawing } {
  const drawing = {} as Record<string, unknown>;
  for (const k of STYLE_DRAWING_KEYS) drawing[k] = p.drawing[k] ?? DEFAULT_DRAWING[k];
  return { defaults: { ...DEFAULT_STYLE, ...p.defaults }, drawing: drawing as StyleDrawing };
}

export function captureStyle(defaults: GraphicStyle, dr: DrawingSettings): Pick<StylePreset, 'defaults' | 'drawing'> {
  const drawing = {} as Record<string, unknown>;
  for (const k of STYLE_DRAWING_KEYS) drawing[k] = dr[k];
  return { defaults: { ...defaults }, drawing: drawing as StyleDrawing };
}

// ------------------------------------------------------------ user presets (kept in the browser, shared by all projects)

const KEY = 'tracefield.stylePresets.v1';

export function loadUserPresets(): StylePreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string').map((p) => ({ ...p, builtIn: false, hint: p.hint ?? 'Saved preset' })) : [];
  } catch {
    return [];
  }
}

export function saveUserPresets(list: StylePreset[]) {
  localStorage.setItem(KEY, JSON.stringify(list.filter((p) => !p.builtIn)));
}
