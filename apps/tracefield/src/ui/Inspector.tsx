import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Matrix4, Vector3, Quaternion, Euler, MathUtils } from 'three';
import { actions } from '../app/actions';
import { registry } from '../import/registry';
import { CAMERA_PRESETS } from '../state/defaults';
import { ancestors, resolveStyle, styleSource, worldMatrix } from '../state/scene';
import { store, useStore } from '../state/store';
import { basis } from '../engine/camera';
import type { ProjectDoc } from '../state/types';
import type { FillMode, GraphicStyle, GroundMode, HatchMode, LineOrder, LineStyle, ShadowMode, StyleKey } from '../state/types';
import { ColorField, Icon, NumberField, Row, Section, Segmented, Slider, Toggle } from './controls';
import { OutputTab } from './OutputTab';
import { EffectsTab } from './EffectsTab';
import { ExplodeTab } from './ExplodeTab';
import { AnnotateTab } from './AnnotateTab';
import { SectionPanel } from './SectionPanel';
import { StylePresets } from './StylePresets';
import { TextPanel } from './TextPanel';
import { textTarget } from '../app/textActions';

type Tab = 'style' | 'object' | 'drawing' | 'explode' | 'labels' | 'view' | 'effects' | 'output';

export function Inspector() {
  const [expanded, setExpanded] = useState<Partial<Record<Tab, boolean>>>({});
  const panel = useRef<HTMLElement>(null);
  const sel = useStore((s) => s.ui.selection);
  const request = useStore((s) => s.ui.inspectorTab);
  useEffect(() => {
    if (!request) return;
    setExpanded((v) => ({ ...v, [request.tab]: true }));
    const frame = requestAnimationFrame(() => {
      panel.current?.querySelector(`#inspector-${request.tab}`)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [request]);
  const groups: { id: Tab; label: string; hint: string; icon: ReactNode; content: ReactNode }[] = [
    { id: 'style', label: 'Style & linework', hint: 'Colours, fills, hatches & lineweights', icon: <path d="m4 16 8-12 4 12M6 12h8M3 19h14" />, content: <><ContextHeader /><StyleTab key={sel.join()} /></> },
    { id: 'object', label: 'Object properties', hint: 'Name, visibility, position & scale', icon: <path d="m10 2 7 4v8l-7 4-7-4V6zM3 6l7 4 7-4M10 10v8" />, content: <><ContextHeader object /><ObjectTab /></> },
    { id: 'drawing', label: 'Drawing setup', hint: 'Style presets, shadows & lighting', icon: <><circle cx="10" cy="10" r="4" /><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.5 3.5 5 5m10 10 1.5 1.5m0-13L15 5M5 15l-1.5 1.5" /></>, content: <DrawingTab /> },
    { id: 'view', label: 'Camera & sections', hint: 'Projection, framing & section cuts', icon: <><rect x="3" y="4" width="14" height="12" rx="1" /><path d="M1 10h18M10 4v12" strokeDasharray="2 2" /></>, content: <ViewTab /> },
    { id: 'explode', label: 'Exploded views', hint: 'Separate parts & add connectors', icon: <path d="m3 6 7-4 7 4-7 4zM3 10l7 4 7-4M3 14l7 4 7-4" />, content: <ExplodeTab /> },
    { id: 'labels', label: 'Labels & annotations', hint: 'Name parts, add leaders & a legend', icon: <><path d="M2 16h5l3-7M9 3h9v8H9zM12 6h3M12 8h2" /><circle cx="3" cy="16" r="1.5" /></>, content: <AnnotateTab /> },
    { id: 'effects', label: 'Image effects', hint: 'Print textures, colour & graphic looks', icon: <><path d="M3 3h14v14H3zM3 10h14M10 3v14" /><path d="m3 7 4-4m3 4 4-4m-4 14 7-7" /></>, content: <EffectsTab /> },
    { id: 'output', label: 'Page & export', hint: 'Paper size, background & PNG output', icon: <path d="M5 2h7l4 4v12H5zM12 2v5h4M8 12h5m-2-2 2 2-2 2" />, content: <OutputTab /> },
  ];
  return (
    <aside className="panel right" ref={panel} id="inspector-panel" aria-label="Drawing inspector">
      <div className="inspector-heading">
        <div><h2>Inspector</h2><p>Open a section to adjust your drawing.</p></div>
        <button className="link-btn" onClick={() => setExpanded({})} disabled={!Object.values(expanded).some(Boolean)}>Collapse all</button>
      </div>
      <div className="inspector-groups">
        {groups.map((g) => (
          <InspectorGroup key={g.id} id={g.id} label={g.label} hint={g.hint} icon={g.icon} open={!!expanded[g.id]} onToggle={() => setExpanded((v) => ({ ...v, [g.id]: !v[g.id] }))}>
            {g.content}
          </InspectorGroup>
        ))}
      </div>
    </aside>
  );
}

/** Mount on first use; collapsing a group preserves its controls and subsection state. */
function InspectorGroup(p: { id: Tab; label: string; hint: string; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  const [visited, setVisited] = useState(p.open);
  useEffect(() => { if (p.open) setVisited(true); }, [p.open]);
  return (
    <section className={`inspector-group${p.open ? ' expanded' : ''}`} id={`inspector-${p.id}`}>
      <h3>
        <button className="inspector-trigger" id={`heading-${p.id}`} aria-expanded={p.open} aria-controls={`body-${p.id}`} onClick={p.onToggle}>
          <span className="inspector-icon"><svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p.icon}</svg></span>
          <span className="inspector-label"><strong>{p.label}</strong><span>{p.hint}</span></span>
          <svg className="disclosure" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="m5 3 5 5-5 5" /></svg>
        </button>
      </h3>
      <div id={`body-${p.id}`} hidden={!p.open} role="region" aria-labelledby={`heading-${p.id}`}>
        {(p.open || visited) && p.children}
      </div>
    </section>
  );
}

function ContextHeader({ object = false }: { object?: boolean }) {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.ui.selection).filter((id) => doc.nodes[id]);
  if (!sel.length)
    return (
      <div className="context">
        <div className="ctx-name">{object ? 'No object selected' : 'Drawing defaults'}</div>
        <div className="ctx-path">{object ? 'Select a part in the drawing or Objects panel to edit its properties.' : 'Applies to all objects unless they have their own style. Select an object to style it separately.'}</div>
      </div>
    );
  const n = doc.nodes[sel[0]];
  const path = ancestors(doc, n.id).reverse().map((a) => doc.nodes[a].name).join(' / ');
  return (
    <div className="context sel">
      <div className="ctx-name">{sel.length > 1 ? `${sel.length} items` : n.name}</div>
      <div className="ctx-path">{sel.length > 1 ? `First: ${n.name}` : path || 'Top level'}</div>
      <button className="icon-btn ctx-close" title="Clear selection (Esc)" onClick={actions.clearSelection}>
        ×
      </button>
    </div>
  );
}

/** Reads/writes one style key in the current scope, with override + inheritance cues. */
function useStyleField() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.ui.selection).filter((id) => doc.nodes[id]);
  const eff: GraphicStyle = sel.length ? resolveStyle(doc, sel[0]) : doc.defaults;
  const field = (key: StyleKey, label: string, ctl: ReactNode, title?: string, stacked = false) => {
    const overridden = sel.some((id) => doc.nodes[id].style[key] !== undefined);
    let inherited: string | undefined;
    if (sel.length && !overridden) {
      const src = styleSource(doc, sel[0], key);
      if (src !== 'defaults') inherited = doc.nodes[src].name;
    }
    return (
      <Row key={key} label={label} title={title} overridden={overridden} inherited={inherited} onReset={() => actions.clearStyle(key)} stacked={stacked}>
        {ctl}
      </Row>
    );
  };
  return { doc, sel, eff, field };
}

function StyleTab() {
  const { sel, eff, field, doc } = useStyleField();
  const set = actions.setStyle;
  const overrideCount = sel.reduce((a, id) => a + Object.keys(doc.nodes[id].style).length, 0);
  return (
    <>
      {sel.length > 0 && <div className="scope sel">
          <>
            Overrides on {sel.length} selected · groups pass their style to children
            {overrideCount > 0 && (
              <button className="link-btn" onClick={actions.clearAllOverrides}>
                Reset {overrideCount} {overrideCount === 1 ? 'override' : 'overrides'}
              </button>
            )}
          </>
      </div>}
      <Section title="Fill">
        {field(
          'fillMode',
          'Fill',
          <Segmented<FillMode>
            value={eff.fillMode}
            onChange={(v) => set('fillMode', v)}
            options={[
              { value: 'material', label: 'Original', title: 'Colours and textures from the imported file' },
              { value: 'color', label: 'Mono', title: 'One flat colour' },
              { value: 'clay', label: 'Clay', title: 'Warm neutral with stronger toning' },
              { value: 'white', label: 'White', title: 'White — hidden-line drawing' },
              { value: 'none', label: 'None', title: 'Linework only, see-through' },
            ]}
          />,
          'How faces are filled',
          true,
        )}
        {eff.fillMode === 'color' && field('fillColor', 'Colour', <ColorField value={eff.fillColor} onChange={(v) => set('fillColor', v)} />)}
        {eff.fillMode !== 'none' && (
          <>
            {field('opacity', 'Opacity', <Slider value={eff.opacity} min={0} max={1} step={0.01} onChange={(v) => set('opacity', v)} />)}
            {field('toning', 'Face toning', <Slider value={eff.toning} min={0} max={1} step={0.01} onChange={(v) => set('toning', v)} />, 'Shade faces by their orientation to the sun: 0 flat, 1 strong')}
          </>
        )}
      </Section>
      {eff.fillMode !== 'none' && (
        <Section title="Hatch" defaultOpen={false}>
          {field(
            'hatch',
            'Pattern',
            <Segmented<HatchMode>
              value={eff.hatch}
              onChange={(v) => set('hatch', v)}
              options={[
                { value: 'none', label: 'None' },
                { value: 'lines', label: 'Lines', title: 'Parallel lines' },
                { value: 'cross', label: 'Cross', title: 'Crosshatch' },
                { value: 'dots', label: 'Dots', title: 'Stipple grid' },
              ]}
            />,
            'Drawn in drawing space, scaled with lineweights',
            true,
          )}
          {eff.hatch !== 'none' && (
            <>
              {field('hatchColor', 'Colour', <ColorField value={eff.hatchColor} onChange={(v) => set('hatchColor', v)} />)}
              {field('hatchSpacing', 'Spacing', <Slider value={eff.hatchSpacing} min={2} max={40} step={0.5} precision={1} unit="px" onChange={(v) => set('hatchSpacing', v)} />, 'Distance between hatch lines, px at the reference width')}
              {field('hatchWidth', 'Weight', <Slider value={eff.hatchWidth} min={0.1} max={4} step={0.05} unit="px" onChange={(v) => set('hatchWidth', v)} />)}
              {eff.hatch !== 'dots' && field('hatchAngle', 'Angle', <Slider value={eff.hatchAngle} min={0} max={180} step={1} precision={0} unit="°" onChange={(v) => set('hatchAngle', v)} />)}
            </>
          )}
        </Section>
      )}
      <Section title="Linework" defaultOpen={false}>
        {field('showLines', 'Draw lines', <Toggle value={eff.showLines} onChange={(v) => set('showLines', v)} />)}
        {eff.showLines && (
          <>
            {field('lineColor', 'Colour', <ColorField value={eff.lineColor} onChange={(v) => set('lineColor', v)} />)}
            {field('lineOpacity', 'Opacity', <Slider value={eff.lineOpacity} min={0} max={1} step={0.01} onChange={(v) => set('lineOpacity', v)} />)}
            {field(
              'lineStyle',
              'Pattern',
              <Segmented<LineStyle>
                value={eff.lineStyle}
                onChange={(v) => set('lineStyle', v)}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'dashed', label: 'Dashed' },
                  { value: 'dotted', label: 'Dotted' },
                ]}
              />,
            )}
            {field(
              'lineOrder',
              'Draw order',
              <Segmented<LineOrder>
                value={eff.lineOrder}
                onChange={(v) => set('lineOrder', v)}
                options={[
                  { value: 'normal', label: 'Normal', title: 'Hidden where other geometry is in front' },
                  { value: 'front', label: 'On top', title: 'Always visible, drawn over every fill' },
                  { value: 'behind', label: 'Behind', title: 'Drawn under every fill: only shows where nothing covers it' },
                ]}
              />,
              'How these lines are occluded',
              true,
            )}
            <div className="sub-label">Lineweights · px at a {doc.drawing.referenceWidth}px-wide frame</div>
            {field('silhouetteWidth', 'Silhouette', <Slider value={eff.silhouetteWidth} min={0} max={8} step={0.05} unit="px" onChange={(v) => set('silhouetteWidth', v)} />, 'Outline where the surface turns away from you')}
            {field('creaseWidth', 'Creases', <Slider value={eff.creaseWidth} min={0} max={8} step={0.05} unit="px" onChange={(v) => set('creaseWidth', v)} />, 'Sharp edges sharper than the crease angle')}
            {field('creaseAngle', 'Crease angle', <Slider value={eff.creaseAngle} min={1} max={120} step={0.5} precision={1} unit="°" onChange={(v) => set('creaseAngle', v)} />, 'Raise to quiet curved surfaces')}
            {field('openEdgeWidth', 'Open edges', <Slider value={eff.openEdgeWidth} min={0} max={8} step={0.05} unit="px" onChange={(v) => set('openEdgeWidth', v)} />, 'Borders of open surfaces')}
            {field('materialEdgeWidth', 'Material edges', <Slider value={eff.materialEdgeWidth} min={0} max={8} step={0.05} unit="px" onChange={(v) => set('materialEdgeWidth', v)} />, 'Where two materials meet, and non-manifold edges')}
            {field('allEdgesWidth', 'All mesh edges', <Slider value={eff.allEdgesWidth} min={0} max={4} step={0.05} unit="px" onChange={(v) => set('allEdgesWidth', v)} />, 'Every triangle edge (shows tessellation). 0 = off')}
            {field('curveWidth', 'Curves', <Slider value={eff.curveWidth} min={0} max={8} step={0.05} unit="px" onChange={(v) => set('curveWidth', v)} />, 'Imported polylines')}
          </>
        )}
      </Section>
      <Section title="Shadows" defaultOpen={false}>
        {field('castShadow', 'Casts shadow', <Toggle value={eff.castShadow} onChange={(v) => set('castShadow', v)} />)}
        {field('receiveShadow', 'Receives shadow', <Toggle value={eff.receiveShadow} onChange={(v) => set('receiveShadow', v)} />, 'Shows shadows cast on it, and shade on faces away from the sun')}
        {doc.drawing.shadows === 'off' && <p className="hint">Shadows are off for the drawing. Turn them on in the Drawing setup section.</p>}
      </Section>
      <Section title="Image effects" defaultOpen={false}>
        {field(
          'fxLook',
          'Look',
          <select className="select" value={doc.effects.looks.some((l) => l.id === eff.fxLook) ? eff.fxLook : ''} onChange={(ev) => set('fxLook', ev.target.value)}>
            <option value="">Whole drawing</option>
            {doc.effects.looks.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>,
          'Which image-effect look this object gets. Groups pass it to everything inside. Layer looks are made in the Image effects section.',
        )}
        {!doc.effects.enabled && <p className="hint">Image effects are off (Image effects section, Shift+X).</p>}
        {doc.effects.enabled && !doc.effects.looks.length && <p className="hint">No layer looks yet. Add one in the Image effects section to give this object its own look.</p>}
      </Section>
      <Section title="Section cut" defaultOpen={false}>
        {field('cutSolid', 'Cut as one solid', <Toggle value={eff.cutSolid} onChange={(v) => set('cutSolid', v)} />, 'Fill everything inside this group as a single solid, for objects modelled as separate surfaces (outer wall, inner wall, rim, base). Open surfaces in the same group are already combined automatically.')}
        {field('cutFill', 'Fill cut', <Toggle value={eff.cutFill} onChange={(v) => set('cutFill', v)} />, 'Poché where the section plane cuts through this object')}
        {eff.cutFill && (
          <>
            {field('cutFillColor', 'Poché colour', <ColorField value={eff.cutFillColor} onChange={(v) => set('cutFillColor', v)} />)}
            {field(
              'cutHatch',
              'Pattern',
              <Segmented<HatchMode>
                value={eff.cutHatch}
                onChange={(v) => set('cutHatch', v)}
                options={[
                  { value: 'none', label: 'Solid' },
                  { value: 'lines', label: 'Lines' },
                  { value: 'cross', label: 'Cross' },
                  { value: 'dots', label: 'Dots' },
                ]}
              />,
              'Hatch over the poché, drawn in drawing space',
              true,
            )}
            {eff.cutHatch !== 'none' && (
              <>
                {field('cutHatchColor', 'Hatch colour', <ColorField value={eff.cutHatchColor} onChange={(v) => set('cutHatchColor', v)} />)}
                {field('cutHatchSpacing', 'Spacing', <Slider value={eff.cutHatchSpacing} min={2} max={40} step={0.5} precision={1} unit="px" onChange={(v) => set('cutHatchSpacing', v)} />)}
                {field('cutHatchWidth', 'Hatch weight', <Slider value={eff.cutHatchWidth} min={0.1} max={4} step={0.05} unit="px" onChange={(v) => set('cutHatchWidth', v)} />)}
                {eff.cutHatch !== 'dots' && field('cutHatchAngle', 'Angle', <Slider value={eff.cutHatchAngle} min={0} max={180} step={1} precision={0} unit="°" onChange={(v) => set('cutHatchAngle', v)} />)}
              </>
            )}
          </>
        )}
        {field('cutLineWidth', 'Cut line', <Slider value={eff.cutLineWidth} min={0} max={10} step={0.05} unit="px" onChange={(v) => set('cutLineWidth', v)} />, 'Weight of the line where the plane meets this object, px at reference width. 0 = none')}
        {eff.cutLineWidth > 0 && field('cutLineColor', 'Cut line colour', <ColorField value={eff.cutLineColor} onChange={(v) => set('cutLineColor', v)} />)}
        {!doc.section.enabled && <p className="hint">The section cut is off. Turn it on in the Camera & sections panel (X) to see these.</p>}
      </Section>
      {sel.length > 0 && (
        <div className="pad">
          <button className="btn wide" onClick={actions.resetToImported} title="Restore imported names, transforms and original materials for the selection and everything inside it">
            Reset to imported
          </button>
        </div>
      )}
    </>
  );
}

function ObjectTab() {
  const doc = useStore((s) => s.doc);
  const stats = useStore((s) => s.ui.stats);
  const sel = useStore((s) => s.ui.selection).filter((id) => doc.nodes[id]);
  if (!sel.length)
    return (
      <Section title="Scene">
        <div className="stat-grid">
          <span>Drawable objects</span>
          <b>{stats.objects.toLocaleString()}</b>
          <span>Triangles</span>
          <b>{stats.triangles.toLocaleString()}</b>
          <span>Edges analysed</span>
          <b>{stats.edges.toLocaleString()}</b>
          <span>Models</span>
          <b>{Object.keys(doc.models).length}</b>
        </div>
        <p className="hint">Select an object in the viewport or the scene list.</p>
      </Section>
    );
  const n = doc.nodes[sel[0]];
  const d = n.geom ? registry.get(n.geom.model)?.drawables[n.geom.index] : undefined;
  const world = worldMatrix(doc, n.id);
  const pos = new Vector3(), q = new Quaternion(), scl = new Vector3();
  world.decompose(pos, q, scl);
  // Yaw first (Y up), so spinning about the vertical runs a full ±180° without flipping the other angles.
  const rot = new Euler().setFromQuaternion(q, 'YXZ');
  const moved = n.matrix.some((v, i) => Math.abs(v - n.baseMatrix[i]) > 1e-9);
  const step = Math.max(doc.camera.height / 200, 1e-4);
  /** Write a new world transform for the node, as a local matrix under its parent. */
  const setWorld = (p: Vector3, r: Quaternion, s: Vector3) => {
    const parentWorld = n.parent ? worldMatrix(doc, n.parent) : new Matrix4();
    const newLocal = parentWorld.invert().multiply(new Matrix4().compose(p, r, s));
    actions.setNodeMatrix(n.id, newLocal.toArray());
  };
  const nudge = (axis: number, value: number) => {
    const delta = value - pos.getComponent(axis);
    const t = new Vector3().setComponent(axis, delta);
    const parentWorld = n.parent ? worldMatrix(doc, n.parent) : new Matrix4();
    const newWorld = new Matrix4().makeTranslation(t.x, t.y, t.z).multiply(world);
    const newLocal = parentWorld.invert().multiply(newWorld);
    actions.setNodeMatrix(n.id, newLocal.toArray());
  };
  const rotateTo = (axis: 'x' | 'y' | 'z', deg: number) => {
    const e = rot.clone();
    e[axis] = MathUtils.degToRad(deg);
    setWorld(pos, new Quaternion().setFromEuler(e), scl);
  };
  const scaleAxis = (axis: number, v: number) => setWorld(pos, q, scl.clone().setComponent(axis, Math.max(v, 1e-6)));
  const uniform = Math.cbrt(Math.abs(scl.x * scl.y * scl.z));
  const scaleUniform = (v: number) => setWorld(pos, q, scl.clone().multiplyScalar(Math.max(v, 1e-6) / (uniform || 1)));
  const scaleStep = Math.max(uniform / 100, 1e-4);
  const image = imagePlaneOf(doc, n.id);
  const text = sel.length === 1 && !!textTarget(doc, n.id);
  /** Orient an image plane or text: upright facing +Z (keeps its heading), flat on the ground, or square to the view. */
  const orient = (to: 'upright' | 'flat' | 'view') => {
    let r: Quaternion;
    if (to === 'view') {
      const { right, up, back } = basis(doc.camera);
      r = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, back));
    } else r = new Quaternion().setFromEuler(new Euler(to === 'flat' ? -Math.PI / 2 : 0, rot.y, 0, 'YXZ'));
    store.commit();
    setWorld(pos, r, scl);
    store.commit();
  };
  return (
    <>
      {text && <TextPanel nodeId={n.id} />}
      <Section title="Properties">
        {sel.length === 1 && (
          <Row label="Name">
            <input className="text" key={n.id + n.name} defaultValue={n.name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => actions.rename(n.id, e.target.value)} />
          </Row>
        )}
        {n.name !== n.importedName && (
          <Row label="Imported as">
            <span className="value">{n.importedName}</span>
          </Row>
        )}
        <Row label="Type">
          <span className="value">{n.kind === 'group' ? `Group · ${n.children.length} children` : n.kind === 'line' ? 'Curve' : 'Mesh'}</span>
        </Row>
        {d && (
          <Row label="Geometry">
            <span className="value">{d.kind === 'mesh' ? `${d.triangles.toLocaleString()} triangles` : `${(d.geometry.attributes.position.count / 2).toLocaleString()} segments`}</span>
          </Row>
        )}
        {d && d.materials.length > 0 && (
          <Row label="Materials">
            <span className="mat-list">
              {d.materials.map((m, i) => (
                <span key={i} className="mat-chip" title={m.name || `Material ${i + 1}`}>
                  <i style={{ background: m.color }} />
                  {m.name || `#${i + 1}`}
                  {m.map ? ' · tex' : ''}
                </span>
              ))}
            </span>
          </Row>
        )}
        {n.geom && (
          <Row label="Source">
            <span className="value">{doc.models[n.geom.model]?.name}</span>
          </Row>
        )}
        <Row label="Visible">
          <Toggle value={sel.every((id) => doc.nodes[id].visible)} onChange={(v) => actions.setVisible(sel, v)} />
        </Row>
        <Row label="Locked" title="Locked items cannot be picked in the viewport">
          <Toggle value={sel.every((id) => doc.nodes[id].locked)} onChange={() => actions.toggleLock(sel)} />
        </Row>
        <div className="btn-row">
          <button className="btn" disabled={!n.parent} onClick={actions.selectParent} title="Select parent (P · Alt+click in viewport)">
            Select parent
          </button>
          <button className="btn" disabled={!n.children.length} onClick={actions.selectChildren} title="Select children">
            Select children
          </button>
          <button className="btn" onClick={actions.fitSelection} title="Frame selection (Shift+F)">
            {Icon.target} Frame
          </button>
        </div>
      </Section>
      {sel.length === 1 && (
        <Section title="Position · world">
          {['X', 'Y', 'Z'].map((a, i) => (
            <Row key={a} label={a}>
              <NumberField value={pos.getComponent(i)} step={step} precision={3} onChange={(v) => nudge(i, v)} />
            </Row>
          ))}
          {moved && <p className="hint">Moved from its imported position. “Reset to imported” in the Style & linework section restores it.</p>}
        </Section>
      )}
      {sel.length === 1 && (
        <Section title="Rotation · world">
          {(['y', 'x', 'z'] as const).map((a) => (
            <Row key={a} label={a === 'y' ? 'Y · turn' : a === 'x' ? 'X · tilt' : 'Z · roll'} title="Degrees, about the object's pivot. Applied turn, then tilt, then roll.">
              <NumberField value={MathUtils.radToDeg(rot[a])} step={1} precision={1} unit="°" onChange={(v) => rotateTo(a, v)} />
            </Row>
          ))}
          {(image || text) && (
            <div className="btn-row">
              <button className="btn" onClick={() => orient('upright')} title={`Stand the ${text ? 'text' : 'image'} up, keeping its turn`}>Upright</button>
              <button className="btn" onClick={() => orient('flat')} title={`Lay the ${text ? 'text' : 'image'} flat, face up`}>Flat</button>
              <button className="btn" onClick={() => orient('view')} title={`Turn the ${text ? 'text' : 'image'} square to the current view`}>Face view</button>
            </div>
          )}
        </Section>
      )}
      {sel.length === 1 && (
        <Section title="Scale">
          <Row label="Uniform" title="Scales every axis together, keeping proportions">
            <NumberField value={uniform} step={scaleStep} precision={3} min={1e-6} onChange={scaleUniform} />
          </Row>
          {(image ? ['Width', 'Height'] : ['X', 'Y', 'Z']).map((a, i) => (
            <Row key={a} label={a} title={image ? 'Along the image itself' : "Along the object's own axis"}>
              <NumberField value={scl.getComponent(i)} step={scaleStep} precision={3} min={1e-6} onChange={(v) => scaleAxis(i, v)} />
            </Row>
          ))}
          {image && (
            <div className="btn-row">
              <button className="btn" onClick={() => { const k = Math.sqrt(Math.abs(scl.x * scl.y)); setWorld(pos, q, new Vector3(k, k, scl.z)); }} disabled={Math.abs(scl.x - scl.y) < 1e-9} title="Undo any stretching: width and height back in the picture's proportions">
                Restore proportions
              </button>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

/** True for an imported image: its top group or the plane inside it. */
function imagePlaneOf(doc: ProjectDoc, id: string): boolean {
  const n = doc.nodes[id];
  const model = n.geom?.model ?? (n.children.length === 1 ? doc.nodes[n.children[0]]?.geom?.model : undefined);
  return !!model && doc.models[model]?.format === 'image';
}

function DrawingTab() {
  const dr = useStore((s) => s.doc.drawing);
  const set = actions.setDrawing;
  return (
    <>
      <Section title="Style presets">
        <StylePresets />
      </Section>
      <Section title="Shadows" defaultOpen={false}>
        <Segmented<ShadowMode>
          value={dr.shadows}
          onChange={(v) => set('shadows', v)}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'graphic', label: 'Graphic', title: 'Crisp shadows in a flat colour' },
            { value: 'soft', label: 'Soft', title: 'Blurred shadows that darken the fill' },
          ]}
        />
        {dr.shadows !== 'off' && (
          <>
            <Row label="Colour">
              <ColorField value={dr.shadowColor} onChange={(v) => set('shadowColor', v)} />
            </Row>
            <Row label="Opacity">
              <Slider value={dr.shadowOpacity} min={0} max={1} step={0.01} onChange={(v) => set('shadowOpacity', v)} />
            </Row>
            {dr.shadows === 'soft' && (
              <Row label="Softness">
                <Slider value={dr.shadowSoftness} min={0} max={1} step={0.01} onChange={(v) => set('shadowSoftness', v)} />
              </Row>
            )}
            <Row label="Shade faces" title="Faces turned away from the sun take the shadow colour too (shade and shadow)">
              <Toggle value={dr.shadeFaces} onChange={(v) => set('shadeFaces', v)} />
            </Row>
            <p className="hint">The sun is set under Light below. Objects cast and receive by default; change that per object in the Style & linework section.</p>
          </>
        )}
      </Section>
      <Section title="Ground" defaultOpen={false}>
        <Segmented<GroundMode>
          value={dr.ground}
          onChange={(v) => set('ground', v)}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'solid', label: 'Solid', title: 'A coloured plane at the base of the model' },
            { value: 'shadow', label: 'Shadow only', title: 'Invisible except for the shadows it catches (works with a transparent export)' },
          ]}
        />
        {dr.ground === 'solid' && (
          <Row label="Colour">
            <ColorField value={dr.groundColor} onChange={(v) => set('groundColor', v)} />
          </Row>
        )}
        {dr.ground === 'shadow' && dr.shadows === 'off' && <p className="hint">Turn shadows on to see anything on a shadow-only ground.</p>}
      </Section>
      <Section title="Viewport" defaultOpen={false}>
        <Row label="Grid" title="Ground grid at the base of the model (G)">
          <Toggle value={dr.showGrid} onChange={(v) => set('showGrid', v)} />
        </Row>
      </Section>
      <Section title="Hidden lines" defaultOpen={false}>
        <Row label="Show hidden">
          <Toggle value={dr.hiddenLines} onChange={(v) => set('hiddenLines', v)} />
        </Row>
        {dr.hiddenLines && (
          <>
            <Row label="Colour">
              <ColorField value={dr.hiddenColor} onChange={(v) => set('hiddenColor', v)} />
            </Row>
            <Row label="Weight">
              <Slider value={dr.hiddenWidth} min={0.1} max={4} step={0.05} unit="px" onChange={(v) => set('hiddenWidth', v)} />
            </Row>
          </>
        )}
      </Section>
      <Section title="Light · toning and shadows" defaultOpen={false}>
        <Row label="Sun azimuth">
          <Slider value={dr.sunAzimuth} min={0} max={360} step={1} precision={0} unit="°" onChange={(v) => set('sunAzimuth', v)} />
        </Row>
        <Row label="Sun elevation">
          <Slider value={dr.sunElevation} min={2} max={90} step={1} precision={0} unit="°" onChange={(v) => set('sunElevation', v)} />
        </Row>
        <Row label="Shadow side" title="Brightness of faces turned away from the sun">
          <Slider value={dr.ambient} min={0} max={1} step={0.01} onChange={(v) => set('ambient', v)} />
        </Row>
        <Row label="Flat faces" title="Tone by true face orientation (crisp planes) rather than smoothed normals">
          <Toggle value={dr.flatShading} onChange={(v) => set('flatShading', v)} />
        </Row>
      </Section>
    </>
  );
}

function ViewTab() {
  const c = useStore((s) => s.doc.camera);
  const set = (patch: Parameters<typeof actions.setCamera>[0]) => actions.setCamera({ ...patch, preset: null });
  const locked = c.locked;
  return (
    <>
      <Section title="Projection">
        <Segmented
          value={c.projection}
          onChange={() => actions.toggleProjection()}
          options={[
            { value: 'ortho', label: 'Parallel', title: 'Orthographic / axonometric / oblique (O)' },
            { value: 'persp', label: 'Perspective', title: 'Perspective (O)' },
          ]}
        />
        {c.projection === 'persp' && (
          <Row label="Field of view">
            <Slider value={c.fov} min={10} max={90} step={1} precision={0} unit="°" onChange={(v) => actions.setCamera({ fov: v })} />
          </Row>
        )}
        <div className="preset-grid">
          {CAMERA_PRESETS.map((p) => (
            <button key={p.id} className={c.preset === p.id ? 'on' : ''} disabled={locked} title={`${p.hint}${p.key ? ` (${p.key})` : ''}`} onClick={() => actions.applyPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </Section>
      <SectionPanel />
      <Section title="Orientation" right={<Toggle value={locked} onChange={actions.toggleViewLock} label="Lock" title="Lock orientation (Shift+L)" />}>
        <Row label="Azimuth">
          <Slider value={c.azimuth} min={0} max={360} step={0.5} precision={2} unit="°" onChange={(v) => !locked && set({ azimuth: v })} />
        </Row>
        <Row label="Elevation">
          <Slider value={c.elevation} min={-90} max={90} step={0.5} precision={3} unit="°" onChange={(v) => !locked && set({ elevation: v })} />
        </Row>
        {c.projection === 'ortho' && (
          <Row label="Oblique" title="Shear the receding axis: cabinet, cavalier, plan oblique">
            <Toggle value={c.oblique.enabled} onChange={(v) => !locked && set({ oblique: { ...c.oblique, enabled: v } })} />
          </Row>
        )}
        {c.projection === 'ortho' && c.oblique.enabled && (
          <>
            <Row label="Receding angle">
              <Slider value={c.oblique.angle} min={0} max={360} step={1} precision={1} unit="°" onChange={(v) => !locked && set({ oblique: { ...c.oblique, angle: v } })} />
            </Row>
            <Row label="Receding scale" title="1 = cavalier / plan oblique · 0.5 = cabinet">
              <Slider value={c.oblique.scale} min={0.1} max={1.5} step={0.01} onChange={(v) => !locked && set({ oblique: { ...c.oblique, scale: v } })} />
            </Row>
          </>
        )}
        {locked && <p className="hint">Orientation is locked. Pan and zoom still work.</p>}
      </Section>
      <Section title="Framing">
        <Row label="Frame height" title="World units visible from top to bottom of the viewport">
          <NumberField value={c.height} step={c.height / 100} min={1e-6} precision={3} onChange={(v) => actions.setCamera({ height: v })} />
        </Row>
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <Row key={a} label={`Target ${a}`}>
            <NumberField
              value={c.target[i]}
              step={c.height / 200}
              precision={3}
              onChange={(v) => {
                const t = [...c.target] as [number, number, number];
                t[i] = v;
                actions.setCamera({ target: t });
              }}
            />
          </Row>
        ))}
        <div className="btn-row">
          <button className="btn" onClick={actions.fitAll} title="Fit all (F)">
            {Icon.fit} Fit all
          </button>
          <button className="btn" onClick={actions.fitSelection} title="Fit selection (Shift+F)">
            {Icon.target} Fit selection
          </button>
        </div>
      </Section>
    </>
  );
}
