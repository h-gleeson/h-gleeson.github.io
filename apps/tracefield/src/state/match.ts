import { registry } from '../import/registry';
import { descendants, resolveStyle, setStyle } from './scene';
import type { GraphicStyle, ProjectDoc, StyleKey } from './types';

/**
 * Match properties (like AutoCAD's MATCHPROP): copy one object's effective
 * style onto others, by property group.
 */

export type MatchGroup = 'fill' | 'lines' | 'hatch' | 'shadows' | 'cut';

export const MATCH_GROUPS: { id: MatchGroup; label: string; keys: StyleKey[] }[] = [
  { id: 'fill', label: 'Fill', keys: ['fillMode', 'fillColor', 'opacity', 'toning'] },
  {
    id: 'lines',
    label: 'Lines',
    keys: ['showLines', 'lineColor', 'lineOpacity', 'lineStyle', 'silhouetteWidth', 'creaseWidth', 'creaseAngle', 'openEdgeWidth', 'materialEdgeWidth', 'allEdgesWidth', 'curveWidth', 'lineOrder'],
  },
  { id: 'hatch', label: 'Hatch', keys: ['hatch', 'hatchColor', 'hatchSpacing', 'hatchWidth', 'hatchAngle'] },
  { id: 'shadows', label: 'Shadows', keys: ['castShadow', 'receiveShadow'] },
  { id: 'cut', label: 'Section cut', keys: ['cutFill', 'cutFillColor', 'cutHatch', 'cutHatchColor', 'cutHatchSpacing', 'cutHatchWidth', 'cutHatchAngle', 'cutLineColor', 'cutLineWidth'] },
];

// Every style key belongs to a group, except cutSolid (it describes how the model is built, not how it looks).
type Covered = (typeof MATCH_GROUPS)[number]['keys'][number];
const _check: Exclude<StyleKey, 'cutSolid'> extends Covered ? true : never = true;
void _check;

export const ALL_MATCH_GROUPS: Record<MatchGroup, boolean> = { fill: true, lines: true, hatch: true, shadows: true, cut: true };

/** The source mesh's own imported material, if it has one. */
function materialOf(doc: ProjectDoc, id: string) {
  const g = doc.nodes[id]?.geom;
  return g ? registry.get(g.model)?.drawables[g.index]?.materials[0] : undefined;
}

/**
 * The values to copy from `sourceId` for the enabled groups. A mesh drawn in
 * "material" fill hands over its imported colour as a plain colour fill, so the
 * target really takes on the source's look (textures can't be carried over).
 * A group drawn in "material" fill passes "material" on, so each target keeps
 * its own imported material.
 */
export function matchValues(doc: ProjectDoc, sourceId: string, groups: Record<MatchGroup, boolean>): Partial<GraphicStyle> {
  const s = resolveStyle(doc, sourceId);
  const out: Record<string, unknown> = {};
  for (const g of MATCH_GROUPS) if (groups[g.id]) for (const k of g.keys) out[k] = s[k];
  if (groups.fill && s.fillMode === 'material') {
    const m = materialOf(doc, sourceId);
    if (m) {
      out.fillMode = 'color';
      out.fillColor = m.color;
      out.opacity = s.opacity * (m.opacity ?? 1);
    }
  }
  return out as Partial<GraphicStyle>;
}

/**
 * Apply matched values to the targets. Each target only keeps an override where
 * the value differs from what it would inherit anyway. On a group, the same keys
 * are cleared from everything inside so the whole group takes the look.
 */
export function applyMatch(doc: ProjectDoc, targetIds: string[], values: Partial<GraphicStyle>): ProjectDoc {
  const keys = Object.keys(values) as StyleKey[];
  let d = doc;
  for (const id of targetIds) {
    const n = d.nodes[id];
    if (!n) continue;
    const inherited = n.parent ? resolveStyle(d, n.parent) : d.defaults;
    const patch: Record<string, unknown> = {};
    for (const k of keys) patch[k] = values[k] === inherited[k] ? undefined : values[k];
    d = setStyle(d, [id], patch);
    const inside = descendants(d, id).filter((c) => c !== id && keys.some((k) => d.nodes[c]?.style[k] !== undefined));
    if (inside.length) d = setStyle(d, inside, Object.fromEntries(keys.map((k) => [k, undefined])));
  }
  return d;
}
