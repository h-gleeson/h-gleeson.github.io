import type { BufferGeometry, Object3D } from 'three';
import type { ModelFormat } from '../state/types';
import { collectDrawables, type Drawable } from './drawables';
import type { EdgeRequest, EdgeResult } from './edgeWorker';
import { parseModel, type SourceFile } from './loaders';

/**
 * Holds the immutable imported source for every model: original file bytes
 * (for saving projects) and the parsed drawables (geometry + materials).
 * Scene nodes refer into this by (model, index); styling never touches it.
 */

export interface EdgeData {
  segments: Float32Array;
  n1: Int8Array;
  n2: Int8Array;
  kind: Uint8Array;
  count: number;
}

export interface ParsedModel {
  id: string;
  format: ModelFormat;
  files: SourceFile[];
  root: Object3D;
  drawables: Drawable[];
  edges: (EdgeData | null)[];
  warnings: string[];
}

// ---------- edge worker pool

class EdgePool {
  private workers: Worker[] = [];
  private pending = new Map<number, (r: EdgeResult) => void>();
  private next = 0;
  private rr = 0;

  private ensure() {
    if (this.workers.length) return;
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./edgeWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<EdgeResult>) => {
        const done = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        done?.(e.data);
      };
      this.workers.push(w);
    }
  }

  run(req: Omit<EdgeRequest, 'id'>): Promise<EdgeResult> {
    this.ensure();
    const id = ++this.next;
    const w = this.workers[this.rr++ % this.workers.length];
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      const transfer: Transferable[] = [req.positions.buffer as ArrayBuffer];
      if (req.index) transfer.push(req.index.buffer as ArrayBuffer);
      if (req.triMaterial) transfer.push(req.triMaterial.buffer as ArrayBuffer);
      w.postMessage({ ...req, id }, transfer);
    });
  }
}

const pool = new EdgePool();

function triMaterials(g: BufferGeometry): Uint16Array | null {
  if (!g.groups.length) return null;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
  const out = new Uint16Array(tris);
  for (const grp of g.groups) {
    const s = Math.floor(grp.start / 3);
    const e = Math.min(tris, Math.floor((grp.start + grp.count) / 3));
    for (let t = s; t < e; t++) out[t] = grp.materialIndex ?? 0;
  }
  return out;
}

function tolerance(g: BufferGeometry) {
  if (!g.boundingBox) g.computeBoundingBox();
  const size = g.boundingBox!.max.distanceTo(g.boundingBox!.min);
  return Math.max(size * 1e-6, 1e-9);
}

// ---------- registry

type Listener = () => void;

class ModelRegistry {
  models = new Map<string, ParsedModel>();
  private listeners = new Set<Listener>();
  private queued = false;
  edgeJobs = { total: 0, done: 0 };

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.listeners.forEach((l) => l());
    });
  }

  async add(id: string, format: ModelFormat, files: SourceFile[]): Promise<ParsedModel> {
    // Keep pristine copies of the bytes; loaders may transfer or detach buffers.
    const kept = files.map((f) => ({ name: f.name, data: f.data.slice(0) }));
    const { root, warnings } = await parseModel(files[0], files.slice(1), format);
    const { list } = collectDrawables(root, format);
    const model: ParsedModel = { id, format, files: kept, root, drawables: list, edges: list.map(() => null), warnings };
    this.models.set(id, model);
    this.computeEdges(model);
    return model;
  }

  /** Re-collect the object→drawable map from a parsed model (used by the import step). */
  drawableMap(model: ParsedModel) {
    const byObject = new Map<Object3D, number>();
    model.drawables.forEach((d) => byObject.set(d.object, d.index));
    return { list: model.drawables, byObject };
  }

  private computeEdges(model: ParsedModel) {
    for (const d of model.drawables) {
      const g = d.geometry;
      this.edgeJobs.total++;
      pool
        .run({
          positions: (g.attributes.position.array as Float32Array).slice(),
          index: g.index ? Uint32Array.from(g.index.array) : null,
          triMaterial: d.kind === 'mesh' ? triMaterials(g) : null,
          tolerance: tolerance(g),
          curve: d.kind === 'line',
        })
        .then((r) => {
          this.edgeJobs.done++;
          if (!this.models.has(model.id)) return;
          if (r.error) console.warn('Edge extraction failed for', d.name, r.error);
          model.edges[d.index] = { segments: r.segments, n1: r.n1, n2: r.n2, kind: r.kind, count: r.count };
          this.notify();
        });
    }
    this.notify();
  }

  get(id: string) {
    return this.models.get(id);
  }

  remove(id: string) {
    this.models.delete(id);
    this.notify();
  }

  clear() {
    this.models.clear();
    this.edgeJobs = { total: 0, done: 0 };
    this.notify();
  }
}

export const registry = new ModelRegistry();
