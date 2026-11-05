import { ExportCancelled } from '../engine/Engine';
import { getEngine } from '../engine/engineRef';
import { store } from '../state/store';
import { download, safeFileName } from './projectFile';

/** Render the drawing frame to PNG with progress, cancel and readable errors. */
export async function exportPNG() {
  const engine = getEngine();
  const { doc, ui } = store.get();
  if (ui.busy) return;
  if (!engine) return store.status('The viewport is not ready yet.', 'error');
  if (!doc.roots.length) return store.status('Import a model before exporting.', 'error');
  const { width: W, height: H } = doc.output;
  const signal = { cancelled: false };
  const label = `Exporting ${W} × ${H} PNG`;
  const cancel = () => {
    signal.cancelled = true;
  };
  store.setUI({ busy: { label, progress: 0, cancel } });
  const t0 = performance.now();
  try {
    const blob = await engine.exportPNG((p) => store.setUI({ busy: { label, progress: p, cancel } }), signal);
    const name = `${safeFileName(doc.output.fileName || doc.name)}_${W}x${H}.png`;
    download(blob, name);
    store.status(`Exported ${name} · ${(blob.size / 1e6).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    if (e instanceof ExportCancelled) store.status('Export cancelled');
    else {
      console.error(e);
      store.status(`Export failed: ${(e as Error).message}`, 'error');
    }
  } finally {
    store.setUI({ busy: null });
  }
}
