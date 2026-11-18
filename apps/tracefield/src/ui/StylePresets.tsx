import { useState } from 'react';
import { actions } from '../app/actions';
import { DEFAULT_EFFECTS, type Effects } from '../state/effects';
import { BUILT_IN_PRESETS, captureStyle, loadUserPresets, presetStyle, saveUserPresets, sameEffects, type StylePreset } from '../state/stylePresets';
import { store, uid, useStore } from '../state/store';
import type { DrawingSettings, GraphicStyle } from '../state/types';
import { Toggle } from './controls';

/** Built-in and saved drawing looks. Saved presets live in this browser and are shared by every project. */
export function StylePresets() {
  const [user, setUser] = useState<StylePreset[]>(loadUserPresets);
  const [clear, setClear] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const overrides = useStore((s) => Object.values(s.doc.nodes).filter((n) => Object.keys(n.style).length).length);
  const active = useStore((s) => activePreset(s.doc.defaults, s.doc.drawing, s.doc.effects, [...BUILT_IN_PRESETS, ...user]));

  const update = (list: StylePreset[]) => {
    try {
      saveUserPresets(list);
      setUser(list);
    } catch {
      store.status('Could not save presets: browser storage is full or blocked', 'error');
    }
  };
  const save = (name: string) => {
    const { doc } = store.get();
    const p: StylePreset = { id: uid(), name: name.trim() || 'My style', hint: 'Saved preset', builtIn: false, ...captureStyle(doc.defaults, doc.drawing, doc.effects) };
    update([...user, p]);
    setNaming(null);
    store.status(`Saved style “${p.name}”${p.effects ? ' with its image effect' : ''}`);
  };

  const card = (p: StylePreset) => (
    <div key={p.id} className={`style-preset ${active === p.id ? 'on' : ''}`}>
      <button className="sp-apply" title={p.effects ? `${p.hint} · turns image effects on` : p.hint} onClick={() => actions.applyStylePreset(p, clear)}>
        <Swatch p={p} />
        <span>{p.name}</span>
      </button>
      {!p.builtIn && (
        <button
          className="sp-del"
          title={`Delete “${p.name}”`}
          onClick={() => {
            if (confirm(`Delete the style “${p.name}”?`)) update(user.filter((u) => u.id !== p.id));
          }}
        >
          ×
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="sub-label">Drawing</div>
      <div className="style-presets">{BUILT_IN_PRESETS.filter((p) => !p.effects).map(card)}</div>
      <div className="sub-label">Graphic · with image effects</div>
      <div className="style-presets">{BUILT_IN_PRESETS.filter((p) => p.effects).map(card)}</div>
      {user.length > 0 && (
        <>
          <div className="sub-label">Saved in this browser</div>
          <div className="style-presets">{user.map(card)}</div>
        </>
      )}
      {naming === null ? (
        <div className="btn-row">
          <button className="btn" onClick={() => setNaming('')} title="Save the current defaults, shadows, ground, background and (if on) the whole-drawing image effect as a preset in this browser">
            Save current as style…
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <input
            className="text"
            autoFocus
            placeholder="Style name"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') save(naming);
              if (e.key === 'Escape') setNaming(null);
            }}
          />
          <button className="btn" onClick={() => save(naming)}>
            Save
          </button>
        </div>
      )}
      <div className="row" title="Applying a style normally keeps the overrides set on individual objects">
        <label>
          <span>Clear object overrides</span>
        </label>
        <div className="row-ctl">
          <Toggle value={clear} onChange={setClear} />
        </div>
      </div>
      <p className="hint">
        A style sets the object defaults, shadows, ground, hidden lines and background. Graphic styles also set the whole-drawing image effect (fine-tune it in the Image effects section); layer looks are kept. Grid, sun direction and lineweight reference stay as they are.
        {overrides > 0 && !clear && ` ${overrides} object${overrides > 1 ? 's have' : ' has'} own overrides, which will be kept.`}
      </p>
    </>
  );
}

/** A tiny preview chip: background, face fill and line colour, then the effect's colours and pattern if it has one. */
function Swatch({ p }: { p: StylePreset }) {
  const { defaults: d, drawing: dr, effects: e } = presetStyle(p);
  const fill = d.fillMode === 'none' ? 'transparent' : d.fillMode === 'white' ? '#ffffff' : d.fillMode === 'clay' ? '#e2dcd0' : d.fillMode === 'color' ? d.fillColor : '#c9c3b6';
  const id = `sp-${p.id.replace(/[^a-z0-9-]/gi, '')}`;
  if (e) {
    // Graphic: show the effect's own palette and a hint of its pattern.
    const paper = e.paperFromBackground ? dr.background : e.paper;
    const pal = [e.pal1, e.pal2, e.pal3, e.pal4, e.pal5].slice(0, Math.max(2, Math.round(e.palCount)));
    const [bg, mid, fg] =
      e.colorMode === 'gradient'
        ? [e.gradHighlight, e.gradMid, e.gradShadow]
        : e.colorMode === 'mono'
          ? [paper, e.ink, e.ink]
          : e.colorMode === 'palette'
            ? [pal[pal.length - 1], pal[Math.min(2, pal.length - 1)], pal[0]]
            : e.colorMode === 'spot'
              ? [e.effect === 'threshold' ? paper : '#e6e6e6', e.spotColor, e.effect === 'threshold' ? e.ink : '#333336']
              : [dr.background, '#8a8d94', d.lineColor];
    const pattern =
      e.effect === 'halftone' || e.effect === 'dither' ? (
        <pattern id={id} width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="1.2" cy="1.2" r="0.75" fill={mid} />
        </pattern>
      ) : e.effect === 'wave' || e.effect === 'crosshatch' || e.effect === 'ascii' ? (
        <pattern id={id} width="2" height="2" patternUnits="userSpaceOnUse" patternTransform={e.effect === 'crosshatch' ? 'rotate(45)' : undefined}>
          <rect width="2" height="0.7" fill={mid} />
        </pattern>
      ) : null;
    return (
      <svg className="sp-swatch" viewBox="0 0 28 20" aria-hidden>
        {pattern && <defs>{pattern}</defs>}
        <rect width="28" height="20" fill={bg} />
        <path d="M6 15 L6 7 L11 4 L16 7 L16 15 Z" fill={pattern ? `url(#${id})` : mid} stroke={fg} strokeWidth="0.8" strokeLinejoin="round" />
        <path d="M16 15 L16 7 L21 9.5 L21 15 Z" fill={fg} opacity={pattern ? 0.85 : 1} />
        {e.effect === 'shatter' && <path d="M2 18 L12 2 L14 3 L5 19 Z M18 19 L26 6 L27 8 L21 19 Z" fill={bg} opacity="0.55" />}
        {e.hud > 0 && <path d="M1.5 5V1.5H5 M23 1.5H26.5V5 M26.5 15V18.5H23 M5 18.5H1.5V15" fill="none" stroke={e.hudColor} strokeWidth="0.9" />}
        {e.echo > 0 && <path d="M8 15 L8 7 L13 4 L18 7 L18 15" fill="none" stroke={fg} strokeWidth="0.5" opacity="0.45" />}
        {e.colorMode === 'palette' && pal.map((c, i) => <rect key={i} x={1 + i * 3.2} y="17" width="3.2" height="2" fill={c} />)}
        {(e.glitch > 0 || e.glitchBlocks > 0) && (
          <>
            <rect x="2" y="9" width="11" height="1.6" fill={e.glitchColor} />
            <rect x="15" y="16" width="9" height="1.4" fill={e.glitchColor} />
          </>
        )}
      </svg>
    );
  }
  return (
    <svg className="sp-swatch" viewBox="0 0 28 20" aria-hidden>
      <rect width="28" height="20" fill={dr.background} />
      {dr.ground === 'solid' && <rect y="14" width="28" height="6" fill={dr.groundColor} />}
      {dr.shadows !== 'off' && <path d="M15 15 L24 15 L20 11 L15 11 Z" fill={dr.shadowColor} opacity={dr.shadowOpacity} />}
      <path d="M6 15 L6 7 L11 4 L16 7 L16 15 Z" fill={fill} stroke={d.showLines ? d.lineColor : 'none'} strokeWidth={d.fillMode === 'none' ? 0.9 : 0.8} strokeLinejoin="round" />
      {d.hatch !== 'none' && <path d="M7 14 L15 8 M7 11 L12 7.5 M10 14.5 L15.5 10.5" stroke={d.hatchColor} strokeWidth="0.4" />}
    </svg>
  );
}

/** The preset whose defaults, drawing settings and whole-drawing effect all match the document. */
function activePreset(defaults: GraphicStyle, drawing: DrawingSettings, effects: Effects, list: StylePreset[]): string | null {
  const plainFx = !effects.enabled || sameEffects(effects.drawing, DEFAULT_EFFECTS);
  for (const p of list) {
    const { defaults: pd, drawing: pdr, effects: pe } = presetStyle(p);
    if (!shallowSame(pd, defaults) || !Object.entries(pdr).every(([k, v]) => (drawing as any)[k] === v)) continue;
    if (pe ? effects.enabled && sameEffects(pe, effects.drawing) : plainFx) return p.id;
  }
  return null;
}

function shallowSame(a: object, b: object) {
  return Object.entries(a).every(([k, v]) => (b as any)[k] === v);
}
