import { sectionActions as sec } from '../app/sectionActions';
import { getEngine } from '../engine/engineRef';
import { ORIENTS, sectionRange } from '../state/section';
import { store, useStore } from '../state/store';
import type { SectionSettings } from '../state/types';
import { NumberField, Row, Section, Segmented, Slider, Toggle } from './controls';

/** Section cut controls (View tab). */
export function SectionPanel() {
  const s = useStore((st) => st.doc.section);
  const handle = useStore((st) => st.ui.sectionHandle);
  useStore((st) => st.doc.nodes); // re-read bounds when the model changes
  const box = getEngine()?.sceneBounds();
  const [lo, hi] = box && !box.isEmpty() ? sectionRange(s, box) : [-10, 10];
  const span = hi - lo || 1;
  const isPlan = s.orient === 'plan' && !s.flip;

  return (
    <Section title="Plan / section cut" right={<Toggle value={s.enabled} onChange={sec.toggle} label="Cut" title="Section cut on / off (X)" />}>
      <Segmented<SectionSettings['orient']>
        value={s.orient}
        onChange={sec.setOrient}
        options={[
          ...Object.entries(ORIENTS).map(([value, o]) => ({ value: value as SectionSettings['orient'], label: o.label, title: o.hint })),
          { value: 'custom', label: 'Custom', title: 'Cut at any angle' },
        ]}
      />
      {s.orient === 'custom' && (
        <>
          <Row label="Cut azimuth">
            <Slider value={s.azimuth} min={0} max={360} step={0.5} precision={1} unit="°" onChange={(v) => sec.setAngle({ azimuth: v })} />
          </Row>
          <Row label="Cut elevation">
            <Slider value={s.elevation} min={-90} max={90} step={0.5} precision={1} unit="°" onChange={(v) => sec.setAngle({ elevation: v })} />
          </Row>
        </>
      )}
      <Row label={isPlan ? 'Cut height' : 'Cut at'} title="Where the plane cuts, in model units along its normal">
        <Slider value={s.offset} min={lo - span * 0.02} max={hi + span * 0.02} step={span / 1000} precision={3} onChange={sec.setOffset} />
      </Row>
      <Row label="Exact" title="Type an exact position (model units)">
        <NumberField value={s.offset} step={span / 200} precision={4} onChange={sec.setOffset} />
      </Row>
      <div className="btn-row">
        <button className="btn" onClick={sec.flip} title="Keep the other side of the cut">
          Flip side
        </button>
        <button className="btn" onClick={sec.lookAtCut} title="Parallel view straight at the cut, framed">
          Look at cut
        </button>
      </div>
      <Row label="Show handle" title="Plane outline and drag arrow in the viewport">
        <Toggle value={handle} onChange={(v) => store.setUI({ sectionHandle: v })} />
      </Row>

      <div className="sub-label">Where the plane cuts</div>
      <Row label="Fill cut solids" title="Poché: fill where the plane cuts through solids">
        <Toggle value={s.caps} onChange={(v) => sec.set('caps', v)} />
      </Row>
      <Row label="Draw cut lines" title="Outline where the plane meets the geometry">
        <Toggle value={s.cutLines} onChange={(v) => sec.set('cutLines', v)} />
      </Row>
      <p className="hint">
        Poché colour, hatch and cut lineweight are set per object in the <b>Style</b> tab under <i>Section cut</i>. Set them on a group (walls, slabs, glass) and everything inside follows; with nothing selected they set the drawing default.
      </p>
      <p className="hint">Poché needs closed (watertight) meshes; open surfaces get a cut line but no fill. Saved views remember their cut, so you can keep a plan per level and named sections.</p>
    </Section>
  );
}
