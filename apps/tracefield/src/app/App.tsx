import { useEffect, useRef, useState } from 'react';
import { importFiles } from '../import/importFiles';
import { hasAutosave, startAutosave } from '../project/autosave';
import { exportPNG } from '../project/exportImage';
import { newProject, openProjectFile, saveProject } from '../project/projectFile';
import { store, useStore } from '../state/store';
import { Icon } from '../ui/controls';
import { Inspector } from '../ui/Inspector';
import { ACCEPT, ScenePanel } from '../ui/ScenePanel';
import { ViewStrip } from '../ui/ViewStrip';
import { Viewport } from '../ui/Viewport';
import { installShortcuts, SHORTCUTS } from './shortcuts';

export function App() {
  const importRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const [help, setHelp] = useState(false);
  const status = useStore((s) => s.ui.status);
  const name = useStore((s) => s.doc.name);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const hasContent = useStore((s) => s.doc.roots.length > 0);

  useEffect(() => {
    hasAutosave()
      .then((a) => {
        if (a) {
          store.setUI({ restoreAvailable: true });
          store.status(`A previous session (“${a.name}”) can be restored`);
        }
      })
      .finally(startAutosave);
    return installShortcuts({
      openImport: () => importRef.current?.click(),
      openProject: () => openRef.current?.click(),
      toggleHelp: () => setHelp((h) => !h),
    });
  }, []);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => store.setUI({ status: null }), status.kind === 'error' ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    document.title = `${name} — Tracefield`;
  }, [name]);

  return (
    <div className="app">
      <header className="topbar">
        <a className="back" href="../../" title="Back to hsgleeson.xyz">
          ←
        </a>
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M9 1.5 16 5.5v7L9 16.5 2 12.5v-7z M2 5.5l7 4 7-4 M9 9.5v7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </span>
          Tracefield
        </div>
        <input
          className="doc-name"
          value={name}
          aria-label="Drawing name"
          onChange={(e) => store.setDoc((d) => ({ ...d, name: e.target.value }), { coalesce: 'doc-name' })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <nav className="menu">
          <button
            onClick={() => {
              if (!hasContent || confirm('Start a new drawing? Unsaved work stays only in the local autosave until you change something.')) newProject();
            }}
            title="New drawing (Ctrl+Alt+N)"
          >
            New
          </button>
          <button onClick={() => openRef.current?.click()} title="Open a .tracefield project (Ctrl+O)">
            Open…
          </button>
          <button onClick={saveProject} disabled={!hasContent} title="Save a portable .tracefield project (Ctrl+S)">
            Save
          </button>
          <span className="menu-sep" />
          <button onClick={() => importRef.current?.click()} title="Import GLB, glTF, OBJ, STL, FBX, or images as planes (Ctrl+I)">
            Import…
          </button>
          <button className="menu-export" onClick={exportPNG} disabled={!hasContent} title="Export the drawing frame as PNG (Ctrl+E)">
            Export PNG
          </button>
          <span className="menu-sep" />
          <button className="icon" disabled={!canUndo} onClick={store.undo} title="Undo (Ctrl+Z)">
            {Icon.undo}
          </button>
          <button className="icon" disabled={!canRedo} onClick={store.redo} title="Redo (Ctrl+Shift+Z)">
            {Icon.redo}
          </button>
        </nav>
        <div className={`status ${status?.kind ?? ''}`} role="status" aria-live="polite">
          {status?.text}
        </div>
        <button className="help-btn" onClick={() => setHelp(!help)} title="Keyboard shortcuts (?)">
          ?
        </button>
        <input ref={importRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; importFiles(f); }} />
        <input ref={openRef} type="file" accept=".tracefield" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openProjectFile(f); }} />
      </header>
      <main className="main">
        <ScenePanel />
        <div className="stage">
          <Viewport onImport={() => importRef.current?.click()} />
          <ViewStrip />
        </div>
        <Inspector />
      </main>
      {help && (
        <div className="help-overlay" onClick={() => setHelp(false)}>
          <div className="help" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
            <header>
              <h2>Shortcuts</h2>
              <button className="icon-btn" onClick={() => setHelp(false)}>
                ×
              </button>
            </header>
            <div className="help-cols">
              {SHORTCUTS.map((g) => (
                <section key={g.group}>
                  <h3>{g.group}</h3>
                  <dl>
                    {g.items.map((s) => (
                      <div key={s.label}>
                        <dt>{s.keys}</dt>
                        <dd>{s.label}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
