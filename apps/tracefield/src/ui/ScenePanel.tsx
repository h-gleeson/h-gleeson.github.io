import { useMemo, useRef, useState } from 'react';
import { actions } from '../app/actions';
import { getImportUpAxis, importFiles, setImportUpAxis } from '../import/importFiles';
import { ancestors, descendants } from '../state/scene';
import { store, useStore } from '../state/store';
import type { ProjectDoc } from '../state/types';
import { Icon, Segmented } from './controls';

const PAGE = 200;
export const ACCEPT = '.glb,.gltf,.bin,.obj,.mtl,.stl,.fbx,.png,.jpg,.jpeg,.webp,.tracefield';

export function ScenePanel() {
  const doc = useStore((s) => s.doc);
  const ui = useStore((s) => s.ui);
  const [filter, setFilter] = useState('');
  const [upAxis, setUp] = useState(getImportUpAxis());
  const [showOptions, setShowOptions] = useState(false);
  const [pages, setPages] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const match = useMemo(() => filterSet(doc, filter.trim().toLowerCase()), [doc.nodes, doc.roots, filter]);
  const selSet = useMemo(() => new Set(ui.selection), [ui.selection]);
  const sel = ui.selection;
  const hasGroup = sel.some((id) => doc.nodes[id]?.kind === 'group');
  const counts = useMemo(() => {
    let groups = 0, objects = 0;
    for (const n of Object.values(doc.nodes)) n.kind === 'group' ? groups++ : objects++;
    return { groups, objects };
  }, [doc.nodes]);

  return (
    <aside className="panel left">
      <div className="panel-head">
        <div className="panel-title">
          <span>Scene</span>
          <span className="muted">
            {counts.objects.toLocaleString()} objects · {counts.groups.toLocaleString()} groups
          </span>
        </div>
        <div className="import-row">
          <button className="btn primary grow" onClick={() => fileRef.current?.click()} title="Import GLB, glTF, OBJ, STL or FBX (Ctrl+I)">
            Import model
          </button>
          <button className={`btn icon ${showOptions ? 'on' : ''}`} title="Import options" onClick={() => setShowOptions(!showOptions)} aria-expanded={showOptions}>
            {showOptions ? '▴' : '▾'}
          </button>
        </div>
        {showOptions && (
          <div className="import-options">
            <div className="kv">
              <span>Up axis</span>
              <Segmented
                value={upAxis}
                onChange={(v) => {
                  setUp(v);
                  setImportUpAxis(v);
                }}
                options={[
                  { value: 'y', label: 'Y up', title: 'glTF standard; most GLB exports' },
                  { value: 'z', label: 'Z up', title: 'Rotate Z-up sources (some OBJ / STL / FBX)' },
                ]}
              />
            </div>
            <p className="hint">For a .gltf with separate .bin and textures, select or drop all of its files together. OBJ picks up a matching .mtl the same way.</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            importFiles(files);
          }}
        />
      </div>

      <div className="toolstrip" role="toolbar" aria-label="Scene tools">
        <button disabled={!sel.length} onClick={actions.group} title="Group selection (Ctrl+G)">Group</button>
        <button disabled={!hasGroup} onClick={actions.ungroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>
        <button disabled={!sel.length} onClick={actions.duplicate} title="Duplicate (Ctrl+D)">Duplicate</button>
        <button disabled={!sel.length} onClick={actions.delete} title="Delete (Del)">Delete</button>
        <button disabled={!sel.length} onClick={() => actions.toggleHidden()} title="Hide / show (H) · Show all: Alt+H">Hide</button>
        <button disabled={!sel.length && !ui.isolated} className={ui.isolated ? 'on' : ''} onClick={actions.isolate} title="Isolate selection (I)">Isolate</button>
        <button disabled={!sel.length} onClick={() => actions.toggleLock()} title="Lock / unlock (L) — locked items can't be picked in the viewport">Lock</button>
        <button onClick={actions.showAll} title="Show everything (Alt+H)">Show all</button>
      </div>

      <div className="filter-wrap">
        <input
          className="filter"
          placeholder="Search nodes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setFilter('');
          }}
        />
        {filter && <span className="muted filter-count">{match ? match.hits : 0} found</span>}
      </div>

      <div
        className="tree"
        role="tree"
        aria-multiselectable
        onClick={(e) => {
          if (e.target === e.currentTarget) actions.clearSelection();
        }}
        onDragOver={(e) => e.dataTransfer.types.includes('text/tf-node') && e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData('text/tf-node');
          if (id && e.target === e.currentTarget) actions.reparent(id, null);
        }}
      >
        {!doc.roots.length && <div className="tree-empty">Imported models appear here with their original node hierarchy.</div>}
        {doc.roots.map((id) => (
          <TreeRow key={id} id={id} depth={0} doc={doc} selSet={selSet} renaming={ui.renaming} match={match} pages={pages} setPages={setPages} />
        ))}
      </div>
      <div className="panel-foot">
        {sel.length ? `${sel.length} selected · Ctrl+click add · Shift+click range` : 'Click to select · drag rows onto a group to re-parent'}
      </div>
    </aside>
  );
}

interface Match {
  show: Set<string>;
  hits: number;
}

function filterSet(doc: ProjectDoc, q: string): Match | null {
  if (!q) return null;
  const show = new Set<string>();
  let hits = 0;
  for (const n of Object.values(doc.nodes)) {
    if (!n.name.toLowerCase().includes(q)) continue;
    hits++;
    show.add(n.id);
    ancestors(doc, n.id).forEach((a) => show.add(a));
  }
  return { show, hits };
}

function TreeRow(p: {
  id: string;
  depth: number;
  doc: ProjectDoc;
  selSet: Set<string>;
  renaming: string | null;
  match: Match | null;
  pages: Record<string, number>;
  setPages: (f: (x: Record<string, number>) => Record<string, number>) => void;
}) {
  const { doc, id } = p;
  const n = doc.nodes[id];
  const [dropHint, setDropHint] = useState<'into' | 'after' | null>(null);
  if (!n || (p.match && !p.match.show.has(id))) return null;
  const selected = p.selSet.has(id);
  const open = n.expanded || !!p.match;
  const kids = open ? (p.match ? n.children.filter((c) => p.match!.show.has(c)) : n.children) : [];
  const limit = p.pages[id] ?? PAGE;
  const overrides = Object.keys(n.style).length;
  const isRoot = n.parent === null;
  const model = isRoot ? rootModel(doc, id) : undefined;
  const icon = isRoot ? Icon.model : n.kind === 'group' ? Icon.group : n.kind === 'line' ? Icon.line : Icon.mesh;

  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={n.children.length ? open : undefined}
        className={`tree-row ${selected ? 'sel' : ''} ${n.visible ? '' : 'is-hidden'} ${n.locked ? 'is-locked' : ''} ${dropHint ? `drop-${dropHint}` : ''}`}
        style={{ paddingLeft: 8 + p.depth * 14 }}
        onClick={(e) => actions.clickInTree(id, e)}
        onDoubleClick={() => store.setUI({ renaming: id })}
        draggable={p.renaming !== id}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/tf-node', id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('text/tf-node')) return;
          e.preventDefault();
          e.stopPropagation();
          setDropHint(n.kind === 'group' ? 'into' : 'after');
        }}
        onDragLeave={() => setDropHint(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropHint(null);
          const src = e.dataTransfer.getData('text/tf-node');
          if (!src || src === id || descendants(doc, src).includes(id)) return;
          if (n.kind === 'group') actions.reparent(src, id);
          else {
            const sibs = n.parent ? doc.nodes[n.parent].children : doc.roots;
            actions.reparent(src, n.parent, sibs.indexOf(id) + 1);
          }
        }}
      >
        <span
          className="twisty"
          onClick={(e) => {
            e.stopPropagation();
            if (n.children.length) actions.setExpanded(id, !n.expanded, e.altKey);
          }}
          title={n.children.length ? 'Expand / collapse (Alt: all levels)' : undefined}
        >
          {n.children.length ? (open ? '▾' : '▸') : ''}
        </span>
        <span className="kind">{icon}</span>
        {p.renaming === id ? (
          <input
            className="rename"
            autoFocus
            defaultValue={n.name}
            onFocus={(e) => e.target.select()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') actions.rename(id, (e.target as HTMLInputElement).value);
              if (e.key === 'Escape') store.setUI({ renaming: null });
            }}
            onBlur={(e) => actions.rename(id, e.target.value)}
          />
        ) : (
          <span className="name" title={n.name !== n.importedName ? `${n.name} (imported as “${n.importedName}”)` : n.name}>
            {n.name}
          </span>
        )}
        {model && <span className="tag">{model.format.toUpperCase()}</span>}
        {n.children.length > 0 && <span className="count">{n.children.length}</span>}
        {overrides > 0 && (
          <span className="badge" title={`${overrides} graphic override${overrides > 1 ? 's' : ''}`}>
            ◆
          </span>
        )}
        <button
          className="icon-btn"
          title={n.locked ? 'Unlock' : 'Lock'}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleLock([id]);
          }}
        >
          {Icon.lock(n.locked)}
        </button>
        <button
          className="icon-btn"
          title={n.visible ? 'Hide' : 'Show'}
          onClick={(e) => {
            e.stopPropagation();
            actions.setVisible([id], !n.visible);
          }}
        >
          {Icon.eye(n.visible)}
        </button>
      </div>
      {kids.slice(0, limit).map((c) => (
        <TreeRow key={c} {...p} id={c} depth={p.depth + 1} />
      ))}
      {kids.length > limit && (
        <button className="tree-more" style={{ paddingLeft: 30 + p.depth * 14 }} onClick={() => p.setPages((x) => ({ ...x, [id]: limit + PAGE * 4 }))}>
          Show {Math.min(PAGE * 4, kids.length - limit).toLocaleString()} more of {(kids.length - limit).toLocaleString()}
        </button>
      )}
    </>
  );
}

function rootModel(doc: ProjectDoc, id: string) {
  for (const d of descendants(doc, id)) {
    const g = doc.nodes[d].geom;
    if (g) return doc.models[g.model];
  }
  return undefined;
}
