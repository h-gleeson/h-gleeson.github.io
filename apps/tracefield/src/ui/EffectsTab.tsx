import { useState } from 'react';
import { actions } from '../app/actions';
import { ancestors, resolveStyle } from '../state/scene';
import { effectsActions as fx, lookSettings, type LookRef } from '../app/effectsActions';
import { CHAR_SETS, EFFECT_PRESETS, EFFECTS, NO_LOOK, presetEffects, type EffectLook, type EffectsSettings } from '../state/effects';
import { useStore } from '../state/store';
import { ColorField, Row, Section, Segmented, Slider, Toggle } from './controls';

type NumKey = { [K in keyof EffectsSettings]: EffectsSettings[K] extends number ? K : never }[keyof EffectsSettings];
type BoolKey = { [K in keyof EffectsSettings]: EffectsSettings[K] extends boolean ? K : never }[keyof EffectsSettings];

/** Image effects: a stylized post-process over the finished drawing, as one look for the whole drawing plus layer looks. */
export function EffectsTab() {
  const effects = useStore((s) => s.doc.effects);
  const bg = useStore((s) => s.doc.drawing.background);
  const [picked, setPicked] = useState<LookRef>('drawing');
  // Fall back to the whole-drawing look if the picked look was deleted (or undone away).
  const ref: LookRef = picked !== 'drawing' && !effects.looks.some((l) => l.id === picked) ? 'drawing' : picked;
  const e = lookSettings(effects, ref)!;
  const look = ref === 'drawing' ? null : effects.looks.find((l) => l.id === ref)!;
  const set = <K extends keyof EffectsSettings>(key: K, value: EffectsSettings[K]) => fx.set(ref, key, value);
  const num = (key: NumKey, label: string, min: number, max: number, step: number, unit?: string, title?: string) => (
    <Row label={label} title={title}>
      <Slider value={e[key]} min={min} max={max} step={step} precision={step < 1 ? (step < 0.1 ? 2 : 1) : 0} unit={unit} onChange={(v) => set(key, v)} />
    </Row>
  );
  const bool = (key: BoolKey, label: string, title?: string) => (
    <Row label={label} title={title}>
      <Toggle value={e[key]} onChange={(v) => set(key, v)} />
    </Row>
  );
  const active = EFFECT_PRESETS.find((p) => sameLook(presetEffects(p), e))?.id;

  return (
    <>
      <Section title="Image effects" right={<Toggle value={effects.enabled} onChange={fx.toggle} title="Effects on / off (Shift+X)" />}>
        <p className="hint">Stylize the finished drawing: one look for the whole drawing, plus layer looks that replace it on chosen layers. Sizes are px at the reference width, like lineweights, so the PNG export matches the viewport.</p>
        <LookList current={ref} onPick={setPicked} />
      </Section>

      {look && <LayerLookPanel look={look} onGone={() => setPicked('drawing')} />}

      <Section title={look ? `Starting point · ${look.name}` : 'Starting point · Whole drawing'}>
        <div className="preset-grid">
          {EFFECT_PRESETS.map((p) => (
            <button key={p.id} className={active === p.id ? 'on' : ''} title={p.hint} onClick={() => fx.applyPreset(ref, p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn small" onClick={() => fx.reset(ref)} title="This look back to no effect and neutral settings">
            Reset look
          </button>
        </div>
      </Section>

      <Section title="Effect">
        <div className="preset-grid">
          {EFFECTS.map((x) => (
            <button key={x.id} className={e.effect === x.id ? 'on' : ''} title={x.hint} onClick={() => set('effect', x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="fx-params">
          {e.effect === 'dither' && (
            <>
              <Row label="Pattern">
                <Segmented value={e.ditherPattern} onChange={(v) => set('ditherPattern', v)} options={[{ value: 'none', label: 'None', title: 'Plain posterize' }, { value: 'bayer2', label: '2×2' }, { value: 'bayer4', label: '4×4' }, { value: 'bayer8', label: '8×8' }, { value: 'noise', label: 'Noise' }]} />
              </Row>
              {num('ditherLevels', 'Levels', 2, 16, 1, undefined, 'Tones per channel (2 = 1-bit)')}
              {num('ditherScale', 'Pixel size', 0.5, 12, 0.5, 'px')}
            </>
          )}
          {e.effect === 'halftone' && (
            <>
              <Row label="Shape">
                <Segmented value={e.dotShape} onChange={(v) => set('dotShape', v)} options={[{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }, { value: 'line', label: 'Line' }]} />
              </Row>
              <Row label="Grid">
                <Segmented value={e.dotGrid} onChange={(v) => set('dotGrid', v)} options={[{ value: 'square', label: 'Square' }, { value: 'hex', label: 'Hex' }]} />
              </Row>
              {num('dotSpacing', 'Spacing', 2, 40, 0.5, 'px')}
              {num('dotAngle', 'Angle', -90, 90, 1, '°')}
              {num('dotScale', 'Dot size', 0.2, 2, 0.05)}
            </>
          )}
          {e.effect === 'ascii' && (
            <>
              <Row label="Characters">
                <Segmented value={e.charSet} onChange={(v) => set('charSet', v)} options={[{ value: 'standard', label: 'Standard' }, { value: 'dense', label: 'Dense' }, { value: 'blocks', label: 'Blocks' }, { value: 'binary', label: '01' }, { value: 'custom', label: 'Custom' }]} />
              </Row>
              {e.charSet === 'custom' && (
                <Row label="Light → dark" title="Characters from the lightest tone to the darkest. Start with a space for blank paper.">
                  <input
                    className="text mono"
                    value={e.charCustom}
                    onKeyDown={(ev) => ev.stopPropagation()}
                    onChange={(ev) => set('charCustom', ev.target.value)}
                    placeholder={CHAR_SETS.standard}
                  />
                </Row>
              )}
              {num('charSize', 'Cell size', 3, 40, 0.5, 'px')}
            </>
          )}
          {e.effect === 'crosshatch' && (
            <>
              {num('hatchSpacing', 'Spacing', 1.5, 24, 0.5, 'px')}
              {num('hatchLayers', 'Layers', 1, 4, 1, undefined, 'Each layer adds a direction in darker tones')}
              {num('hatchAngle', 'Angle', -90, 90, 1, '°')}
              {num('hatchWidth', 'Line width', 0.1, 4, 0.05, 'px')}
              {num('hatchJitter', 'Hand-drawn', 0, 1, 0.05, undefined, 'Shift and wobble each line a little')}
            </>
          )}
          {e.effect === 'contour' && (
            <>
              {num('contourLevels', 'Levels', 2, 32, 1)}
              {num('contourWidth', 'Line width', 0.2, 4, 0.05, 'px')}
              {bool('contourFill', 'Filled bands', 'Fill between the lines with flat tones')}
            </>
          )}
          {e.effect === 'edges' && (
            <>
              {num('edgeThreshold', 'Threshold', 0, 1, 0.01, undefined, 'Lower finds fainter edges')}
              {num('edgeWidth', 'Line width', 0.25, 6, 0.05, 'px')}
              {bool('edgeOverlay', 'Over the image', 'Draw the edges over the drawing instead of on paper')}
            </>
          )}
          {e.effect === 'pixelate' && (
            <>
              {num('pixelSize', 'Block size', 1, 64, 0.5, 'px')}
              {num('pixelGap', 'Grid line', 0, 8, 0.1, 'px')}
            </>
          )}
          {e.effect === 'wave' && (
            <>
              {num('waveSpacing', 'Spacing', 2, 30, 0.5, 'px')}
              {num('waveAmplitude', 'Amplitude', 0, 20, 0.25, 'px')}
              {num('waveFrequency', 'Frequency', 0, 10, 0.1, undefined, 'Waves per 100 px')}
              {num('waveWidth', 'Thickness', 0.1, 1, 0.01, undefined, 'Line thickness in the darkest tones, as a share of the spacing')}
              {bool('waveVertical', 'Vertical')}
            </>
          )}
          {e.effect === 'voronoi' && (
            <>
              {num('cellSize', 'Cell size', 4, 120, 1, 'px')}
              {num('cellEdge', 'Outline', 0, 6, 0.1, 'px')}
              {num('cellJitter', 'Irregularity', 0, 1, 0.01)}
            </>
          )}
        </div>
      </Section>

      <Section title="Colour">
        <Row label="Mode">
          <Segmented value={e.colorMode} onChange={(v) => set('colorMode', v)} options={[{ value: 'original', label: 'Original', title: 'The drawing’s own colours' }, { value: 'mono', label: 'Mono', title: 'Ink on paper' }]} />
        </Row>
        <Row label="Ink" title="Mono ink, and the colour of Voronoi outlines and edge overlays">
          <ColorField value={e.ink} onChange={(v) => set('ink', v)} />
        </Row>
        <Row label="Paper is bg" title="Use the drawing background as the paper">
          <Toggle value={e.paperFromBackground} onChange={(v) => set('paperFromBackground', v)} />
        </Row>
        {!e.paperFromBackground && (
          <Row label="Paper">
            <ColorField value={e.paper} onChange={(v) => set('paper', v)} />
          </Row>
        )}
        {e.paperFromBackground && <p className="hint">Paper follows the background ({bg}).</p>}
        {num('mix', 'Effect amount', 0, 1, 0.01, undefined, 'Blend between the plain drawing and the effect')}
      </Section>

      <Section title="Adjust" defaultOpen={false}>
        {num('brightness', 'Brightness', -1, 1, 0.01)}
        {num('contrast', 'Contrast', -1, 1, 0.01)}
        {num('saturation', 'Saturation', -1, 1, 0.01)}
        {num('hue', 'Hue', -180, 180, 1, '°')}
        {num('gamma', 'Gamma', 0.2, 3, 0.01)}
        {num('blur', 'Soften', 0, 12, 0.25, 'px', 'Blur the drawing before the effect: smoother tones, fewer tiny details')}
        {bool('invert', 'Invert')}
      </Section>

      <Section title="Finish" defaultOpen={false}>
        {num('grain', 'Grain', 0, 1, 0.01)}
        {e.grain > 0 && num('grainSize', 'Grain size', 0.3, 6, 0.1, 'px')}
        {num('bloom', 'Bloom', 0, 2, 0.01, undefined, 'Glow around bright areas')}
        {e.bloom > 0 && num('bloomThreshold', 'Bloom from', 0, 1, 0.01, undefined, 'Only tones brighter than this glow')}
        {e.bloom > 0 && num('bloomRadius', 'Bloom radius', 1, 60, 0.5, 'px')}
        {num('chromatic', 'Aberration', 0, 12, 0.1, 'px', 'Colour fringes that grow towards the frame edges')}
        {num('scanlines', 'Scanlines', 0, 1, 0.01)}
        {e.scanlines > 0 && num('scanlineSpacing', 'Line spacing', 1, 12, 0.25, 'px')}
        {num('vignette', 'Vignette', 0, 1, 0.01)}
      </Section>
    </>
  );
}

/** The whole-drawing look and the layer looks; picking one edits it below. */
function LookList(p: { current: LookRef; onPick: (r: LookRef) => void }) {
  const doc = useStore((s) => s.doc);
  const looks = doc.effects.looks;
  const users = (id: string) => Object.values(doc.nodes).filter((n) => resolveStyle(doc, n.id).fxLook === id && n.geom).length;
  return (
    <div className="fx-looks" role="listbox" aria-label="Looks">
      <button className={`fx-look ${p.current === 'drawing' ? 'on' : ''}`} role="option" aria-selected={p.current === 'drawing'} onClick={() => p.onPick('drawing')}>
        <span className="fx-look-name">Whole drawing</span>
        <span className="fx-look-meta">{EFFECTS.find((x) => x.id === doc.effects.drawing.effect)?.label}</span>
      </button>
      {looks.map((l) => {
        const n = users(l.id);
        return (
          <button key={l.id} className={`fx-look ${p.current === l.id ? 'on' : ''}`} role="option" aria-selected={p.current === l.id} onClick={() => p.onPick(l.id)}>
            <span className="fx-look-name">{l.name}</span>
            <span className="fx-look-meta">
              {EFFECTS.find((x) => x.id === l.effect)?.label} · {n ? `${n} object${n > 1 ? 's' : ''}` : 'no layers'}
            </span>
          </button>
        );
      })}
      <button className="btn small fx-new" onClick={() => p.onPick(fx.newLook())} title="A new look for chosen layers; the selected layers get it straight away">
        + New layer look
      </button>
    </div>
  );
}

/** A layer look: its name, its layers, and housekeeping. */
function LayerLookPanel({ look, onGone }: { look: EffectLook; onGone: () => void }) {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.ui.selection).filter((id) => doc.nodes[id]);
  const i = doc.effects.looks.findIndex((l) => l.id === look.id);
  // Topmost nodes that set this look themselves (their contents follow).
  const chosen = Object.values(doc.nodes).filter((n) => n.style.fxLook === look.id && !ancestors(doc, n.id).some((a) => doc.nodes[a]?.style.fxLook === look.id));
  const selHas = sel.filter((id) => resolveStyle(doc, id).fxLook === look.id).length;
  return (
    <Section title={`Layers · ${look.name}`}>
      <Row label="Name">
        <input
          className="text"
          key={look.id}
          defaultValue={look.name}
          onKeyDown={(ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
          }}
          onBlur={(ev) => fx.renameLook(look.id, ev.target.value)}
        />
      </Row>
      {doc.defaults.fxLook === look.id && <p className="hint">Every object uses this look by default (Style tab with nothing selected).</p>}
      {chosen.length ? (
        <ul className="fx-layer-list">
          {chosen.map((n) => (
            <li key={n.id}>
              <button className="fx-layer-name" title="Select" onClick={() => actions.select([n.id])}>
                {n.kind === 'group' ? '▸ ' : ''}
                {n.name}
              </button>
              <button className="fx-layer-x" title="Back to the whole-drawing look" onClick={() => fx.assign([n.id], NO_LOOK)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        doc.defaults.fxLook !== look.id && <p className="hint">No layers yet. Select layers or objects (in the tree or the viewport) and add them.</p>
      )}
      <div className="btn-row">
        <button className="btn small" disabled={!sel.length} onClick={() => fx.assign(sel, look.id)}>
          Add selection{sel.length ? ` (${sel.length})` : ''}
        </button>
        <button className="btn small" disabled={!selHas} onClick={() => fx.assign(sel, NO_LOOK)}>
          Remove selection
        </button>
      </div>
      <div className="btn-row">
        <button className="btn small" disabled={i <= 0} onClick={() => fx.moveLook(look.id, -1)} title="Move up the list">
          ↑
        </button>
        <button className="btn small" disabled={i >= doc.effects.looks.length - 1} onClick={() => fx.moveLook(look.id, 1)} title="Move down the list">
          ↓
        </button>
        <button className="btn small" onClick={() => fx.duplicateLook(look.id)}>
          Duplicate
        </button>
        <button
          className="btn small danger"
          onClick={() => {
            fx.deleteLook(look.id);
            onGone();
          }}
          title="Delete this look; its layers go back to the whole-drawing look"
        >
          Delete
        </button>
      </div>
    </Section>
  );
}

/** A preset counts as active while every value it sets still matches. */
function sameLook(a: EffectsSettings, b: EffectsSettings) {
  return (Object.keys(a) as (keyof EffectsSettings)[]).every((k) => a[k] === b[k]);
}
