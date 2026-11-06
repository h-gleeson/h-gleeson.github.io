import { getEngine } from '../engine/engineRef';
import { defaultOffset, ORIENTS, sectionRange } from '../state/section';
import { store } from '../state/store';
import type { SectionSettings } from '../state/types';

const doc = () => store.get().doc;

function setSection(patch: Partial<SectionSettings>, coalesce?: string) {
  store.setDoc((d) => ({ ...d, section: { ...d.section, ...patch } }), coalesce ? { coalesce } : undefined);
}

function bounds() {
  return getEngine()?.sceneBounds();
}

/** Plans and sections. */
export const sectionActions = {
  toggle() {
    const s = doc().section;
    if (s.enabled) {
      setSection({ enabled: false });
      store.status('Section off');
      return;
    }
    const box = bounds();
    let offset = s.offset;
    // First use (or the plane no longer touches the model): start at a sensible cut.
    if (box && !box.isEmpty()) {
      const [lo, hi] = sectionRange(s, box);
      if (!s.placed || offset <= lo || offset >= hi) offset = defaultOffset(s, box);
    }
    setSection({ enabled: true, placed: true, offset });
    store.setUI({ sectionHandle: true });
    store.status(`${s.orient === 'plan' ? 'Plan cut' : 'Section cut'} on · drag the arrow or use the Cut at slider (X to turn off)`);
  },

  setOrient(orient: SectionSettings['orient']) {
    const s = doc().section;
    const angles = orient === 'custom' ? { azimuth: s.azimuth, elevation: s.elevation } : { azimuth: ORIENTS[orient].azimuth, elevation: ORIENTS[orient].elevation };
    const next = { ...s, orient, ...angles, flip: false };
    const box = bounds();
    setSection({ orient, ...angles, flip: false, enabled: true, placed: true, offset: box && !box.isEmpty() ? defaultOffset(next, box) : s.offset });
  },

  set<K extends keyof SectionSettings>(key: K, value: SectionSettings[K]) {
    setSection({ [key]: value } as Partial<SectionSettings>, `section-${String(key)}`);
  },

  /** Custom cut angle (azimuth / elevation of the normal); the cut position along the normal is kept. */
  setAngle(patch: { azimuth?: number; elevation?: number }) {
    setSection({ ...patch, orient: 'custom' }, 'section-angle');
  },

  setOffset(offset: number) {
    setSection({ offset, placed: true }, 'section-offset');
  },

  /** Keep the other side. The plane stays where it is. */
  flip() {
    const s = doc().section;
    setSection({ flip: !s.flip, offset: -s.offset });
  },

  /** Look straight at the cut, in parallel projection, and frame the model. */
  lookAtCut() {
    const s = doc().section;
    const az = s.flip ? (s.azimuth + 180) % 360 : s.azimuth;
    const el = s.flip ? -s.elevation : s.elevation;
    store.setDoc((d) => ({ ...d, camera: { ...d.camera, azimuth: az, elevation: el, projection: 'ortho', oblique: { ...d.camera.oblique, enabled: false }, preset: null } }), { history: false });
    requestAnimationFrame(() => getEngine()?.fit());
  },
};
