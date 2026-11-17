import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { onTextPending, pendingText, textActions, textTarget, type TextTarget } from '../app/textActions';
import { FONT_EXTENSIONS, SYSTEM_FONTS, type TextAlign, type TextSpec } from '../import/text';
import { resolveStyle } from '../state/scene';
import { useStore } from '../state/store';
import { ColorField, Row, Section, Segmented, Slider, Toggle } from './controls';

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

/** Text editing for a selected text object (or a group holding one). */
export function TextPanel({ nodeId }: { nodeId: string }) {
  const doc = useStore((s) => s.doc);
  const t = textTarget(doc, nodeId);
  if (!t) return null;
  return <TextEditor key={t.mesh.id} target={t} />;
}

function TextEditor({ target }: { target: TextTarget }) {
  const doc = useStore((s) => s.doc);
  const [draft, setDraftState] = useState<TextSpec>(target.spec);
  const draftRef = useRef(draft);
  const timer = useRef(0);
  const edits = useRef(0);
  const dirty = useRef(false);
  const fontRef = useRef<HTMLInputElement>(null);
  const busy = useSyncExternalStore(onTextPending, () => pendingText) > 0;
  const [google, setGoogle] = useState(target.spec.fontSource === 'google' ? target.spec.family : '');

  const setDraft = (s: TextSpec) => {
    draftRef.current = s;
    setDraftState(s);
  };
  // Follow the document (undo / redo, edits elsewhere) unless an edit of ours is on its way.
  useEffect(() => {
    if (!dirty.current) setDraft(target.spec);
  }, [target.spec]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (patch: Partial<TextSpec>, delay = 160) => {
    const next = { ...draftRef.current, ...patch };
    setDraft(next);
    dirty.current = true;
    const n = ++edits.current;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await textActions.update(target.mesh.id, next);
      if (edits.current === n) dirty.current = false;
    }, delay);
  };

  const fill = resolveStyle(doc, target.mesh.id).fillMode;
  const fontValue = draft.fontSource === 'system' ? `sys:${draft.family}` : draft.fontSource;
  const knownStack = SYSTEM_FONTS.some((f) => f.stack === draft.family);
  const fileName = draft.fontSource === 'file' ? draft.family : target.files.slice(1)[0]?.name;

  return (
    <Section title="Text" right={busy ? <span className="text-busy">tracing…</span> : undefined}>
      <textarea
        className="text-area"
        value={draft.text}
        spellCheck={false}
        rows={Math.min(6, Math.max(2, draft.text.split('\n').length))}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => change({ text: e.target.value }, 250)}
        placeholder="Type the words"
      />
      {!draft.text.trim() && <p className="hint error">Text needs at least one letter; the drawing keeps the last words until then.</p>}
      <Row label="Font" stacked>
        <select
          className="select"
          value={fontValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith('sys:')) change({ fontSource: 'system', family: v.slice(4) }, 0);
            else if (v === 'google') {
              const fam = google || 'Archivo Black';
              setGoogle(fam);
              change({ fontSource: 'google', family: fam }, 0);
            } else if (v === 'file' && fileName) change({ fontSource: 'file', family: fileName }, 0);
            else if (v === 'upload') fontRef.current?.click();
          }}
        >
          <optgroup label="On this computer">
            {!knownStack && draft.fontSource === 'system' && <option value={`sys:${draft.family}`}>{draft.family}</option>}
            {SYSTEM_FONTS.map((f) => (
              <option key={f.stack} value={`sys:${f.stack}`}>
                {f.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="More">
            <option value="google">Google font…</option>
            {fileName && <option value="file">Uploaded: {fileName}</option>}
            <option value="upload">Upload a font file…</option>
          </optgroup>
        </select>
      </Row>
      {draft.fontSource === 'google' && (
        <Row label="Google family" title="The family name exactly as on fonts.google.com, e.g. Archivo Black, Syne, Bodoni Moda, Unbounded. Loaded from Google Fonts when the project opens.">
          <input
            className="text"
            value={google}
            spellCheck={false}
            onChange={(e) => setGoogle(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={() => google.trim() && google.trim() !== draft.family && change({ family: google.trim() }, 0)}
          />
        </Row>
      )}
      <input
        ref={fontRef}
        type="file"
        hidden
        accept={FONT_EXTENSIONS.map((x) => `.${x}`).join(',')}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const font = { name: f.name, data: await f.arrayBuffer() };
          setDraft({ ...draftRef.current, fontSource: 'file', family: f.name });
          dirty.current = true;
          const n = ++edits.current;
          await textActions.update(target.mesh.id, { ...draftRef.current }, font);
          if (edits.current === n) dirty.current = false;
        }}
      />
      {draft.fontSource !== 'file' && (
        <Row label="Weight">
          <select className="select" value={draft.weight} onChange={(e) => change({ weight: Number(e.target.value) }, 0)}>
            {WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w} · {WEIGHT_NAMES[w]}
              </option>
            ))}
          </select>
        </Row>
      )}
      {draft.fontSource !== 'file' && (
        <Row label="Italic">
          <Toggle value={draft.italic} onChange={(v) => change({ italic: v }, 0)} />
        </Row>
      )}
      <Row label="Align">
        <Segmented<TextAlign>
          value={draft.align}
          onChange={(v) => change({ align: v }, 0)}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Centre' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Row>
      <Row label="Tracking" title="Letter spacing, in em (share of the font size)">
        <Slider value={draft.tracking} min={-0.2} max={1} step={0.005} precision={3} unit="em" onChange={(v) => change({ tracking: v })} />
      </Row>
      {draft.text.includes('\n') && (
        <Row label="Line height" title="Distance between lines, in em">
          <Slider value={draft.lineHeight} min={0.5} max={2.5} step={0.01} unit="em" onChange={(v) => change({ lineHeight: v })} />
        </Row>
      )}
      <Row label="Slant" title="Lean the letters, in degrees: positive leans right, like italics">
        <Slider value={draft.slant} min={-45} max={45} step={0.5} precision={1} unit="°" onChange={(v) => change({ slant: v })} />
      </Row>
      <div className="sub-label">Extrusion</div>
      <Row label="Depth" title="How thick the letters are, in em. 0 = flat lettering">
        <Slider value={draft.depth} min={0} max={3} step={0.01} unit="em" onChange={(v) => change({ depth: v })} />
      </Row>
      {draft.depth > 0 && (
        <Row label="Bevel" title="Rounded-off front and back edges, in em">
          <Slider value={draft.bevel} min={0} max={0.06} step={0.001} precision={3} unit="em" onChange={(v) => change({ bevel: v })} />
        </Row>
      )}
      <Row label="Face colour">
        <ColorField value={draft.faceColor} onChange={(v) => change({ faceColor: v }, 0)} />
      </Row>
      {draft.depth > 0 && (
        <Row label="Side colour">
          <ColorField value={draft.sideColor} onChange={(v) => change({ sideColor: v }, 0)} />
        </Row>
      )}
      {fill !== 'material' && <p className="hint">Face and side colours show while the fill is Original (Style tab). Linework, hatches, shadows and effects work as on any object.</p>}
      <p className="hint">Size, position and turn are below; one em is the font size before scaling.</p>
    </Section>
  );
}
