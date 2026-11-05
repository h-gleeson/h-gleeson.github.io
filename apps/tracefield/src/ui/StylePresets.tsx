import { useState } from 'react';
import { actions } from '../app/actions';
import { BUILT_IN_PRESETS, captureStyle, loadUserPresets, presetStyle, saveUserPresets, type StylePreset } from '../state/stylePresets';
import { store, uid, useStore } from '../state/store';
import { Toggle } from './controls';

/** Built-in and saved drawing looks. Saved presets live in this browser and are shared by every project. */
export function StylePresets() {
  const [user, setUser] = useState<StylePreset[]>(loadUserPresets);
  const [clear, setClear] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const overrides = useStore((s) => Object.values(s.doc.nodes).filter((n) => Object.keys(n.style).length).length);
  const active = useStore((s) => activePreset(s.doc.defaults, s.doc.drawing, [...BUILT_IN_PRESETS, ...user]));

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
    const p: StylePreset = { id: uid(), name: name.trim() || 'My style', hint: 'Saved preset', builtIn: false, ...captureStyle(doc.defaults, doc.drawing) };
    update([...user, p]);
    setNaming(null);
    store.status(`Saved style “${p.name}”`);
  };

  return (
    <>
      <div className="style-presets">
        {[...BUILT_IN_PRESETS, ...user].map((p) => (
          <div key={p.id} className={`style-preset ${active === p.id ? 'on' : ''}`}>
            <button className="sp-apply" title={p.hint} onClick={() => actions.applyStylePreset(p, clear)}>
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
        ))}
      </div>
      {naming === null ? (
        <div className="btn-row">
          <button className="btn" onClick={() => setNaming('')} title="Save the current defaults, shadows, ground and background as a preset in this browser">
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
        A style sets the object defaults, shadows, ground, hidden lines and background. Grid, sun direction and lineweight reference stay as they are.
        {overrides > 0 && !clear && ` ${overrides} object${overrides > 1 ? 's have' : ' has'} own overrides, which will be kept.`}
      </p>
    </>
  );
}

/** A tiny preview chip: background, face fill and line colour. */
function Swatch({ p }: { p: StylePreset }) {
  const { defaults: d, drawing: dr } = presetStyle(p);
  const fill = d.fillMode === 'none' ? 'transparent' : d.fillMode === 'white' ? '#ffffff' : d.fillMode === 'clay' ? '#e2dcd0' : d.fillMode === 'color' ? d.fillColor : '#c9c3b6';
  return (
    <svg className="sp-swatch" viewBox="0 0 28 20" aria-hidden>
      <rect width="28" height="20" fill={dr.background} />
      {dr.ground === 'solid' && <rect y="14" width="28" height="6" fill={dr.groundColor} />}
      {dr.shadows !== 'off' && <path d="M15 15 L24 15 L20 11 L15 11 Z" fill={dr.shadowColor} opacity={dr.shadowOpacity} />}
      <path d="M6 15 L6 7 L11 4 L16 7 L16 15 Z" fill={fill} stroke={d.lineColor} strokeWidth={d.fillMode === 'none' ? 0.9 : 0.8} strokeLinejoin="round" />
      {d.hatch !== 'none' && <path d="M7 14 L15 8 M7 11 L12 7.5 M10 14.5 L15.5 10.5" stroke={d.hatchColor} strokeWidth="0.4" />}
    </svg>
  );
}

function activePreset(defaults: object, drawing: object, list: StylePreset[]): string | null {
  for (const p of list) {
    const { defaults: pd, drawing: pdr } = presetStyle(p);
    if (shallowSame(pd, defaults) && Object.entries(pdr).every(([k, v]) => (drawing as any)[k] === v)) return p.id;
  }
  return null;
}

function shallowSame(a: object, b: object) {
  return Object.entries(a).every(([k, v]) => (b as any)[k] === v);
}
