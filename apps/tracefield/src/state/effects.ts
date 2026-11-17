/**
 * Image effects: a post-process applied to the finished drawing, in the
 * viewport and in the PNG export. Every size is in px at the reference width,
 * like lineweights and hatches, and every pattern is anchored to the frame
 * centre, so the viewport and the export match at any output size.
 *
 * Order: adjust → stylize (one effect) → colour → mix → finish.
 */

export type EffectId = 'none' | 'dither' | 'halftone' | 'ascii' | 'crosshatch' | 'contour' | 'edges' | 'pixelate' | 'wave' | 'voronoi' | 'shatter' | 'threshold' | 'smear';
export type DitherPattern = 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'noise';
export type DotShape = 'circle' | 'square' | 'diamond' | 'line';
export type DotGrid = 'square' | 'hex';
export type CharSet = 'standard' | 'dense' | 'blocks' | 'binary' | 'custom';
/** original: the drawing's colours · mono: ink on paper · gradient: tone mapped through shadow → mid → highlight · palette: snapped to a few inks · spot: greyscale plus one spot ink. */
export type ColorMode = 'original' | 'mono' | 'gradient' | 'palette' | 'spot';

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
  // Shatter
  shardSize: number; // px
  shardStretch: number; // 1..8, long shards along the angle
  shardAngle: number; // degrees
  shardOffset: number; // px each shard's picture slides by, at most
  shardShade: number; // 0..1 brightness variation between shards
  shardEdge: number; // px outline in the ink colour
  // Photocopy (hard threshold with toner grit)
  threshLevel: number; // 0..1 tone where ink starts
  threshGrit: number; // 0..1 how ragged the threshold is
  threshGritSize: number; // px grain of the grit
  // Smear (pixel-sort style streaks)
  smearLength: number; // px
  smearAngle: number; // degrees the streaks run toward
  smearThreshold: number; // 0..1 only tones past this smear
  smearBright: boolean; // true: light tones streak · false: dark tones streak
  smearBand: number; // px rows that streak together, each its own length

  // Colour
  colorMode: ColorMode;
  ink: string;
  paper: string;
  paperFromBackground: boolean;
  // Gradient map: dark tones → shadow, middle → mid, light → highlight
  gradShadow: string;
  gradMid: string;
  gradHighlight: string;
  gradMidpoint: number; // 0.05..0.95, where the mid colour sits
  gradBands: number; // 0 = smooth, 2..12 = hard flat bands
  // Palette: every pixel snaps to the nearest of these inks
  pal1: string;
  pal2: string;
  pal3: string;
  pal4: string;
  pal5: string;
  palCount: number; // 2..5
  palDither: number; // 0..1 ordered dither before snapping, for gradients
  // Spot colour: greyscale, with colourful parts of the drawing in one spot ink
  spotColor: string;
  spotThreshold: number; // 0..1 saturation above which a pixel takes the spot colour
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
  // Glitch
  glitch: number; // 0..1 share of slices that are displaced
  glitchSlice: number; // px slice height
  glitchShift: number; // px largest displacement
  glitchSplit: number; // px RGB split inside displaced slices
  glitchBlocks: number; // 0..1 amount of solid and striped bars
  glitchColor: string;
  glitchVertical: boolean;
  glitchSeed: number;
  // Misprint: inks out of register, shifted the same way across the sheet
  misprint: number; // px
  misprintAngle: number; // degrees
  // Echo: fading ghost copies
  echo: number; // 0..1 strength
  echoCount: number; // 1..6
  echoOffset: number; // px between copies
  echoAngle: number; // degrees
  // HUD overlay: frame brackets, rulers, crosshair, circles, leaders, waveform
  hud: number; // 0..1 opacity
  hudColor: string;
  hudDensity: number; // 0..1 how many circles and leader lines
  hudWidth: number; // px line weight
  hudSeed: number;
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
  shardSize: 60,
  shardStretch: 3,
  shardAngle: 25,
  shardOffset: 10,
  shardShade: 0.35,
  shardEdge: 0,
  threshLevel: 0.5,
  threshGrit: 0.25,
  threshGritSize: 1.5,
  smearLength: 120,
  smearAngle: -90,
  smearThreshold: 0.6,
  smearBright: true,
  smearBand: 3,
  colorMode: 'original',
  ink: '#1c1d21',
  paper: '#ffffff',
  paperFromBackground: true,
  gradShadow: '#0a1a7a',
  gradMid: '#1f6bff',
  gradHighlight: '#c9ecff',
  gradMidpoint: 0.5,
  gradBands: 0,
  pal1: '#1d1d1f',
  pal2: '#2a2fd4',
  pal3: '#ff5a1f',
  pal4: '#e8e8ea',
  pal5: '#9a9cb0',
  palCount: 5,
  palDither: 0,
  spotColor: '#ff2d6f',
  spotThreshold: 0.2,
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
  glitch: 0,
  glitchSlice: 14,
  glitchShift: 40,
  glitchSplit: 3,
  glitchBlocks: 0,
  glitchColor: '#1f3ce0',
  glitchVertical: false,
  glitchSeed: 1,
  misprint: 0,
  misprintAngle: 30,
  echo: 0,
  echoCount: 3,
  echoOffset: 8,
  echoAngle: 0,
  hud: 0,
  hudColor: '#1c1d21',
  hudDensity: 0.5,
  hudWidth: 0.8,
  hudSeed: 1,
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
  { id: 'shatter', label: 'Shatter', hint: 'Broken-glass shards: each shard slides and shades the picture a little' },
  { id: 'threshold', label: 'Photocopy', hint: 'Hard black-and-white threshold with ragged toner grit, like a photocopied collage' },
  { id: 'smear', label: 'Smear', hint: 'Pixel-sort streaks: light (or dark) tones drag along a direction, row by row' },
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
    case 'shatter': r = e.shardSize * Math.max(1, e.shardStretch) * 1.5 + e.shardOffset + e.shardEdge; break;
    case 'threshold': r = 3; break;
    case 'smear': r = e.smearLength + 2; break;
  }
  if (e.colorMode === 'palette' && e.palDither > 0) r = Math.max(r, 4);
  const glitch = e.glitch > 0 ? e.glitchShift + e.glitchSplit : 0;
  const echo = e.echo > 0 ? e.echoOffset * Math.max(1, Math.round(e.echoCount)) : 0;
  return { stylize: r + e.blur * 2, finish: (e.bloom > 0 ? e.bloomRadius * 1.2 : 0) + e.chromatic + glitch + Math.abs(e.misprint) + echo + 2 };
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
  { id: 'cobalt', name: 'Cobalt', hint: 'Flat bands of blue from a gradient map: graphic, game-menu colour', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#0a1a7a', gradMid: '#1f6bff', gradHighlight: '#c9ecff', gradMidpoint: 0.45, gradBands: 4, contrast: 0.15 } },
  { id: 'signal', name: 'Signal', hint: 'Blue and grey duotone with glitched slices and colour bars', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#1530d8', gradMid: '#8f9bc4', gradHighlight: '#eef0f4', gradMidpoint: 0.4, gradBands: 0, contrast: 0.1, glitch: 0.35, glitchSlice: 18, glitchShift: 60, glitchSplit: 2, glitchBlocks: 0.35, glitchColor: '#1f3ce0' } },
  { id: 'shards', name: 'Shards', hint: 'Shattered-glass shards over a blue gradient map', settings: { effect: 'shatter', shardSize: 70, shardStretch: 3.5, shardAngle: 30, shardOffset: 14, shardShade: 0.4, shardEdge: 0, colorMode: 'gradient', gradShadow: '#06135c', gradMid: '#1d63f0', gradHighlight: '#bfe6ff', gradMidpoint: 0.45, gradBands: 5 } },
  { id: 'duotone', name: 'Duotone', hint: 'Two-colour print: black into hot pink, smooth', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#111114', gradMid: '#c2185b', gradHighlight: '#ffd6e6', gradMidpoint: 0.5, gradBands: 0, contrast: 0.2, grain: 0.15 } },
  { id: 'photocopy', name: 'Photocopy', hint: 'Black-and-white threshold with toner grit on grey paper', settings: { effect: 'threshold', threshLevel: 0.5, threshGrit: 0.35, threshGritSize: 1.5, colorMode: 'mono', ink: '#111113', paper: '#ebebe8', paperFromBackground: false, grain: 0.18 } },
  { id: 'rewind', name: 'Rewind', hint: 'Photocopied greyscale with one hot-pink spot ink, ghost echoes and a HUD overlay', settings: { effect: 'threshold', threshLevel: 0.48, threshGrit: 0.25, threshGritSize: 1.2, colorMode: 'spot', spotColor: '#ff2d6f', spotThreshold: 0.18, echo: 0.35, echoCount: 2, echoOffset: 7, echoAngle: 0, hud: 0.8, hudColor: '#1a1a1c', hudDensity: 0.55, hudWidth: 0.7 } },
  { id: 'octane', name: 'Octane', hint: 'Snapped to five inks (black, ultramarine, orange, white, grey) with dithered gradients and a misprint', settings: { effect: 'none', colorMode: 'palette', pal1: '#1d1d1f', pal2: '#2a2fd4', pal3: '#ff5a1f', pal4: '#e8e8ea', pal5: '#9a9cb0', palCount: 5, palDither: 0.35, contrast: 0.2, saturation: 0.4, misprint: 3, misprintAngle: 30 } },
  { id: 'mediation', name: 'Mediation', hint: 'Cool blue tint with a glow and a white HUD frame', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#0c1a3d', gradMid: '#4d74d9', gradHighlight: '#f2f5ff', gradMidpoint: 0.45, gradBands: 0, bloom: 0.35, bloomThreshold: 0.75, bloomRadius: 10, hud: 0.85, hudColor: '#ffffff', hudDensity: 0.45, hudWidth: 0.9 } },
  { id: 'datamosh', name: 'Datamosh', hint: 'Light tones smeared downward in streaks, with glitch slices', settings: { effect: 'smear', smearLength: 140, smearAngle: -90, smearThreshold: 0.55, smearBright: true, smearBand: 3, glitch: 0.25, glitchSlice: 12, glitchShift: 40, glitchSplit: 3 } },
  { id: 'echo', name: 'Echo', hint: 'Fading ghost copies trailing to one side, like motion or a double print', settings: { effect: 'none', echo: 0.55, echoCount: 3, echoOffset: 10, echoAngle: 0 } },
  { id: 'hud', name: 'HUD', hint: 'The drawing as it is, framed by a technical overlay: brackets, rulers, crosshair and leaders', settings: { effect: 'none', hud: 1, hudColor: '#1c1d21', hudDensity: 0.5, hudWidth: 0.8 } },
  { id: 'thermal', name: 'Thermal', hint: 'Heat-camera gradient: violet through red into yellow', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#1a0533', gradMid: '#e8261d', gradHighlight: '#fff3a3', gradMidpoint: 0.5, gradBands: 0, contrast: 0.25 } },
  { id: 'nightvision', name: 'Night vision', hint: 'Green phosphor with scanlines, grain, glow and a vignette', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#001a05', gradMid: '#1fbf3a', gradHighlight: '#d8ffcf', gradMidpoint: 0.45, gradBands: 0, contrast: 0.2, scanlines: 0.3, scanlineSpacing: 3, grain: 0.35, grainSize: 1.2, bloom: 0.45, bloomThreshold: 0.6, bloomRadius: 8, vignette: 0.6 } },
  { id: 'cyanotype', name: 'Cyanotype', hint: 'Prussian-blue sun print on paper, with grain', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#0b2a5b', gradMid: '#2f6db5', gradHighlight: '#e9f0f7', gradMidpoint: 0.45, gradBands: 0, contrast: 0.15, grain: 0.2 } },
  { id: 'screenprint', name: 'Screen print', hint: 'Three flat inks, slightly out of register, with grain', settings: { effect: 'none', colorMode: 'palette', pal1: '#1b1b1b', pal2: '#e83a4a', pal3: '#f2ead8', palCount: 3, palDither: 0, contrast: 0.2, misprint: 2.5, misprintAngle: 35, grain: 0.2 } },
  { id: 'vaporwave', name: 'Vaporwave', hint: 'Violet, pink and cyan gradient with scanlines, aberration and glow', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#2b0f4d', gradMid: '#ff4fb8', gradHighlight: '#7ff6ff', gradMidpoint: 0.5, gradBands: 0, scanlines: 0.2, scanlineSpacing: 3, chromatic: 2, bloom: 0.3, bloomThreshold: 0.7, bloomRadius: 10 } },
  { id: 'sepia', name: 'Sepia', hint: 'Warm brown photo tone with grain and a vignette', settings: { effect: 'none', colorMode: 'gradient', gradShadow: '#2a1a0e', gradMid: '#9b6b43', gradHighlight: '#f5e6cc', gradMidpoint: 0.5, gradBands: 0, grain: 0.25, vignette: 0.4 } },
  { id: 'pop', name: 'Pop halftone', hint: 'Big halftone dots snapped to bold comic inks', settings: { effect: 'halftone', dotShape: 'circle', dotGrid: 'hex', dotSpacing: 9, dotAngle: 15, dotScale: 1.1, colorMode: 'palette', pal1: '#141414', pal2: '#e8263c', pal3: '#ffd319', pal4: '#1e5bff', pal5: '#fbf6ea', palCount: 5, palDither: 0, saturation: 0.6 } },
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
  return e.grain > 0 || e.bloom > 0 || e.chromatic > 0 || e.scanlines > 0 || e.vignette > 0 || e.glitch > 0 || e.glitchBlocks > 0 || e.misprint !== 0 || e.echo > 0 || e.hud > 0;
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
