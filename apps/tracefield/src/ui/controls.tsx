import { useEffect, useRef, useState, type ReactNode } from 'react';
import { store } from '../state/store';

export function Section(p: { title: string; right?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(p.defaultOpen ?? true);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <header className="section-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '−' : '+'}</span>
        <span className="section-title">{p.title}</span>
        <span className="section-right" onClick={(e) => e.stopPropagation()}>
          {p.right}
        </span>
      </header>
      {open && <div className="section-body">{p.children}</div>}
    </section>
  );
}

/** A labelled row. `overridden` shows a reset mark; `inherited` names where the value comes from. */
export function Row(p: { label: string; title?: string; overridden?: boolean; inherited?: string; onReset?: () => void; stacked?: boolean; children: ReactNode }) {
  return (
    <div className={`row ${p.stacked ? "stacked" : ""}`} title={p.title}>
      <label className={p.overridden ? 'ovr' : p.inherited ? 'inh' : ''}>
        {p.overridden && (
          <button className="reset-mark" title="Remove this override (use inherited value)" onClick={p.onReset}>
            ●
          </button>
        )}
        {p.inherited && !p.overridden && <span className="inh-mark" title={`Inherited from ${p.inherited}`}>↳</span>}
        <span>{p.label}</span>
      </label>
      <div className="row-ctl">{p.children}</div>
    </div>
  );
}

const fmt = (v: number, precision: number) => (isFinite(v) ? Number(v.toFixed(precision)).toString() : '');

export function NumberField(p: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; precision?: number; unit?: string }) {
  const precision = p.precision ?? 2;
  const step = p.step ?? 0.1;
  const [text, setText] = useState(fmt(p.value, precision));
  const [editing, setEditing] = useState(false);
  const drag = useRef<{ x: number; v: number } | null>(null);
  useEffect(() => {
    if (!editing) setText(fmt(p.value, precision));
  }, [p.value, editing, precision]);
  const clamp = (v: number) => Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
  const commit = (s: string) => {
    const v = Number(s);
    if (isFinite(v) && s.trim() !== '') p.onChange(clamp(v));
    else setText(fmt(p.value, precision));
  };
  return (
    <div className="num">
      <span
        className="num-grip"
        title="Drag to scrub · Shift for fine"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: p.value };
          store.commit();
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = e.shiftKey ? 0.1 : 1;
          p.onChange(Number(clamp(drag.current.v + (e.clientX - drag.current.x) * step * k).toFixed(precision)));
        }}
        onPointerUp={() => {
          drag.current = null;
          store.commit();
        }}
      />
      <input
        value={text}
        inputMode="decimal"
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onBlur={(e) => {
          setEditing(false);
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmt(p.value, precision));
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            p.onChange(Number(clamp(p.value + step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)).toFixed(precision)));
          }
        }}
      />
      {p.unit && <span className="num-unit">{p.unit}</span>}
    </div>
  );
}

export function Slider(p: { value: number; min: number; max: number; step?: number; precision?: number; unit?: string; onChange: (v: number) => void }) {
  const step = p.step ?? (p.max - p.min) / 200;
  return (
    <div className="slider">
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={step}
        value={Math.min(p.max, Math.max(p.min, p.value))}
        onPointerDown={() => store.commit()}
        onChange={(e) => p.onChange(Number(e.target.value))}
      />
      <NumberField value={p.value} onChange={p.onChange} step={step} precision={p.precision ?? 2} unit={p.unit} />
    </div>
  );
}

export function ColorField(p: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(p.value);
  useEffect(() => setText(p.value), [p.value]);
  return (
    <div className="color-field">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(p.value) ? p.value : '#000000'} onChange={(e) => p.onChange(e.target.value)} />
      <input
        className="hex"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        onBlur={() => {
          const v = text.trim().startsWith('#') ? text.trim() : `#${text.trim()}`;
          if (/^#[0-9a-f]{6}$/i.test(v)) p.onChange(v.toLowerCase());
          else if (/^#[0-9a-f]{3}$/i.test(v)) p.onChange(`#${v.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase());
          else setText(p.value);
        }}
      />
    </div>
  );
}

export function Toggle(p: { value: boolean; onChange: (v: boolean) => void; label?: string; title?: string }) {
  return (
    <button className={`toggle ${p.value ? 'on' : ''}`} title={p.title} onClick={() => p.onChange(!p.value)} role="switch" aria-checked={p.value}>
      <span className="toggle-track" />
      {p.label && <span>{p.label}</span>}
    </button>
  );
}

export function Segmented<T extends string>(p: { value: T; onChange: (v: T) => void; options: { value: T; label: string; title?: string }[] }) {
  return (
    <div className="segmented" role="radiogroup">
      {p.options.map((o) => (
        <button key={o.value} title={o.title} className={o.value === p.value ? 'on' : ''} onClick={() => p.onChange(o.value)} role="radio" aria-checked={o.value === p.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const st = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const Icon = {
  eye: (on: boolean) => (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8z" opacity={on ? 1 : 0.35} />
      <circle {...st} cx="8" cy="8" r="1.9" opacity={on ? 1 : 0.35} />
      {!on && <path {...st} d="M3 13 13 3" />}
    </svg>
  ),
  lock: (on: boolean) => (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden opacity={on ? 1 : 0.35}>
      <rect {...st} x="3.5" y="7.2" width="9" height="6.3" rx="1" />
      <path {...st} d={on ? 'M5.5 7.2V5a2.5 2.5 0 0 1 5 0v2.2' : 'M5.5 7.2V5a2.5 2.5 0 0 1 4.9-.7'} />
    </svg>
  ),
  group: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M2 5.5h4l1.2 1.3H14v6.7H2z" />
    </svg>
  ),
  mesh: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M8 2.2 13.3 5v6L8 13.8 2.7 11V5z M8 8l5.3-3 M8 8v5.8 M8 8 2.7 5" />
    </svg>
  ),
  line: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M2 12c3.5-9 6 1 12-8" />
    </svg>
  ),
  model: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M3 4.5 8 2l5 2.5v7L8 14l-5-2.5z M3 4.5 8 7l5-2.5 M8 7v7" />
    </svg>
  ),
  undo: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M5 4 2 7l3 3 M2 7h8a3.5 3.5 0 0 1 0 7H7" />
    </svg>
  ),
  redo: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="m11 4 3 3-3 3 M14 7H6a3.5 3.5 0 0 0 0 7h3" />
    </svg>
  ),
  fit: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4" />
    </svg>
  ),
  target: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <rect {...st} x="5" y="5" width="6" height="6" />
      <path {...st} d="M8 1.5V4 M8 12v2.5 M1.5 8H4 M12 8h2.5" />
    </svg>
  ),
  grid: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M2 5h12 M2 11h12 M5 2v12 M11 2v12" />
    </svg>
  ),
  plus: (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path {...st} d="M8 3v10 M3 8h10" />
    </svg>
  ),
};
