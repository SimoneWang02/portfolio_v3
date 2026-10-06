// Pins the hoodie cuffs to the forearms. Mixamo's auto-skinning ramps the hand bone's weight across the
// whole cuff (about half by the hem), so whenever the wrist turns (a high five, palm to the screen) the
// end of the sleeve swings partway with the hand and folds over the heel of the palm. Here the hand's
// weight is capped by a ramp along the forearm axis that starts at the hem: the sleeve stays on the
// forearm and the wrist bends on the skin just past it. (Cutting only the cuff-colored vertices loose
// tears the hem away from the skin it's stitched to.)
// usage: node scripts/cuff-weights.mjs <in.glb> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [, , src, out] = process.argv;

// distances past the wrist joint toward the fingers (mesh units; the hand is ~0.1 long and the cuff's
// hem tucks in to meet the skin at ~0.01-0.02): no hand weight before RAMP[0], full by RAMP[1]
const RAMP = [0.005, 0.045];
const RADIUS = 0.08; // around the forearm axis: the sleeve, not the hip next to it

const doc = await new NodeIO().read(src);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const names = skin.listJoints().map((j) => j.getName());
const prim = root.listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute("POSITION").getArray();
const J = prim.getAttribute("JOINTS_0").getArray(), W = prim.getAttribute("WEIGHTS_0").getArray();
const n = P.length / 3;

// a joint's bind position in mesh space, from its (rigid) inverse bind matrix: -Rᵀt
const IBM = skin.getInverseBindMatrices().getArray();
function jointPos(j) {
  const m = IBM.subarray(j * 16, j * 16 + 16);
  return [0, 1, 2].map((r) => -(m[r * 4] * m[12] + m[r * 4 + 1] * m[13] + m[r * 4 + 2] * m[14]));
}

for (const side of ["Left", "Right"]) {
  const fore = names.indexOf(`mixamorig:${side}ForeArm`), hand = names.indexOf(`mixamorig:${side}Hand`);
  const isHand = (j) => names[j].startsWith(`mixamorig:${side}Hand`); // the hand and its fingers
  const a = jointPos(fore), h = jointPos(hand);
  const len = Math.hypot(...h.map((v, k) => v - a[k]));
  const u = h.map((v, k) => (v - a[k]) / len);
  let moved = 0, total = 0;
  for (let i = 0; i < n; i++) {
    const d = [0, 1, 2].map((k) => P[i * 3 + k] - h[k]);
    const along = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    if (along >= RAMP[1] || Math.hypot(...d.map((v, k) => v - along * u[k])) > RADIUS) continue;
    const t = Math.min(1, Math.max(0, (along - RAMP[0]) / (RAMP[1] - RAMP[0])));
    const cap = t * t * (3 - 2 * t);
    let w = 0;
    for (let k = 0; k < 4; k++) if (isHand(J[i * 4 + k])) w += W[i * 4 + k];
    if (w <= cap) continue;
    const scale = cap / w, freed = w - cap;
    for (let k = 0; k < 4; k++) if (isHand(J[i * 4 + k])) W[i * 4 + k] *= scale;
    // the forearm takes it: its existing slot, else the lightest one (a displaced light influence goes too)
    let slot = -1;
    for (let k = 0; k < 4; k++) if (J[i * 4 + k] === fore && W[i * 4 + k] > 0) slot = k;
    if (slot < 0) {
      slot = 0;
      for (let k = 1; k < 4; k++) if (W[i * 4 + k] < W[i * 4 + slot]) slot = k;
      J[i * 4 + slot] = fore;
    }
    W[i * 4 + slot] = Math.min(1, W[i * 4 + slot] + freed); // float32 rounding would stop meshopt quantizing
    moved++; total += freed;
  }
  console.log(`${side} cuff: ${moved} vertices, ${total.toFixed(1)} total hand weight moved to the forearm`);
}

prim.getAttribute("JOINTS_0").setArray(J);
prim.getAttribute("WEIGHTS_0").setArray(W);
mkdirSync(dirname(out), { recursive: true });
await new NodeIO().write(out, doc);
