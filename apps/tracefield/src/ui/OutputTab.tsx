import { actions } from '../app/actions';
import { exportPNG } from '../project/exportImage';
import { DPI_OPTIONS, physicalSize, SIZE_PRESETS, validateSize } from '../state/output';
import { useStore } from '../state/store';
import { resolveStyle } from '../state/scene';
import { ColorField, NumberField, Row, Section, Segmented, Toggle } from './controls';

/** Drawing frame size, background, lineweight scale and PNG export. */
export function OutputTab() {
  const o = useStore((s) => s.doc.output);
  const dr = useStore((s) => s.doc.drawing);
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.ui.selection);
  const busy = useStore((s) => s.ui.busy);
  const problem = validateSize(o.width, o.height);
  const mp = (o.width * o.height) / 1e6;
  const scale = o.width / dr.referenceWidth;
  const sample = sel.length && doc.nodes[sel[0]] ? resolveStyle(doc, sel[0]).silhouetteWidth : doc.defaults.silhouetteWidth;
  const presets = (group: 'screen' | 'paper') =>
    SIZE_PRESETS.filter((p) => p.group === group).map((p) => (
      <button key={p.id} className={o.preset === p.id ? 'on' : ''} onClick={() => actions.applySizePreset(p.id)} title={p.group === 'paper' ? `${p.w} × ${p.h} mm` : `${p.w} × ${p.h} px`}>
        {p.label}
      </button>
    ));

  return (
    <>
      <Section title="Drawing frame">
        <div className="sub-label">Screen</div>
        <div className="preset-grid three">{presets('screen')}</div>
        <div className="sub-label">Paper</div>
        <div className="preset-grid">{presets('paper')}</div>
        <Row label="DPI" title="Pixels per inch for paper sizes">
          <Segmented value={String(o.dpi)} onChange={(v) => actions.setDpi(Number(v))} options={DPI_OPTIONS.map((d) => ({ value: String(d), label: String(d) }))} />
        </Row>
        <Row label="Width">
          <NumberField value={o.width} step={10} min={16} precision={0} unit="px" onChange={(v) => actions.setOutputSide('width', v)} />
        </Row>
        <Row label="Height">
          <NumberField value={o.height} step={10} min={16} precision={0} unit="px" onChange={(v) => actions.setOutputSide('height', v)} />
        </Row>
        <Row label="Lock aspect" title="Changing one side scales the other">
          <div className="inline">
            <Toggle value={o.lockAspect} onChange={(v) => actions.setOutput({ lockAspect: v })} />
            <button className="btn small" onClick={actions.swapOrientation} title="Swap portrait / landscape">
              ⤾ Rotate
            </button>
          </div>
        </Row>
        <p className={`hint ${problem ? 'error' : ''}`}>
          {problem ?? `${mp.toFixed(1)} MP · ${physicalSize(o)}`}
        </p>
        <Row label="Dim outside" title="Darken the viewport outside the drawing frame">
          <Toggle value={o.showFrame} onChange={(v) => actions.setOutput({ showFrame: v })} />
        </Row>
        <p className="hint">Drag the frame's edges in the viewport to crop. Pan and zoom compose the drawing inside it.</p>
        <div className="btn-row">
          <button className="btn" onClick={actions.fitAll} title="Fit everything inside the frame (F)">
            Fit to frame
          </button>
        </div>
      </Section>

      <Section title="Background">
        <Row label="Colour">
          <ColorField value={dr.background} onChange={(v) => actions.setDrawing('background', v)} />
        </Row>
        <Row label="Transparent" title="Export with a transparent background (the viewport still shows the colour)">
          <Toggle value={o.transparent} onChange={(v) => actions.setOutput({ transparent: v })} />
        </Row>
        <Row label="Include grid" title="Draw the ground grid in the export">
          <Toggle value={o.includeGrid} onChange={(v) => actions.setOutput({ includeGrid: v })} />
        </Row>
      </Section>

      <Section title="Lineweight scale">
        <Row label="Reference" title="Lineweights are authored as pixels at this width. Viewport and export both scale from it.">
          <NumberField value={dr.referenceWidth} step={10} min={200} max={40000} precision={0} unit="px" onChange={(v) => actions.setDrawing('referenceWidth', Math.round(v))} />
        </Row>
        <p className="hint">
          Lines ×{scale.toFixed(2)} in this export — a {sample} px silhouette prints {(sample * scale).toFixed(1)} px wide
          {o.dpi ? ` (${((sample * scale) / o.dpi * 25.4).toFixed(2)} mm at ${o.dpi} dpi)` : ''}.
        </p>
        <div className="btn-row">
          <button className="btn" disabled={dr.referenceWidth === o.width} onClick={actions.matchReferenceToOutput} title="Set the reference to the export width so weights are exact pixels">
            Use export width
          </button>
        </div>
      </Section>

      <Section title="Export">
        <Row label="File name">
          <input
            className="text"
            placeholder={doc.name}
            value={o.fileName}
            onChange={(e) => actions.setOutput({ fileName: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </Row>
        <Row label="Antialiasing">
          <Segmented
            value={String(o.antialias)}
            onChange={(v) => actions.setOutput({ antialias: Number(v) as 0 | 4 | 8 })}
            options={[
              { value: '0', label: 'Off' },
              { value: '4', label: '4×' },
              { value: '8', label: '8×' },
            ]}
          />
        </Row>
        <button className="btn primary wide big" disabled={!!problem || !!busy || !doc.roots.length} onClick={exportPNG} title="Export PNG (Ctrl+E)">
          Export PNG · {o.width} × {o.height}
        </button>
      </Section>
    </>
  );
}
