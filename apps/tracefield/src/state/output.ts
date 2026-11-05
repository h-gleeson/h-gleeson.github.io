import type { OutputSettings } from './types';

/**
 * Drawing-frame sizes. Screen presets fix a pixel size; paper presets fix a
 * physical size (mm) and get their pixels from the DPI.
 */

export interface SizePreset {
  id: string;
  label: string;
  group: 'screen' | 'paper';
  /** px for screen presets, mm for paper presets. */
  w: number;
  h: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: '16:9', label: '16 : 9', group: 'screen', w: 3840, h: 2160 },
  { id: '3:2', label: '3 : 2', group: 'screen', w: 3600, h: 2400 },
  { id: '4:3', label: '4 : 3', group: 'screen', w: 3200, h: 2400 },
  { id: '1:1', label: '1 : 1', group: 'screen', w: 3000, h: 3000 },
  { id: '4:5', label: '4 : 5', group: 'screen', w: 2400, h: 3000 },
  { id: '2:1', label: '2 : 1', group: 'screen', w: 4000, h: 2000 },
  { id: 'A4L', label: 'A4 landscape', group: 'paper', w: 297, h: 210 },
  { id: 'A4P', label: 'A4 portrait', group: 'paper', w: 210, h: 297 },
  { id: 'A3L', label: 'A3 landscape', group: 'paper', w: 420, h: 297 },
  { id: 'A3P', label: 'A3 portrait', group: 'paper', w: 297, h: 420 },
  { id: 'A2L', label: 'A2 landscape', group: 'paper', w: 594, h: 420 },
  { id: 'A2P', label: 'A2 portrait', group: 'paper', w: 420, h: 594 },
  { id: 'A1L', label: 'A1 landscape', group: 'paper', w: 841, h: 594 },
  { id: 'A1P', label: 'A1 portrait', group: 'paper', w: 594, h: 841 },
];

export const DPI_OPTIONS = [72, 150, 200, 300];

/** Browser canvas limits (Chromium): 32767 px per side, ~268 megapixels total. */
export const MAX_SIDE = 32767;
export const MAX_PIXELS = 268_000_000;

const MM_PER_INCH = 25.4;

export function presetPixels(p: SizePreset, dpi: number): { width: number; height: number } {
  if (p.group === 'screen') return { width: p.w, height: p.h };
  return { width: Math.round((p.w / MM_PER_INCH) * dpi), height: Math.round((p.h / MM_PER_INCH) * dpi) };
}

export function applyPreset(o: OutputSettings, id: string, dpi = o.dpi): OutputSettings {
  const p = SIZE_PRESETS.find((x) => x.id === id);
  if (!p) return o;
  return { ...o, ...presetPixels(p, dpi), preset: id, dpi, lockAspect: true };
}

export function aspectOf(o: Pick<OutputSettings, 'width' | 'height'>): number {
  return o.width / Math.max(1, o.height);
}

export function physicalSize(o: OutputSettings): string {
  const mm = (px: number) => (px / o.dpi) * MM_PER_INCH;
  return `${Math.round(mm(o.width))} × ${Math.round(mm(o.height))} mm at ${o.dpi} dpi`;
}

export function sizeLabel(o: OutputSettings): string {
  const p = SIZE_PRESETS.find((x) => x.id === o.preset);
  const name = p ? (p.group === 'paper' ? `${p.label} · ${o.dpi} dpi` : p.label) : 'Custom';
  return `${name} · ${o.width} × ${o.height}`;
}

export function validateSize(w: number, h: number): string | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16) return 'Output must be at least 16 × 16 px.';
  if (w > MAX_SIDE || h > MAX_SIDE) return `Browsers can't make images wider or taller than ${MAX_SIDE.toLocaleString()} px.`;
  if (w * h > MAX_PIXELS) return `${((w * h) / 1e6).toFixed(0)} MP is over the browser limit of about ${MAX_PIXELS / 1e6} MP. Lower the size or DPI.`;
  return null;
}

export const DEFAULT_OUTPUT: OutputSettings = {
  width: 3840,
  height: 2160,
  preset: '16:9',
  dpi: 300,
  lockAspect: true,
  transparent: false,
  showFrame: true,
  includeGrid: false,
  antialias: 4,
  fileName: '',
};
