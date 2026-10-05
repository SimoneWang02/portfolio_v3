// Adds an "eyesShut" morph target to the chibi: the sculpted eyeballs and lid folds are pressed flush with
// the skin around them, so painted-shut lids (see src/chibi/face.js) read as smooth skin rather than a
// lid stretched over a bulge. The skin under each lid is a membrane stretched across from the skin around it.
// usage: node scripts/eye-morph.mjs <in.glb> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [, , src, out] = process.argv;

// eye centers and radii as fractions of the bind-pose bounding box; keep in sync with FACE_GLSL in face.js
const EYES = [[0.3755, 0.7255], [0.6185, 0.7255]];
const EYE_SIZE = [0.066, 0.026];
const FLAT = 1.1, FADE = 1.4;           // fully flattened inside FLAT (in eye radii), fading out by FADE
const CELL = 0.004;                      // height-grid cell, in bbox fractions

const doc = await new NodeIO().read(src);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute("POSITION").getArray(), N = prim.getAttribute("NORMAL").getArray();
const n = P.length / 3;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i * 3 + k]); max[k] = Math.max(max[k], P[i * 3 + k]); }
const size = max.map((v, k) => v - min[k]);
const frac = (i, k) => (P[i * 3 + k] - min[k]) / size[k];

const dPos = new Float32Array(n * 3), dNorm = new Float32Array(n * 3);
let moved = 0;
for (const [ex, ey] of EYES) {
  // height grid over the eye and a margin: the front-most surface in each cell
  const hx = EYE_SIZE[0] * (FADE + 0.4), hy = EYE_SIZE[1] * (FADE + 0.4);
  const W = Math.ceil(2 * hx / CELL) + 1, H = Math.ceil(2 * hy / CELL) + 1;
  const gx = (c) => ex - hx + c * CELL, gy = (r) => ey - hy + r * CELL;
  const rOf = (x, y) => Math.hypot((x - ex) / EYE_SIZE[0], (y - ey) / EYE_SIZE[1]);
  let z = new Float64Array(W * H).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (frac(i, 2) < 0.6 || N[i * 3 + 2] < 0.2) continue;
    const c = Math.round((frac(i, 0) - gx(0)) / CELL), r = Math.round((frac(i, 1) - gy(0)) / CELL);
    if (c < 0 || r < 0 || c >= W || r >= H) continue;
    const j = r * W + c;
    if (!(z[j] >= frac(i, 2))) z[j] = frac(i, 2);
  }
  // fill empty cells from their neighbours
  for (let pass = 0; pass < 20 && z.some(Number.isNaN); pass++) {
    const nz = z.slice();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!Number.isNaN(z[r * W + c])) continue;
      let s = 0, k = 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = z[(r + dr) * W + (c + dc)];
        if (c + dc >= 0 && c + dc < W && r + dr >= 0 && r + dr < H && !Number.isNaN(v)) { s += v; k++; }
      }
      if (k) nz[r * W + c] = s / k;
    }
    z = nz;
  }
  // membrane: cells inside FLAT relax to the average of their neighbours (Laplace), the skin around them fixed
  const inside = Array.from({ length: W * H }, (_, j) => rOf(gx(j % W), gy(Math.floor(j / W))) < FLAT + 0.15);
  const before = z.slice();
  for (let it = 0; it < 3000; it++) {
    for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) {
      const j = r * W + c;
      if (inside[j]) z[j] = (z[j - 1] + z[j + 1] + z[j - W] + z[j + W]) / 4;
    }
  }
  const sample = (x, y) => {               // bilinear
    const fc = Math.min(W - 1.001, Math.max(0, (x - gx(0)) / CELL)), fr = Math.min(H - 1.001, Math.max(0, (y - gy(0)) / CELL));
    const c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r;
    const a = z[r * W + c], b = z[r * W + c + 1], d = z[(r + 1) * W + c], e = z[(r + 1) * W + c + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (d * (1 - u) + e * u) * v;
  };
  let maxDrop = 0;
  for (let j = 0; j < W * H; j++) if (inside[j]) maxDrop = Math.max(maxDrop, before[j] - z[j]);

  let maxDz = 0;
  for (let i = 0; i < n; i++) {
    const x = frac(i, 0), y = frac(i, 1), ri = rOf(x, y);
    if (ri >= FADE || frac(i, 2) < 0.6) continue;
    const t = Math.min(1, Math.max(0, (ri - FLAT) / (FADE - FLAT)));
    const w = 1 - t * t * (3 - 2 * t);
    const dz = (sample(x, y) - frac(i, 2)) * w;
    dPos[i * 3 + 2] = dz * size[2];
    maxDz = Math.max(maxDz, Math.abs(dz));
    // membrane normal in model units: (-dz/dX, -dz/dY, 1)
    const e = CELL / 2;
    const sx = (sample(x + e, y) - sample(x - e, y)) / (2 * e) * size[2] / size[0];
    const sy = (sample(x, y + e) - sample(x, y - e)) / (2 * e) * size[2] / size[1];
    let nx = -sx, ny = -sy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
    let mx = o[0] + (nx - o[0]) * w, my = o[1] + (ny - o[1]) * w, mz = o[2] + (nz - o[2]) * w;
    const ml = Math.hypot(mx, my, mz) || 1;
    dNorm[i * 3] = mx / ml - o[0]; dNorm[i * 3 + 1] = my / ml - o[1]; dNorm[i * 3 + 2] = mz / ml - o[2];
    moved++;
  }
  console.log(`eye (${ex}, ${ey}): ${W}x${H} grid, bulge flattened by up to ${maxDrop.toFixed(4)}, max vertex push ${maxDz.toFixed(4)} (bbox fractions)`);
}

const buf = doc.getRoot().listBuffers()[0];
const target = doc.createPrimitiveTarget("eyesShut")
  .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(dPos).setBuffer(buf))
  .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(dNorm).setBuffer(buf));
prim.addTarget(target);
const mesh = doc.getRoot().listMeshes()[0];
mesh.setWeights([0]).setExtras({ ...mesh.getExtras(), targetNames: ["eyesShut"] });

mkdirSync(dirname(out), { recursive: true });
await new NodeIO().write(out, doc);
console.log(`${moved} vertices in the eyesShut morph -> ${out}`);
