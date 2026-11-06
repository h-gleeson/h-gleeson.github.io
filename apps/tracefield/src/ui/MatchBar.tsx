import { matchActions } from '../app/matchActions';
import { MATCH_GROUPS, matchValues } from '../state/match';
import { useStore } from '../state/store';

/** Floating bar for the match-properties tool: source, what gets copied, and actions. */
export function MatchBar() {
  const tool = useStore((s) => s.ui.tool);
  const src = useStore((s) => s.ui.matchSource);
  const groups = useStore((s) => s.ui.matchGroups);
  const sel = useStore((s) => s.ui.selection);
  const doc = useStore((s) => s.doc);
  if (tool !== 'match') return null;
  const node = src ? doc.nodes[src] : null;
  const v = node ? matchValues(doc, node.id, { fill: true, lines: true, hatch: true, shadows: true, cut: true }) : null;
  const fill = v ? (v.fillMode === 'white' ? '#ffffff' : v.fillMode === 'clay' ? '#d9cfc1' : v.fillMode === 'none' ? 'transparent' : v.fillMode === 'material' ? 'repeating-linear-gradient(45deg, #c9c6bd 0 3px, #ecebe6 3px 6px)' : v.fillColor) : 'transparent';
  const lw = v ? Math.max(0.5, Math.min(4, v.showLines ? v.silhouetteWidth ?? 1 : 0)) : 1;
  const targets = sel.filter((id) => id !== src).length;

  return (
    <div className="matchbar" role="toolbar" aria-label="Match properties">
      <span className="mb-icon" aria-hidden>
        <EyedropperIcon />
      </span>
      {node && v ? (
        <span className="mb-source" title="Properties are copied from this object">
          <span className="mb-swatch" style={{ background: fill, borderColor: v.showLines ? v.lineColor : 'transparent', borderWidth: lw, borderStyle: v.lineStyle === 'solid' ? 'solid' : v.lineStyle }} />
          <span className="mb-name">{node.name}</span>
        </span>
      ) : (
        <span className="mb-prompt">Click the object to copy from</span>
      )}
      <span className="mb-sep" />
      <span className="mb-groups" aria-label="Properties to copy">
        {MATCH_GROUPS.map((g) => (
          <button key={g.id} className={groups[g.id] ? 'on' : ''} aria-pressed={groups[g.id]} onClick={() => matchActions.setGroup(g.id, !groups[g.id])} title={`Copy ${g.label.toLowerCase()} settings`}>
            {g.label}
          </button>
        ))}
      </span>
      <span className="mb-sep" />
      {node && (
        <>
          <button className="mb-btn" disabled={!targets} onClick={matchActions.applyToSelection} title="Apply to every selected object">
            Apply to selection{targets ? ` (${targets})` : ''}
          </button>
          <button className="mb-btn" onClick={matchActions.repick} title="Pick a different source (or Ctrl+click it)">
            New source
          </button>
        </>
      )}
      <button className="mb-btn primary" onClick={matchActions.exit} title="Finish (Esc or M)">
        Done
      </button>
    </div>
  );
}

export function EyedropperIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.2 2.6a1.9 1.9 0 0 1 2.7 2.7l-1.4 1.4.7.7-1.1 1.1-3.4-3.4 1.1-1.1.7.7z" />
      <path d="M8.3 5.8 3.4 10.7 2.8 13.2l2.5-.6 4.9-4.9" />
    </svg>
  );
}
