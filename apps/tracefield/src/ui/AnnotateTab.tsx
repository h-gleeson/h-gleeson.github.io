import { annotateActions as an } from '../app/annotateActions';
import { applyCasing } from '../annotate/layout';
import { useStore } from '../state/store';
import type { LabelCasing, LabelFont, LabelLayout, LeaderEnd } from '../state/types';
import { ColorField, Row, Section, Segmented, Slider, Toggle } from './controls';

const WEIGHTS: [number, string][] = [
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semibold'],
  [700, 'Bold'],
];

export function AnnotateTab() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.ui.selection);
  const selected = useStore((s) => s.ui.label);
  const { settings: s, items } = doc.annotations;
  const sel = selection.filter((id) => doc.nodes[id]);

  return (
    <>
      <Section title="Labels" right={<Toggle value={s.show} onChange={(v) => an.set('show', v)} label="Show" />}>
        <div className="btn-row">
          <button className="btn primary wide" onClick={an.labelSelection} title="Label the selected objects, or the model's main parts if nothing is selected (T)">
            {sel.length ? `Label ${sel.length === 1 ? doc.nodes[sel[0]].name : `${sel.length} selected`}` : 'Label main parts'}
          </button>
        </div>
        {items.length > 0 && (
          <div className="label-list">
            {items.map((a, i) => (
              <div key={a.id} className={`label-item ${selected === a.id ? 'on' : ''}`}>
                <button onClick={() => an.select(a.id)} title={doc.nodes[a.node]?.name}>
                  {s.mode === 'key' && <b>{i + 1}</b>}
                  <span>{applyCasing(a.text ?? doc.nodes[a.node]?.name ?? '(missing object)', s.casing)}</span>
                </button>
                {s.mode === 'key' && (
                  <>
                    <button className="icon-btn" disabled={i === 0} title="Move up the key" onClick={() => an.move(a.id, -1)}>↑</button>
                    <button className="icon-btn" disabled={i === items.length - 1} title="Move down the key" onClick={() => an.move(a.id, 1)}>↓</button>
                  </>
                )}
                <button className="icon-btn" title="Remove label" onClick={() => an.remove(a.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {items.length > 1 && (
          <div className="btn-row">
            <button className="btn" onClick={() => confirm(`Remove all ${items.length} labels?`) && an.clearAll()}>
              Remove all
            </button>
          </div>
        )}
        <p className="hint">Labels follow the object's name unless you give them their own text. Drag the text to place it, drag the dot to re-anchor it on any surface, double-click to edit.</p>
      </Section>

      {selected && <SelectedLabel id={selected} />}

      <Section title="Layout">
        <Segmented
          value={s.mode}
          onChange={(v) => an.set('mode', v)}
          options={[
            { value: 'leaders', label: 'Leaders', title: 'Text with a leader line to each object' },
            { value: 'key', label: 'Numbered key', title: 'Numbered tags on the objects, names in a legend' },
          ]}
        />
        {s.mode === 'leaders' ? (
          <>
            <Row label="Arrange" stacked title="Free: where you put them · columns: tags lined up beside the model, ordered to avoid crossing leaders">
              <Segmented<LabelLayout>
                value={s.layout}
                onChange={(v) => an.set('layout', v)}
                options={[
                  { value: 'free', label: 'Free' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                  { value: 'both', label: 'Both sides' },
                ]}
              />
            </Row>
            {s.layout !== 'free' && (
              <>
                <Row label="Gap to model">
                  <Slider value={s.gap} min={0} max={240} step={1} precision={0} unit="px" onChange={(v) => an.set('gap', v)} />
                </Row>
                <p className="hint">Dragging a label switches to Free, keeping the column positions as a starting point.</p>
              </>
            )}
          </>
        ) : (
          <p className="hint">Drag the legend to place it; drag a tag to re-anchor it. Order the key in the list above.</p>
        )}
      </Section>

      <Section title="Text">
        <Row label="Font" stacked>
          <Segmented<LabelFont>
            value={s.font}
            onChange={(v) => an.set('font', v)}
            options={[
              { value: 'sans', label: 'Sans' },
              { value: 'grotesk', label: 'Grotesk', title: 'Helvetica / Arial' },
              { value: 'geometric', label: 'Geometric', title: 'Futura / Century Gothic / Avenir' },
              { value: 'serif', label: 'Serif' },
              { value: 'mono', label: 'Mono' },
            ]}
          />
        </Row>
        <Row label="Size" title="px at the reference width, like lineweights">
          <Slider value={s.size} min={6} max={48} step={0.5} precision={1} unit="px" onChange={(v) => an.set('size', v)} />
        </Row>
        <Row label="Weight">
          <select className="select" value={s.weight} onChange={(e) => an.set('weight', Number(e.target.value))}>
            {WEIGHTS.map(([w, n]) => (
              <option key={w} value={w}>
                {n}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Colour">
          <ColorField value={s.color} onChange={(v) => an.set('color', v)} />
        </Row>
        <Row label="Casing" stacked>
          <Segmented<LabelCasing>
            value={s.casing}
            onChange={(v) => an.set('casing', v)}
            options={[
              { value: 'asis', label: 'As typed' },
              { value: 'upper', label: 'UPPER' },
              { value: 'lower', label: 'lower' },
              { value: 'title', label: 'Title' },
            ]}
          />
        </Row>
        <Row label="Tracking" title="Letter spacing">
          <Slider value={s.tracking} min={-0.05} max={0.3} step={0.005} precision={3} unit="em" onChange={(v) => an.set('tracking', v)} />
        </Row>
        <Row label="Halo" title="Knock the drawing out behind the text in the background colour">
          <Toggle value={s.halo} onChange={(v) => an.set('halo', v)} />
        </Row>
      </Section>

      <Section title={s.mode === 'key' ? 'Tags' : 'Leaders'}>
        <Row label="Colour">
          <ColorField value={s.leaderColor} onChange={(v) => an.set('leaderColor', v)} />
        </Row>
        <Row label="Weight">
          <Slider value={s.leaderWidth} min={0.2} max={4} step={0.05} unit="px" onChange={(v) => an.set('leaderWidth', v)} />
        </Row>
        {s.mode === 'leaders' && (
          <>
            <Row label="End" stacked>
              <Segmented<LeaderEnd>
                value={s.leaderEnd}
                onChange={(v) => an.set('leaderEnd', v)}
                options={[
                  { value: 'dot', label: 'Dot' },
                  { value: 'arrow', label: 'Arrow' },
                  { value: 'tick', label: 'Tick' },
                  { value: 'none', label: 'None' },
                ]}
              />
            </Row>
            <Row label="Elbow" title="End leaders in a short horizontal shoulder">
              <Toggle value={s.elbow} onChange={(v) => an.set('elbow', v)} />
            </Row>
          </>
        )}
      </Section>
    </>
  );
}

function SelectedLabel({ id }: { id: string }) {
  const doc = useStore((s) => s.doc);
  const a = doc.annotations.items.find((x) => x.id === id);
  if (!a) return null;
  const s = doc.annotations.settings;
  const name = doc.nodes[a.node]?.name ?? '(missing object)';
  return (
    <Section title="Selected label">
      <Row label="Object">
        <span className="value">{name}</span>
      </Row>
      <Row label="Text">
        <input
          className="text"
          key={a.id + (a.text ?? '')}
          defaultValue={a.text ?? ''}
          placeholder={`${name} (object name)`}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => an.update(a.id, { text: e.target.value.trim() || null })}
        />
      </Row>
      <Row label="Size" overridden={a.size !== undefined} onReset={() => an.clearOverride(a.id, 'size')}>
        <Slider value={a.size ?? s.size} min={6} max={48} step={0.5} precision={1} unit="px" onChange={(v) => an.update(a.id, { size: v }, `label-size-${a.id}`)} />
      </Row>
      <Row label="Weight" overridden={a.weight !== undefined} onReset={() => an.clearOverride(a.id, 'weight')}>
        <select className="select" value={a.weight ?? s.weight} onChange={(e) => an.update(a.id, { weight: Number(e.target.value) })}>
          {WEIGHTS.map(([w, n]) => (
            <option key={w} value={w}>
              {n}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Colour" overridden={a.color !== undefined} onReset={() => an.clearOverride(a.id, 'color')}>
        <ColorField value={a.color ?? s.color} onChange={(v) => an.update(a.id, { color: v }, `label-color-${a.id}`)} />
      </Row>
      <div className="btn-row">
        <button className="btn" onClick={() => an.select(null)}>
          Done
        </button>
        <button className="btn" onClick={() => an.remove(a.id)}>
          Remove label
        </button>
      </div>
    </Section>
  );
}
