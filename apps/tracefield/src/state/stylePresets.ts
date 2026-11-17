import { DEFAULT_DRAWING, DEFAULT_STYLE } from './defaults';
import { DEFAULT_EFFECTS, EFFECT_PRESETS, type EffectsSettings } from './effects';
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
  /**
   * Graphic presets also set the whole-drawing image-effect look (and switch
   * effects on). Layer looks are never touched.
   */
  effects?: Partial<EffectsSettings>;
}

/** A built-in effect look by id, with a few values changed. */
const fx = (id: string, over: Partial<EffectsSettings> = {}): Partial<EffectsSettings> => ({ ...(EFFECT_PRESETS.find((p) => p.id === id)?.settings ?? {}), ...over });

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

  // ---- graphic: these also set the whole-drawing image effect
  {
    id: 'cobalt-poster',
    name: 'Cobalt poster',
    hint: 'Flat bands of blue: white masses with shade and shadow, mapped through a banded blue gradient',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.45, lineColor: '#0a1a7a', silhouetteWidth: 1.3, creaseWidth: 0.6 },
    drawing: { background: '#a9cbff', shadows: 'graphic', shadowColor: '#2b2f38', shadowOpacity: 0.7, shadeFaces: false, ground: 'shadow', ambient: 0.5 },
    effects: fx('cobalt', { gradBands: 4, gradMidpoint: 0.5, contrast: 0.3 }),
  },
  {
    id: 'signal',
    name: 'Signal',
    hint: 'Grey clay render in a blue duotone, with glitched slices and colour bars',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.85, lineColor: '#3b3f4a', silhouetteWidth: 0.9, creaseWidth: 0.45 },
    drawing: { background: '#e8eaee', shadows: 'soft', shadowColor: '#2c2f36', shadowOpacity: 0.45, shadowSoftness: 0.4, ground: 'shadow', ambient: 0.5 },
    effects: fx('signal'),
  },
  {
    id: 'shattered',
    name: 'Shattered',
    hint: 'Hard-shadowed white forms broken into blue glass shards',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.45, lineColor: '#06135c', silhouetteWidth: 1.4, creaseWidth: 0.7 },
    drawing: { background: '#cfe3ff', shadows: 'graphic', shadowColor: '#1b1e26', shadowOpacity: 0.7, shadeFaces: false, ground: 'shadow', ambient: 0.5 },
    effects: fx('shards'),
  },
  {
    id: 'duotone',
    name: 'Duotone',
    hint: 'Toned model printed in black and hot pink',
    builtIn: true,
    defaults: { fillMode: 'clay', toning: 0.7, lineColor: '#111114', silhouetteWidth: 1.4, creaseWidth: 0.7 },
    drawing: { background: '#ffffff', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.55, shadowSoftness: 0.35, ground: 'shadow' },
    effects: fx('duotone'),
  },
  {
    id: 'riso',
    name: 'Risograph',
    hint: 'Blue halftone on cream paper, with grain',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.45, lineColor: '#2b4bd1', silhouetteWidth: 1.4, creaseWidth: 0.7 },
    drawing: { background: '#f3ecdc', shadows: 'graphic', shadowColor: '#5d6170', shadowOpacity: 0.6, shadeFaces: false, ground: 'shadow', ambient: 0.55 },
    effects: fx('riso'),
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    hint: 'Black 45° halftone on warm newsprint',
    builtIn: true,
    defaults: { fillMode: 'clay', toning: 0.6 },
    drawing: { background: '#efe9dc', shadows: 'soft', shadowColor: '#3a362f', shadowOpacity: 0.5, shadowSoftness: 0.4, ground: 'solid', groundColor: '#efe9dc' },
    effects: fx('newsprint'),
  },
  {
    id: 'engraving',
    name: 'Engraving',
    hint: 'Shade and shadow drawn in swelling wave lines, like an old engraving',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.5, lineColor: '#22201c', silhouetteWidth: 1.5, creaseWidth: 0.7 },
    drawing: { background: '#f4f0e6', shadows: 'graphic', shadowColor: '#3a362f', shadowOpacity: 0.7, shadeFaces: false, ground: 'shadow', ambient: 0.55 },
    effects: fx('engraving'),
  },
  {
    id: 'pen-ink',
    name: 'Pen & ink',
    hint: 'Crosshatched shade and shadow with inked outlines',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.5, silhouetteWidth: 1.6, creaseWidth: 0.8 },
    drawing: { background: '#ffffff', shadows: 'graphic', shadowColor: '#55585f', shadowOpacity: 0.65, shadeFaces: false, ground: 'shadow', ambient: 0.55 },
    effects: fx('pen'),
  },
  {
    id: 'one-bit',
    name: '1-bit',
    hint: 'Black and white Bayer dither, like an early Mac screen',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.5, silhouetteWidth: 1.2, creaseWidth: 0.6 },
    drawing: { background: '#ffffff', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.5, shadowSoftness: 0.3, ground: 'shadow' },
    effects: fx('onebit'),
  },
  {
    id: 'terminal',
    name: 'Terminal',
    hint: 'Green ASCII on black, with scanlines and glow',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.5 },
    drawing: { background: '#ffffff', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.5, shadowSoftness: 0.3, ground: 'shadow' },
    effects: fx('terminal'),
  },
  {
    id: 'rewind',
    name: 'Rewind',
    hint: 'Photocopied black and white with hot-pink cast shadows, ghost echoes and a HUD. Fill any object with a strong colour to make it pink too.',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.75, silhouetteWidth: 1.4, creaseWidth: 0.8 },
    drawing: { background: '#e9e9e7', shadows: 'graphic', shadowColor: '#ff2d6f', shadowOpacity: 1, shadeFaces: false, ground: 'shadow', ambient: 0.45 },
    effects: fx('rewind'),
  },
  {
    id: 'octane',
    name: 'Octane',
    hint: 'Original colours snapped to black, ultramarine, orange, white and grey, dithered and slightly misprinted',
    builtIn: true,
    defaults: { toning: 0.55, silhouetteWidth: 1.6, creaseWidth: 0.8 },
    drawing: { background: '#e8e8ea', shadows: 'graphic', shadowColor: '#2a2fd4', shadowOpacity: 0.85, shadeFaces: false, ground: 'shadow', ambient: 0.45 },
    effects: fx('octane'),
  },
  {
    id: 'mediation',
    name: 'Mediation',
    hint: 'Cool blue-tinted render with glow and a white HUD frame',
    builtIn: true,
    defaults: { fillMode: 'clay', toning: 0.6, lineColor: '#0c1a3d', silhouetteWidth: 1.2, creaseWidth: 0.6 },
    drawing: { background: '#25335f', shadows: 'soft', shadowColor: '#050a1c', shadowOpacity: 0.6, shadowSoftness: 0.35, ground: 'shadow', ambient: 0.5 },
    effects: fx('mediation'),
  },
  {
    id: 'tech-drawing',
    name: 'Tech sheet',
    hint: 'Clean line drawing framed by a HUD of brackets, rulers and leader lines',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0, silhouetteWidth: 1.6, creaseWidth: 0.8 },
    drawing: { background: '#f4f4f2' },
    effects: fx('hud'),
  },
  {
    id: 'photocopy',
    name: 'Photocopy',
    hint: 'Shade and shadow pushed to gritty black and white',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.75, silhouetteWidth: 1.4, creaseWidth: 0.8 },
    drawing: { background: '#ebebe8', shadows: 'graphic', shadowColor: '#000000', shadowOpacity: 0.75, shadeFaces: false, ground: 'shadow', ambient: 0.35 },
    effects: fx('photocopy'),
  },
  {
    id: 'screenprint',
    name: 'Screen print',
    hint: 'Three flat inks, black, red and cream, slightly out of register',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.6, silhouetteWidth: 1.6, creaseWidth: 0.8 },
    drawing: { background: '#f2ead8', shadows: 'graphic', shadowColor: '#e83a4a', shadowOpacity: 1, shadeFaces: false, ground: 'shadow', ambient: 0.5 },
    effects: fx('screenprint'),
  },
  {
    id: 'pop-art',
    name: 'Pop art',
    hint: 'Big hex halftone in bold comic inks',
    builtIn: true,
    defaults: { fillMode: 'material', toning: 0.5, silhouetteWidth: 2, creaseWidth: 1 },
    drawing: { background: '#fbf6ea', shadows: 'graphic', shadowColor: '#1e5bff', shadowOpacity: 0.8, ground: 'shadow' },
    effects: fx('pop'),
  },
  {
    id: 'datamosh',
    name: 'Datamosh',
    hint: 'Dark forms smeared downward in streaks, with glitch slices',
    builtIn: true,
    defaults: { toning: 0.5 },
    drawing: { background: '#f2f2f0', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.5, shadowSoftness: 0.3, ground: 'shadow' },
    effects: fx('datamosh', { smearBright: false, smearThreshold: 0.5 }),
  },
  {
    id: 'thermal',
    name: 'Thermal',
    hint: 'Heat-camera colours: hot forms glow yellow, shadow goes violet',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.6, showLines: false },
    drawing: { background: '#1a1a1c', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.7, shadowSoftness: 0.5, ground: 'shadow', ambient: 0.35 },
    effects: fx('thermal'),
  },
  {
    id: 'night-vision',
    name: 'Night vision',
    hint: 'Green phosphor with scanlines, grain and glow',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.6 },
    drawing: { background: '#1c1c1c', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.6, shadowSoftness: 0.4, ground: 'shadow', ambient: 0.4 },
    effects: fx('nightvision'),
  },
  {
    id: 'cyanotype',
    name: 'Cyanotype',
    hint: 'Prussian-blue sun print: white lines and forms on deep blue paper',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.6, silhouetteWidth: 1.4, creaseWidth: 0.7 },
    drawing: { background: '#ffffff', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.5, shadowSoftness: 0.35, ground: 'shadow' },
    effects: fx('cyanotype', { invert: true }),
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    hint: 'Violet, pink and cyan with scanlines, aberration and glow',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.6 },
    drawing: { background: '#ffffff', shadows: 'soft', shadowColor: '#000000', shadowOpacity: 0.55, shadowSoftness: 0.35, ground: 'shadow' },
    effects: fx('vaporwave'),
  },
  {
    id: 'sepia',
    name: 'Sepia',
    hint: 'Clay model in warm brown photo tones, with grain and a vignette',
    builtIn: true,
    defaults: { fillMode: 'clay', toning: 0.6 },
    drawing: { background: '#efe6d6', shadows: 'soft', shadowColor: '#2a1a0e', shadowOpacity: 0.5, shadowSoftness: 0.4, ground: 'solid', groundColor: '#efe6d6' },
    effects: fx('sepia'),
  },
  {
    id: 'echo-print',
    name: 'Double print',
    hint: 'Line drawing with fading ghost copies trailing off to one side',
    builtIn: true,
    defaults: { fillMode: 'white', toning: 0.5, silhouetteWidth: 2, creaseWidth: 1 },
    drawing: { background: '#ffffff' },
    effects: fx('echo', { echoAngle: 20, echo: 0.85, echoOffset: 14, echoCount: 3 }),
  },
  {
    id: 'type-specimen',
    name: 'Type specimen',
    hint: 'Solid black forms with no linework on cool grey, like a logotype sheet. Pairs with text objects.',
    builtIn: true,
    defaults: { fillMode: 'color', fillColor: '#0d0d0f', toning: 0, showLines: false },
    drawing: { background: '#d3d6da' },
  },
];

/** The full style a preset produces: built on the stock defaults so presets never inherit leftovers from each other. */
export function presetStyle(p: StylePreset): { defaults: GraphicStyle; drawing: StyleDrawing; effects: EffectsSettings | null } {
  const drawing = {} as Record<string, unknown>;
  for (const k of STYLE_DRAWING_KEYS) drawing[k] = p.drawing[k] ?? DEFAULT_DRAWING[k];
  return { defaults: { ...DEFAULT_STYLE, ...p.defaults }, drawing: drawing as StyleDrawing, effects: p.effects ? { ...DEFAULT_EFFECTS, ...p.effects } : null };
}

/** The current look as a preset; the whole-drawing effect is included when effects are on. */
export function captureStyle(defaults: GraphicStyle, dr: DrawingSettings, effects?: { enabled: boolean; drawing: EffectsSettings }): Pick<StylePreset, 'defaults' | 'drawing' | 'effects'> {
  const drawing = {} as Record<string, unknown>;
  for (const k of STYLE_DRAWING_KEYS) drawing[k] = dr[k];
  const out: Pick<StylePreset, 'defaults' | 'drawing' | 'effects'> = { defaults: { ...defaults }, drawing: drawing as StyleDrawing };
  if (effects?.enabled && !sameEffects(effects.drawing, DEFAULT_EFFECTS)) out.effects = { ...effects.drawing };
  return out;
}

export function sameEffects(a: EffectsSettings, b: EffectsSettings): boolean {
  return (Object.keys(DEFAULT_EFFECTS) as (keyof EffectsSettings)[]).every((k) => a[k] === b[k]);
}

/** True if the whole-drawing look is exactly one a style preset set (so a plain preset may clear it). */
export function lookFromPreset(e: EffectsSettings, list: StylePreset[]): boolean {
  return list.some((p) => p.effects && sameEffects({ ...DEFAULT_EFFECTS, ...p.effects }, e));
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
