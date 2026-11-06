import { Box3, MathUtils, Vector3 } from 'three';
import type { SectionSettings } from './types';

/** Unit normal of the cut plane, pointing toward the side that is cut away. */
export function sectionNormal(s: Pick<SectionSettings, 'azimuth' | 'elevation' | 'flip'>): Vector3 {
  const az = MathUtils.degToRad(s.azimuth), el = MathUtils.degToRad(s.elevation);
  const n = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  if (s.flip) n.negate();
  // Snap tiny components so plans and elevations are exactly axis-aligned.
  n.set(snap(n.x), snap(n.y), snap(n.z)).normalize();
  return n;
}

const snap = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

/** Extent of a box along the section normal: the useful range for the cut position. */
export function sectionRange(s: SectionSettings, box: Box3): [number, number] {
  if (box.isEmpty()) return [-10, 10];
  const n = sectionNormal(s);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 8; i++) {
    const d = n.dot(new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

export const ORIENTS: Record<Exclude<SectionSettings['orient'], 'custom'>, { azimuth: number; elevation: number; label: string; hint: string }> = {
  plan: { azimuth: 0, elevation: 90, label: 'Plan', hint: 'Horizontal cut, looking down' },
  x: { azimuth: 90, elevation: 0, label: 'Section X', hint: 'Vertical cut across X, looking along −X' },
  z: { azimuth: 0, elevation: 0, label: 'Section Z', hint: 'Vertical cut across Z, looking along −Z' },
};

/** A sensible first cut: plans at about a third of the height (through walls and openings), sections through the middle. */
export function defaultOffset(s: SectionSettings, box: Box3): number {
  const [lo, hi] = sectionRange(s, box);
  return s.orient === 'plan' && !s.flip ? lo + (hi - lo) * 0.35 : (lo + hi) / 2;
}
