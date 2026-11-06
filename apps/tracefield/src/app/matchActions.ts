import { applyMatch, MATCH_GROUPS, matchValues, type MatchGroup } from '../state/match';
import { store } from '../state/store';

const ui = () => store.get().ui;
const doc = () => store.get().doc;
const nameOf = (id: string) => doc().nodes[id]?.name ?? 'object';

function groupsLabel() {
  const on = MATCH_GROUPS.filter((g) => ui().matchGroups[g.id]).map((g) => g.label.toLowerCase());
  return on.length === MATCH_GROUPS.length ? 'all properties' : on.join(', ');
}

function setSource(id: string) {
  store.setUI({ matchSource: id });
  store.status(`Matching ${nameOf(id)} (${groupsLabel()}): click objects to apply to their whole group. Alt+click for just one mesh, Ctrl+click for a new source, Esc to finish`);
}

/** Match properties (MATCHPROP): pick a source, then click targets to copy its style. */
export const matchActions = {
  /** Start the tool. With one object selected, it becomes the source straight away. */
  start() {
    const s = ui().selection.filter((id) => doc().nodes[id]);
    store.setUI({ tool: 'match', matchSource: null, label: null });
    if (s.length === 1) setSource(s[0]);
    else store.status('Match properties: click the object to copy from (its whole group; Alt+click for just that mesh)');
  },
  exit() {
    store.setUI({ tool: 'select', matchSource: null });
    store.status('Select tool');
  },
  toggle() {
    if (ui().tool === 'match') matchActions.exit();
    else matchActions.start();
  },
  /** Pick a different source. */
  repick() {
    store.setUI({ matchSource: null });
    store.status('Click the object to copy from');
  },
  setGroup(g: MatchGroup, on: boolean) {
    store.setUI({ matchGroups: { ...ui().matchGroups, [g]: on } });
  },

  /** Viewport click while the tool is active. Ctrl+click picks a new source. */
  click(id: string | null, newSource = false) {
    if (!id) return;
    const src = ui().matchSource;
    if (!src || newSource || !doc().nodes[src]) return setSource(id);
    if (id === src) return store.status('That is the source — click another object');
    matchActions.applyTo([id]);
  },

  /** Copy the source's properties onto the given objects (one undo step). */
  applyTo(ids: string[]) {
    const src = ui().matchSource;
    if (!src || !doc().nodes[src]) return store.status('Pick an object to copy from first');
    const targets = ids.filter((id) => id !== src && doc().nodes[id]);
    if (!targets.length) return store.status('Select the objects to apply to');
    if (!MATCH_GROUPS.some((g) => ui().matchGroups[g.id])) return store.status('Turn on at least one property group to copy');
    const values = matchValues(doc(), src, ui().matchGroups);
    store.setDoc((d) => applyMatch(d, targets, values));
    const who = targets.length === 1 ? nameOf(targets[0]) : `${targets.length} objects`;
    store.status(`Matched ${who} to ${nameOf(src)} (${groupsLabel()}) — Ctrl+Z to undo`);
  },
  applyToSelection() {
    matchActions.applyTo(ui().selection);
  },
};
