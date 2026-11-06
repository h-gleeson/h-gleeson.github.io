/**
 * Image effects: a post-process applied to the finished drawing, in the
 * viewport and in the PNG export. Every size is in px at the reference width,
 * like lineweights and hatches, and every pattern is anchored to the frame
 * centre, so the viewport and the export match at any output size.
 *
 * Order: adjust → stylize (one effect) → colour → mix → finish.
 */

export type EffectId = 'none' | 'dither' | 'halftone' | 'ascii' | 'crosshatch' | 'contour' | 'edges' | 'pixelate' | 'wave' | 'voronoi';
export type DitherPattern = 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'noise';
export type DotShape = 'circle' | 'square' | 'diamond' | 'line';
export type DotGrid = 'square' | 'hex';
export type CharSet = 'standard' | 'dense' | 'blocks' | 'binary' | 'custom';
export type ColorMode = 'original' | 'mono';

/** One look: the full set of effect, colour, adjustment and finish settings. */
export interface EffectsSettings {
  effect: EffectId;

  // Adjust (before the effect)
  brightness: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // -1..1
  hue: number; // degrees
  gamma: number; // 0.2..3
  blur: number; // px
  invert: boolean;

  // Dither / posterize
  ditherPattern: DitherPattern;
  ditherLevels: number; // 2..16
  ditherScale: number; // px per dither cell
  // Halftone
  dotShape: DotShape;
  dotGrid: DotGrid;
  dotSpacing: number; // px
  dotAngle: number; // degrees
  dotScale: number; // 0.2..2
  // ASCII
  charSet: CharSet;
  charCustom: string;
  charSize: number; // px per cell
  // Crosshatch
  hatchSpacing: number; // px
  hatchLayers: number; // 1..4
  hatchAngle: number;
  hatchWidth: number; // px
  hatchJitter: number; // 0..1
  // Contour
  contourLevels: number;
  contourWidth: number; // px
  contourFill: boolean;
  // Edges
  edgeThreshold: number; // 0..1
  edgeWidth: number; // px
  edgeOverlay: boolean; // draw over the image instead of on paper
  // Pixelate
  pixelSize: number; // px
  pixelGap: number; // px
  // Wave lines
  waveSpacing: number; // px
  waveAmplitude: number; // px
  waveFrequency: number; // waves per 100 px
  waveWidth: number; // 0..1 of the spacing at full darkness
  waveVertical: boolean;
  // Voronoi
  cellSize: number; // px
  cellEdge: number; // px
  cellJitter: number; // 0..1

  // Colour
  colorMode: ColorMode;
  ink: string;
  paper: string;
  paperFromBackground: boolean;
  /** 0 = original drawing, 1 = full effect. */
  mix: number;

  // Finish (after the effect)
  grain: number; // 0..1
  grainSize: number; // px
  bloom: number; // 0..2
  bloomThreshold: number; // 0..1
  bloomRadius: number; // px
  chromatic: number; // px at the frame corners
  scanlines: number; // 0..1
  scanlineSpacing: number; // px
  vignette: number; // 0..1
}

export const DEFAULT_EFFECTS: EffectsSettings = {
  effect: 'none',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  gamma: 1,
  blur: 0,
  invert: false,
  ditherPattern: 'bayer4',
  ditherLevels: 2,
  ditherScale: 2,
  dotShape: 'circle',
  dotGrid: 'square',
  dotSpacing: 8,
  dotAngle: 45,
  dotScale: 1,
  charSet: 'standard',
  charCustom: ' .oO@',
  charSize: 10,
  hatchSpacing: 6,
  hatchLayers: 3,
  hatchAngle: 45,
  hatchWidth: 0.8,
  hatchJitter: 0,
  contourLevels: 8,
  contourWidth: 1,
  contourFill: false,
  edgeThreshold: 0.25,
  edgeWidth: 1,
  edgeOverlay: false,
  pixelSize: 8,
  pixelGap: 0,
  waveSpacing: 8,
  waveAmplitude: 3,
  waveFrequency: 2,
  waveWidth: 0.8,
  waveVertical: false,
  cellSize: 24,
  cellEdge: 0.8,
  cellJitter: 0.8,
  colorMode: 'original',
  ink: '#1c1d21',
  paper: '#ffffff',
  paperFromBackground: true,
  mix: 1,
  grain: 0,
  grainSize: 1,
  bloom: 0,
  bloomThreshold: 0.7,
  bloomRadius: 12,
  chromatic: 0,
  scanlines: 0,
  scanlineSpacing: 3,
  vignette: 0,
};

export const EFFECTS: { id: EffectId; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'Adjustments, colour and finish only' },
  { id: 'dither', label: 'Dither', hint: 'Ordered or noise dithering to a few tones (or plain posterize)' },
  { id: 'halftone', label: 'Halftone', hint: 'Dots, squares or lines sized by tone on a screen' },
  { id: 'ascii', label: 'ASCII', hint: 'Characters chosen by tone' },
  { id: 'crosshatch', label: 'Crosshatch', hint: 'Layers of hatching that build up in the darks' },
  { id: 'contour', label: 'Contour', hint: 'Iso-lines or bands of equal tone' },
  { id: 'edges', label: 'Edges', hint: 'Sobel edge detection: re-inks the drawing' },
  { id: 'pixelate', label: 'Pixelate', hint: 'Blocks of flat colour, with an optional grid' },
  { id: 'wave', label: 'Wave lines', hint: 'Engraving-style lines that thicken and swell in the darks' },
  { id: 'voronoi', label: 'Voronoi', hint: 'Cells of flat colour with outlines' },
];

export const CHAR_SETS: Record<Exclude<CharSet, 'custom'>, string> = {
  standard: ' .:-=+*#%@',
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  binary: ' 01',
};

export function charsOf(e: Pick<EffectsSettings, 'charSet' | 'charCustom'>): string {
  const s = e.charSet === 'custom' ? e.charCustom : CHAR_SETS[e.charSet];
  return [...s].length >= 2 ? s : ' @';
}

/**
 * How far (px at the reference width) the effect and the finish look around a
 * pixel. The export renders that much extra around each tile so tiles join
 * without seams.
 */
export function effectReach(e: EffectsSettings): { stylize: number; finish: number } {
  let r = 2;
  switch (e.effect) {
    case 'halftone': r = e.dotSpacing * 1.5; break;
    case 'ascii': r = e.charSize * 1.5; break;
    case 'pixelate': r = e.pixelSize * 1.5; break;
    case 'voronoi': r = e.cellSize * 2.5; break;
    case 'edges': r = e.edgeWidth * 2 + 1; break;
    case 'dither': r = e.ditherScale * 8 + 1; break;
    case 'crosshatch': case 'contour': case 'wave': r = 4; break;
  }
  return { stylize: r + e.blur * 2, finish: (e.bloom > 0 ? e.bloomRadius * 1.2 : 0) + e.chromatic + 2 };
}

/** Built-in looks. Each sets the effect and colour, and leaves adjustments neutral unless the look needs them. */
export const EFFECT_PRESETS: { id: string; name: string; hint: string; settings: Partial<EffectsSettings> }[] = [
  { id: 'onebit', name: '1-bit', hint: 'Black and white Bayer dither', settings: { effect: 'dither', ditherPattern: 'bayer4', ditherLevels: 2, ditherScale: 2, colorMode: 'mono', contrast: 0.15 } },
  { id: 'riso', name: 'Riso', hint: 'Coloured halftone with grain', settings: { effect: 'halftone', dotShape: 'circle', dotGrid: 'square', dotSpacing: 6, dotAngle: 15, dotScale: 1.1, colorMode: 'mono', ink: '#2b4bd1', paper: '#f3ecdc', paperFromBackground: false, grain: 0.25, grainSize: 1 } },
  { id: 'newsprint', name: 'Newsprint', hint: 'Black 45° halftone on warm paper', settings: { effect: 'halftone', dotShape: 'circle', dotGrid: 'square', dotSpacing: 5, dotAngle: 45, dotScale: 1, colorMode: 'mono', ink: '#1c1d21', paper: '#efe9dc', paperFromBackground: false, grain: 0.15 } },
  { id: 'engraving', name: 'Engraving', hint: 'Wave lines that swell in the darks', settings: { effect: 'wave', waveSpacing: 5, waveAmplitude: 1.5, waveFrequency: 1.5, waveWidth: 0.9, colorMode: 'mono', ink: '#22201c', paper: '#f4f0e6', paperFromBackground: false } },
  { id: 'pen', name: 'Pen hatching', hint: 'Crosshatched tone, inked edges kept', settings: { effect: 'crosshatch', hatchSpacing: 5, hatchLayers: 3, hatchAngle: 45, hatchWidth: 0.7, hatchJitter: 0.15, colorMode: 'mono', contrast: 0.2 } },
  { id: 'terminal', name: 'Terminal', hint: 'Green ASCII on black with scanlines and bloom', settings: { effect: 'ascii', charSet: 'standard', charSize: 9, colorMode: 'mono', ink: '#5dff8a', paper: '#050805', paperFromBackground: false, contrast: 0.35, gamma: 0.7, scanlines: 0.35, scanlineSpacing: 3, bloom: 0.6, bloomThreshold: 0.5, bloomRadius: 10, vignette: 0.4 } },
  { id: 'isolines', name: 'Isolines', hint: 'Tone as contour lines', settings: { effect: 'contour', contourLevels: 10, contourWidth: 0.9, contourFill: false, colorMode: 'mono' } },
  { id: 'mosaic', name: 'Mosaic', hint: 'Voronoi cells of the drawing’s colours', settings: { effect: 'voronoi', cellSize: 18, cellEdge: 0.6, cellJitter: 0.9, colorMode: 'original' } },
  { id: 'film', name: 'Film', hint: 'No stylizing: grain, vignette and a little aberration', settings: { effect: 'none', grain: 0.35, grainSize: 1.2, vignette: 0.35, chromatic: 1.5, contrast: 0.08 } },
];

/** The settings a preset produces: neutral adjustments and finish, then the preset's own values. */
export function presetEffects(p: (typeof EFFECT_PRESETS)[number]): EffectsSettings {
  return { ...DEFAULT_EFFECTS, ...p.settings };
}

// ------------------------------------------------------------ looks

/** A named look for chosen layers. Objects pick it with their `fxLook` style key. */
export interface EffectLook extends EffectsSettings {
  id: string;
  name: string;
}

/**
 * The project's image effects: one look over the whole drawing, plus layer
 * looks. Each layer look starts from the plain drawing and replaces the
 * whole-drawing look on its layers; the whole-drawing finish (grain, vignette…)
 * goes over everything last.
 */
export interface Effects {
  enabled: boolean;
  drawing: EffectsSettings;
  looks: EffectLook[];
}

export const DEFAULT_EFFECTS_DOC: Effects = { enabled: false, drawing: { ...DEFAULT_EFFECTS }, looks: [] };

/** True if the look adds any finish (grain, bloom, aberration, scanlines, vignette). */
export function hasFinish(e: EffectsSettings): boolean {
  return e.grain > 0 || e.bloom > 0 || e.chromatic > 0 || e.scanlines > 0 || e.vignette > 0;
}

/** The style value meaning "no layer look". */
export const NO_LOOK = '';

/**
 * Bring saved effects up to date: fills in new settings and converts the
 * single-look format (one flat settings object, optionally limited to layers
 * with `style.effects`). Returns the effects and the per-node look ids to set.
 */
export function normalizeEffects(raw: any): { effects: Effects; legacyLayerLook: string | null } {
  if (!raw) return { effects: structuredClone(DEFAULT_EFFECTS_DOC), legacyLayerLook: null };
  if (raw.drawing) {
    return {
      effects: {
        enabled: !!raw.enabled,
        drawing: { ...DEFAULT_EFFECTS, ...raw.drawing },
        looks: Array.isArray(raw.looks) ? raw.looks.filter((l: any) => l && typeof l.id === 'string').map((l: any) => ({ ...DEFAULT_EFFECTS, name: 'Look', ...l })) : [],
      },
      legacyLayerLook: null,
    };
  }
  const { enabled, scope, finishAll: _f, ...flat } = raw;
  const settings = { ...DEFAULT_EFFECTS, ...flat } as EffectsSettings;
  if (scope === 'layers') {
    return { effects: { enabled: !!enabled, drawing: { ...DEFAULT_EFFECTS }, looks: [{ ...settings, id: 'look-1', name: 'Look 1' }] }, legacyLayerLook: 'look-1' };
  }
  return { effects: { enabled: !!enabled, drawing: settings, looks: [] }, legacyLayerLook: null };
}
