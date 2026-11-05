import { useState } from 'react';
import { explodeActions as ex } from '../app/explodeActions';
import { assembledBox, chooseParts, effectiveAnchors, isZero } from '../state/explode';
import { topmost } from '../state/scene';
import { useStore } from '../state/store';
import type { LineStyle, Vec3 } from '../state/types';
import { ColorField, NumberField, Row, Section, Segmented, Slider, Toggle } from './controls';

export function ExplodeTab() {
  const doc = useStore((s) => s.doc);
  const ui = useStore((s) => s.ui);
  const e = doc.explode;
  const sel = topmost(doc, ui.selection.filter((id) => doc.nodes[id]));
  const moved = Object.entries(e.offsets).filter(([id, o]) => doc.nodes[id] && !isZero(o)).length;
  const preview = chooseParts(doc, ui.selection);
  const target = sel.length ? (sel.length === 1 ? `children of ${doc.nodes[sel[0]].name}` : `${sel.length} selected`) : 'the model';
  const liveParts = e.parts.filter((id) => doc.nodes[id]);

  return (
    <>
      <Section title="Assembled ↔ exploded">
        <Segmented
          value={e.amount > 0.5 ? 'exploded' : 'assembled'}
          onChange={(v) => (moved ? ex.animateTo(v === 'exploded' ? 1 : 0) : v === 'exploded' && ex.autoExplode())}
          options={[
            { value: 'assembled', label: 'Assembled', title: 'Parts in their imported positions (E)' },
            { value: 'exploded', label: 'Exploded', title: 'Parts at their exploded positions (E)' },
          ]}
        />
        <Row label="Blend" title="Scrub between assembled (0) and exploded (1); exports use this too">
          <Slider value={e.amount} min={0} max={1} step={0.01} onChange={ex.setAmount} />
        </Row>
        <p className="hint">
          {moved ? `${moved} part${moved > 1 ? 's' : ''} moved.` : 'Nothing exploded yet.'} The assembled model is never changed; exploding only adds offsets on top.
        </p>
      </Section>

      <Section title="Auto-explode">
        <div className="btn-row">
          <button className="btn primary wide" disabled={!preview.length} onClick={ex.autoExplode} title={preview.map((id) => doc.nodes[id].name).join(', ')}>
            Explode {target} · {preview.length} parts
          </button>
        </div>
        {!preview.length && <p className="hint">{sel.length === 1 ? 'Select a group with several parts, or several objects.' : 'The model has a single part.'}</p>}
        <Row label="Mode">
          <Segmented
            value={e.mode}
            onChange={(mode) => ex.setParams({ mode })}
            options={[
              { value: 'axial', label: 'Axial', title: 'Stack parts along an axis, level by level' },
              { value: 'radial', label: 'Radial', title: 'Push parts outward from the centre' },
            ]}
          />
        </Row>
        <Row label={e.mode === 'axial' ? 'Axis' : 'Around axis'}>
          <Segmented
            value={e.axis}
            onChange={(axis) => ex.setParams({ axis })}
            options={[
              { value: 'x', label: 'X' },
              { value: 'y', label: 'Y', title: 'Up' },
              { value: 'z', label: 'Z' },
            ]}
          />
        </Row>
        {e.mode === 'axial' && (
          <Row label="Direction">
            <Segmented
              value={e.direction === 1 ? '+' : '−'}
              onChange={(v) => ex.setParams({ direction: v === '+' ? 1 : -1 })}
              options={[
                { value: '+', label: '+', title: 'Higher parts move further in the positive direction' },
                { value: '−', label: '−', title: 'Reverse' },
              ]}
            />
          </Row>
        )}
        <Row label="Spacing" title="Gap added per level (axial) or per part (radial), as a share of the model size">
          <Slider value={e.spacing * 100} min={0} max={100} step={1} precision={0} unit="%" onChange={(v) => ex.setParams({ spacing: v / 100 })} />
        </Row>
        <Row label="Scale" title="Spread distances in proportion: 1 = off, 2 = every distance doubled">
          <Slider value={e.scale} min={1} max={4} step={0.05} onChange={(v) => ex.setParams({ scale: v })} />
        </Row>
        <p className="hint">
          {liveParts.length
            ? `These settings re-arrange the ${liveParts.length} parts of the last auto-explode live, replacing hand moves on them.`
            : 'Settings apply the next time you explode.'}
        </p>
        <div className="btn-row">
          <button className="btn" disabled={!moved} onClick={() => ex.reset(false)} title="Return the selection (or everything, with nothing selected) to the assembled position">
            Reset {sel.length ? 'selected' : 'all'}
          </button>
          {sel.length > 0 && (
            <button className="btn" disabled={!moved} onClick={() => ex.reset(true)}>
              Reset all
            </button>
          )}
        </div>
      </Section>

      <Section title="Move parts">
        <Row label="Move tool" title="Show the move gizmo on the selection (W)">
          <Toggle value={ui.tool === 'move'} onChange={(v) => ex.setTool(v ? 'move' : 'select')} />
        </Row>
        {sel.length === 1 && <OffsetFields id={sel[0]} />}
        <p className="hint">Drag an arrow to move along X, Y or Z, or the square to move in the view plane. Shift moves finely. Each drag is one undo step.</p>
      </Section>

      <Section title="Connectors">
        <Row label="Show">
          <Toggle value={e.connectors} onChange={(v) => ex.set('connectors', v)} />
        </Row>
        {e.connectors && (
          <>
            <Row label="Colour">
              <ColorField value={e.connectorColor} onChange={(v) => ex.set('connectorColor', v)} />
            </Row>
            <Row label="Weight">
              <Slider value={e.connectorWidth} min={0.1} max={4} step={0.05} unit="px" onChange={(v) => ex.set('connectorWidth', v)} />
            </Row>
            <Row label="Pattern">
              <Segmented<LineStyle>
                value={e.connectorStyle}
                onChange={(v) => ex.set('connectorStyle', v)}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'dashed', label: 'Dashed' },
                  { value: 'dotted', label: 'Dotted' },
                ]}
              />
            </Row>
            <Row label="Hidden by parts" title="Off: connectors draw over everything">
              <Toggle value={e.connectorOccluded} onChange={(v) => ex.set('connectorOccluded', v)} />
            </Row>
            {sel.length === 1 && <AnchorList id={sel[0]} />}
            {sel.length !== 1 && <p className="hint">Each moved part gets a connector from its assembled position. Select one part to edit its anchors; with the move tool on, drag the dots in the viewport.</p>}
          </>
        )}
      </Section>

      <States />
    </>
  );
}

function OffsetFields({ id }: { id: string }) {
  const doc = useStore((s) => s.doc);
  const o = doc.explode.offsets[id] ?? [0, 0, 0];
  const step = doc.camera.height / 200;
  return (
    <>
      {(['X', 'Y', 'Z'] as const).map((a, i) => (
        <Row key={a} label={`Offset ${a}`}>
          <NumberField
            value={o[i]}
            step={step}
            precision={3}
            onChange={(v) => {
              const next = [...o] as Vec3;
              next[i] = v;
              ex.setOffset(id, next);
            }}
          />
        </Row>
      ))}
    </>
  );
}

function AnchorList({ id }: { id: string }) {
  const doc = useStore((s) => s.doc);
  const e = doc.explode;
  const own = e.offsets[id];
  if (isZero(own)) return <p className="hint">{doc.nodes[id].name} hasn’t been moved, so it has no connector.</p>;
  if (assembledBox(doc, id).isEmpty()) return null;
  const auto = !e.anchors[id];
  const list = effectiveAnchors(doc, id);
  if (auto)
    return (
      <div className="anchor-list">
        <p className="hint">
          Automatic: {list.length === 1 ? 'one connector through the centre of' : `one connector through each of the ${list.length} pieces of`} {doc.nodes[id].name}. Drag a dot in the viewport, or customise, to edit them.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => ex.customiseAnchors(id)}>
            Customise
          </button>
          <button className="btn" onClick={() => ex.addAnchor(id)}>
            Add connector
          </button>
        </div>
      </div>
    );
  return (
    <div className="anchor-list">
      <div className="sub-label">Anchors on {doc.nodes[id].name} · share of its box (0 – 1)</div>
      {list.map((u, i) => (
        <div key={i} className="anchor-row">
          {(['x', 'y', 'z'] as const).map((a, k) => (
            <NumberField
              key={a}
              value={u[k]}
              step={0.01}
              min={0}
              max={1}
              precision={2}
              onChange={(v) => {
                const next = [...u] as Vec3;
                next[k] = v;
                ex.setAnchor(id, i, next);
              }}
            />
          ))}
          <button className="icon-btn" title="Remove this connector" onClick={() => ex.removeAnchor(id, i)}>
            ×
          </button>
        </div>
      ))}
      {!list.length && <p className="hint">No connectors on this part.</p>}
      <div className="btn-row">
        <button className="btn" onClick={() => ex.addAnchor(id)}>
          Add connector
        </button>
        {e.anchors[id] && (
          <button className="btn" onClick={() => ex.resetAnchors(id)} title="Back to automatic connectors, one through each piece">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function States() {
  const states = useStore((s) => s.doc.explode.states);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <Section title="Exploded states">
      {states.map((st) => (
        <div key={st.id} className="state-row">
          {renaming === st.id ? (
            <input
              className="text"
              autoFocus
              defaultValue={st.name}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={(e) => {
                ex.renameState(st.id, e.target.value);
                setRenaming(null);
              }}
            />
          ) : (
            <button className="state-name" title="Restore this arrangement · double-click to rename" onClick={() => ex.applyState(st.id)} onDoubleClick={() => setRenaming(st.id)}>
              {st.name}
              <span>{Object.values(st.offsets).filter((o) => !isZero(o)).length} parts</span>
            </button>
          )}
          <button className="icon-btn" title="Update to the current arrangement" onClick={() => ex.updateState(st.id)}>
            ↻
          </button>
          <button className="icon-btn" title="Delete" onClick={() => ex.deleteState(st.id)}>
            ×
          </button>
        </div>
      ))}
      <div className="btn-row">
        <button className="btn" onClick={() => ex.saveState()} title="Save the current offsets and connector anchors">
          Save current arrangement
        </button>
      </div>
    </Section>
  );
}
