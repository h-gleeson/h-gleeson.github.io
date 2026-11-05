/// <reference lib="webworker" />
/**
 * Edge extraction, run off the main thread.
 *
 * Vertices are welded by position (so split normals/UVs don't break
 * adjacency), then every unique edge is classified once:
 *   0 smooth pair  — two faces; drawn as crease or silhouette, decided per view in the shader
 *   1 open         — one face (border of an open surface)
 *   2 hard         — material boundary or non-manifold (3+ faces)
 *   3 curve        — imported polyline segment
 *   4 coplanar     — interior of a flat face; only drawn when "all mesh edges" is on
 */

export interface EdgeRequest {
  id: number;
  positions: Float32Array;
  index: Uint32Array | null;
  triMaterial: Uint16Array | null;
  tolerance: number;
  curve: boolean;
}

export interface EdgeResult {
  id: number;
  segments: Float32Array;
  n1: Int8Array;
  n2: Int8Array;
  kind: Uint8Array;
  count: number;
  error?: string;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<EdgeRequest>) => {
  const req = e.data;
  try {
    const r = req.curve ? curveEdges(req) : meshEdges(req);
    ctx.postMessage(r, [r.segments.buffer, r.n1.buffer, r.n2.buffer, r.kind.buffer]);
  } catch (err) {
    const empty = { id: req.id, segments: new Float32Array(0), n1: new Int8Array(0), n2: new Int8Array(0), kind: new Uint8Array(0), count: 0 };
    ctx.postMessage({ ...empty, error: String(err) });
  }
};

function pow2(n: number) {
  let s = 16;
  while (s < n) s *= 2;
  return s;
}

function curveEdges(req: EdgeRequest): EdgeResult {
  const count = req.positions.length / 6;
  return { id: req.id, segments: req.positions, n1: new Int8Array(count * 3), n2: new Int8Array(count * 3), kind: new Uint8Array(count).fill(3), count };
}

function meshEdges(req: EdgeRequest): EdgeResult {
  const pos = req.positions;
  const vCount = pos.length / 3;
  const idx = req.index;
  const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(vCount / 3);
  const inv = 1 / Math.max(req.tolerance, 1e-12);

  // --- weld vertices with an open-addressed hash on quantized positions
  const mask = pow2(vCount * 2) - 1;
  const table = new Int32Array(mask + 1).fill(-1);
  const keys = new Float64Array(vCount * 3);
  const welded = new Float32Array(vCount * 3);
  const remap = new Uint32Array(vCount);
  let unique = 0;
  for (let v = 0; v < vCount; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const qx = Math.round(x * inv), qy = Math.round(y * inv), qz = Math.round(z * inv);
    let h = (Math.imul(qx | 0, 73856093) ^ Math.imul(qy | 0, 19349663) ^ Math.imul(qz | 0, 83492791)) & mask;
    let found = -1;
    for (;;) {
      const slot = table[h];
      if (slot < 0) break;
      if (keys[slot * 3] === qx && keys[slot * 3 + 1] === qy && keys[slot * 3 + 2] === qz) {
        found = slot;
        break;
      }
      h = (h + 1) & mask;
    }
    if (found < 0) {
      found = unique++;
      table[h] = found;
      keys[found * 3] = qx; keys[found * 3 + 1] = qy; keys[found * 3 + 2] = qz;
      welded[found * 3] = x; welded[found * 3 + 1] = y; welded[found * 3 + 2] = z;
    }
    remap[v] = found;
  }
  const corner = (t: number, k: number) => remap[idx ? idx[t * 3 + k] : t * 3 + k];

  // --- face normals
  const fn = new Float32Array(triCount * 3);
  const degenerate = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = corner(t, 0), b = corner(t, 1), c = corner(t, 2);
    if (a === b || b === c || a === c) { degenerate[t] = 1; continue; }
    const ax = welded[a * 3], ay = welded[a * 3 + 1], az = welded[a * 3 + 2];
    const ux = welded[b * 3] - ax, uy = welded[b * 3 + 1] - ay, uz = welded[b * 3 + 2] - az;
    const vx = welded[c * 3] - ax, vy = welded[c * 3 + 1] - ay, vz = welded[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-30) { degenerate[t] = 1; continue; }
    fn[t * 3] = nx / len; fn[t * 3 + 1] = ny / len; fn[t * 3 + 2] = nz / len;
  }

  // --- unique edges with up to two adjacent faces and a face counter
  const maxEdges = triCount * 3;
  const emask = pow2(maxEdges * 1.5) - 1;
  const etable = new Int32Array(emask + 1).fill(-1);
  const ea = new Uint32Array(maxEdges), eb = new Uint32Array(maxEdges);
  const f1 = new Int32Array(maxEdges), f2 = new Int32Array(maxEdges).fill(-1);
  const faces = new Uint8Array(maxEdges);
  let edges = 0;
  for (let t = 0; t < triCount; t++) {
    if (degenerate[t]) continue;
    for (let k = 0; k < 3; k++) {
      const p = corner(t, k), q = corner(t, (k + 1) % 3);
      const lo = p < q ? p : q, hi = p < q ? q : p;
      let h = (Math.imul(lo, 2654435761) ^ Math.imul(hi, 40503)) & emask;
      let e = -1;
      for (;;) {
        const slot = etable[h];
        if (slot < 0) break;
        if (ea[slot] === lo && eb[slot] === hi) { e = slot; break; }
        h = (h + 1) & emask;
      }
      if (e < 0) {
        e = edges++;
        etable[h] = e;
        ea[e] = lo; eb[e] = hi; f1[e] = t; faces[e] = 1;
      } else {
        if (faces[e] < 255) faces[e]++;
        if (f2[e] < 0) f2[e] = t;
      }
    }
  }

  const mat = req.triMaterial;
  const segments = new Float32Array(edges * 6);
  const n1 = new Int8Array(edges * 3), n2 = new Int8Array(edges * 3);
  const kind = new Uint8Array(edges);
  for (let e = 0; e < edges; e++) {
    const a = f1[e], b = f2[e];
    let k: number;
    if (b < 0) k = 1;
    else if (faces[e] > 2 || (mat && mat[a] !== mat[b])) k = 2;
    else {
      const d = fn[a * 3] * fn[b * 3] + fn[a * 3 + 1] * fn[b * 3 + 1] + fn[a * 3 + 2] * fn[b * 3 + 2];
      k = d > 0.99999 ? 4 : 0;
    }
    kind[e] = k;
    const p = ea[e], q = eb[e];
    segments.set([welded[p * 3], welded[p * 3 + 1], welded[p * 3 + 2], welded[q * 3], welded[q * 3 + 1], welded[q * 3 + 2]], e * 6);
    const bb = b < 0 ? a : b;
    for (let c = 0; c < 3; c++) {
      n1[e * 3 + c] = Math.round(fn[a * 3 + c] * 127);
      n2[e * 3 + c] = Math.round(fn[bb * 3 + c] * 127);
    }
  }
  return { id: req.id, segments, n1, n2, kind, count: edges };
}
