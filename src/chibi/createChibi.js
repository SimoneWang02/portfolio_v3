import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { addFace } from "./face.js";
import { spring, stepSpring } from "./spring.js";
import { GREETING, NAME } from "../content.js";

const MODEL_URL = "/chibi-rigged.glb"; // Tripo mesh + Mixamo rig, webp textures + meshopt (1.2 MB)

// face uniforms (driven every frame). There's only ever one chibi, so these live at module level
// alongside the cached model whose material references them.
const faceU = {
  uBMin: { value: new THREE.Vector3() }, uBMax: { value: new THREE.Vector3(1, 1, 1) },
  uBlink: { value: 0 },  // 0 open .. 1 closed
  uMouth: { value: 0 },  // 0 closed .. 1 wide open
  uHappy: { value: 0 },  // 0 .. 1: eyes shut in happy arches, a toothy grin, blush
};

// "eyesShut" morph (scripts/eye-morph.mjs): flattens the sculpted eyes so painted-shut lids lie smooth
let eyesShut = null; // { influences, index }

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// Bones are posed with rotations expressed in the model's own frame (x: screen right, y: up, z: toward
// the camera), so the code doesn't depend on each Mixamo bone's local axes.
// bone.quaternion = parent⁻¹ · q · parent · rest, where `parent` is the parent's rest orientation in model space.
function rigBone(model, name) {
  const bone = model.getObjectByName(name);
  if (!bone) throw new Error(`model is missing bone ${name}`);
  const p = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  return { bone, rest: bone.quaternion.clone(), p, pInv: p.clone().invert() };
}
function poseBone(r, q) { r.bone.quaternion.copy(r.pInv).multiply(q).multiply(r.p).multiply(r.rest); }

// orientation of a hand frame: fingers along `f`, palm facing `n`
const _m = new THREE.Matrix4(), _f = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3();
function handFrame(f, n, out) {
  _f.copy(f).normalize();
  _n.copy(n).addScaledVector(_f, -_n.dot(_f)).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(_f, _n, _s.crossVectors(_f, _n)));
}

function rigArm(model, side) {
  const arm = rigBone(model, `mixamorig${side}Arm`), fore = rigBone(model, `mixamorig${side}ForeArm`);
  const hand = rigBone(model, `mixamorig${side}Hand`);
  const a = arm.bone.getWorldPosition(new THREE.Vector3()), b = fore.bone.getWorldPosition(new THREE.Vector3());
  const dir = b.clone().sub(a).normalize();             // rest (A-pose) upper-arm direction
  const h = hand.bone.getWorldPosition(new THREE.Vector3());
  const foreDir = h.clone().sub(b).normalize();           // rest forearm direction
  return {
    arm, fore, hand, dir, foreDir,
    handRest: hand.bone.getWorldQuaternion(new THREE.Quaternion()),          // model space
    palmRestInv: handFrame(foreDir, new THREE.Vector3(0, -1, 0), new THREE.Quaternion()).invert(), // fingers along the forearm, palm down
    len: a.distanceTo(b) + b.distanceTo(h),             // shoulder -> wrist
    sign: Math.sign(dir.x),                             // +1: arm on the screen-right side
    elbowAxis: new THREE.Vector3().crossVectors(dir, Z).normalize(), // +angle bends the forearm forward
  };
}

// 3D name tag: a thick white pill with the name printed on the front and back (so it still reads
// mid-spin). Sized to the text; the text is redrawn once the Fredoka web font has loaded.
function makeNameTag(text, maxAnisotropy) {
  const H = 0.28, D = 0.06, PAD = 0.14, TEXT_H = 0.15;    // world units
  const PX = 1024;  // canvas pixels per world unit: ~2x what a 2x-DPR desktop shows, so text stays crisp
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `700 ${TEXT_H * PX}px Fredoka, system-ui, sans-serif`;
  ctx.font = font;
  const W = ctx.measureText(text).width / PX + PAD * 2;
  canvas.width = Math.ceil(W * PX); canvas.height = Math.ceil(H * PX);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent2").trim();
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + TEXT_H * PX * 0.06);
    tex.needsUpdate = true;
  }
  draw();
  document.fonts?.load(font).then(draw, () => {});

  // rounded-rect (pill) outline, extruded for thickness
  const r = H / 2, w = W / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -r); shape.lineTo(w, -r);
  shape.absarc(w, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-w, r);
  shape.absarc(-w, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  const pillGeo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 24 });
  pillGeo.translate(0, 0, -D / 2);
  const pillMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const textGeo = new THREE.PlaneGeometry(W, H);
  const textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(pillGeo, pillMat));
  const front = new THREE.Mesh(textGeo, textMat);
  front.position.z = D / 2 + 0.016;
  const back = new THREE.Mesh(textGeo, textMat);
  back.position.z = -front.position.z; back.rotation.y = Math.PI;
  group.add(front, back);
  return {
    group,
    dispose() { pillGeo.dispose(); pillMat.dispose(); textGeo.dispose(); textMat.dispose(); tex.dispose(); },
  };
}

// Load + prepare the model once; navigating away and back to the landing page reuses it.
let modelPromise = null;
const progressListeners = new Set();
function loadModel() {
  if (modelPromise) return modelPromise;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  modelPromise = new Promise((resolve, reject) => {
    loader.load(MODEL_URL, (gltf) => {
      const model = gltf.scene;
      // normalize: height 2, feet on ground, centered
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(2 / size.y);
      const box2 = new THREE.Box3().setFromObject(model);
      const c = box2.getCenter(new THREE.Vector3());
      model.position.sub(new THREE.Vector3(c.x, box2.min.y, c.z));
      model.updateMatrixWorld(true);

      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;   // self-shadowing: the texture has no baked lighting
        o.frustumCulled = false;                 // bounds don't follow the bones
        // face effects work in the mesh's own bind-pose space
        o.geometry.computeBoundingBox();
        faceU.uBMin.value.copy(o.geometry.boundingBox.min); faceU.uBMax.value.copy(o.geometry.boundingBox.max);
        // matte, no metal; keep the roughness map and full-strength normal map for surface detail
        const m = o.material;
        m.metalness = 0;
        m.metalnessMap = null;
        addFace(m, faceU);
        const k = o.morphTargetDictionary?.eyesShut;
        if (k !== undefined) eyesShut = { influences: o.morphTargetInfluences, index: k };
      });
      const arms = [rigArm(model, "Left"), rigArm(model, "Right")];
      model.userData.rig = {
        neck: rigBone(model, "mixamorigNeck"),
        head: rigBone(model, "mixamorigHead"),
        spine: rigBone(model, "mixamorigSpine2"),
        // head's rest pose in the model's parent space (the model isn't parented yet), for the name tag
        headRest: {
          pos: model.getObjectByName("mixamorigHead").getWorldPosition(new THREE.Vector3()),
          q: model.getObjectByName("mixamorigHead").getWorldQuaternion(new THREE.Quaternion()),
        },
        right: arms.find((a) => a.sign > 0), // screen-right arm
        left: arms.find((a) => a.sign < 0),  // screen-left arm
      };
      progressListeners.clear();
      resolve(model);
    }, (e) => {
      if (e.total) progressListeners.forEach((fn) => fn(e.loaded / e.total));
    }, (err) => {
      modelPromise = null; // allow a retry on the next mount
      reject(err);
    });
  });
  return modelPromise;
}

// scratch objects for posing
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// arm pose: `out` = angle from straight down (outward), `fwd` = raise forward, `bend` = elbow bend (forward),
// `curl` = elbow bend in the screen plane (+ swings the forearm up/in toward the head), `twist` = forearm roll (radians)
function poseArm(a, { out, fwd, bend, curl = 0, twist = 0 }) {
  _v.set(a.sign * Math.sin(out), -Math.cos(out), 0);
  _q.setFromUnitVectors(a.dir, _v);                    // lower from the A-pose
  _q2.setFromAxisAngle(X, -fwd);                       // then swing forward
  poseBone(a.arm, _q2.multiply(_q));
  _q.setFromAxisAngle(Z, curl * a.sign)
    .multiply(_q2.setFromAxisAngle(a.elbowAxis, bend))
    .multiply(_q3.setFromAxisAngle(a.foreDir, twist * a.sign));
  poseBone(a.fore, _q);
}

// turn the wrist so the palm faces `palmDir` with the fingers pointing up (model space), blended by `w`;
// `tilt` leans the fingers outward (+) / inward (-)
const _q4 = new THREE.Quaternion(), _up = new THREE.Vector3();
function aimPalm(model, a, palmDir, w, tilt = 0) {
  _up.set(a.sign * (0.25 + tilt), 1, 0);                                // fingers up, a little outward
  handFrame(_up, palmDir, _q3).multiply(a.palmRestInv).multiply(a.handRest); // wanted, model space
  model.getWorldQuaternion(_q4).invert().multiply(a.fore.bone.getWorldQuaternion(_q2)); // forearm, model space
  _q4.invert().multiply(_q3);                                           // -> hand's local rotation
  a.hand.bone.quaternion.copy(a.hand.rest).slerp(_q4, w);
}

const GRAVITY = 16, HOP_H = 0.35;  // a full-power hop: 0.35 units high, ~0.4 s in the air

const ARM_KEYS = ["out", "fwd", "bend", "curl", "twist"];
const _js = spring(); // scratch for springPose
// spring each joint angle of `cur` (velocities in `vel`) toward `target`
function springPose(cur, vel, target, freq, zeta, dt) {
  for (const key of ARM_KEYS) {
    _js.x = cur[key]; _js.v = vel[key];
    stepSpring(_js, target[key] ?? 0, freq, zeta, dt);
    cur[key] = _js.x; vel[key] = _js.v;
  }
}

/**
 * Mounts the chibi into `container` (which must be position: relative/absolute/fixed).
 * `mini`: start in the small companion framing (see setMini).
 * Returns controls for the chat to drive, plus dispose().
 */
export function createChibi(container, { mini = false, onProgress, onLoaded, onError } = {}) {
  let disposed = false;
  let width = container.clientWidth || 1, height = container.clientHeight || 1;

  // ---------- scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps skin tones true (ACES muddies them)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // soft studio reflections so PBR surfaces don't go dark/blotchy
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
  camera.position.set(0, 1.1, 5.2);

  // The texture is flat albedo (no baked shading), so the lights do the modelling: a warm key from
  // above-right that casts soft shadows (hair on forehead, arms on hoodie), a weaker cool fill, and a
  // lilac rim to separate the dark hair/hoodie from the background.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9d5ff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e8, 2.4);
  key.position.set(2, 4, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.6, bottom: -0.2, near: 0.5, far: 12 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe0f2fe, 0.7); // front-left fill, keeps the shadow side readable
  fill.position.set(-3, 1.5, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xc4b5fd, 2.0);
  rim.position.set(-2.5, 3, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xfbcfe8, 1.2);
  rim2.position.set(3, 2, -2.5); scene.add(rim2);

  // soft blob shadow on the "floor", shrinks while hopping
  const blobCanvas = document.createElement("canvas");
  blobCanvas.width = blobCanvas.height = 128;
  const g2 = blobCanvas.getContext("2d");
  const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(30,27,75,0.35)"); grad.addColorStop(1, "rgba(30,27,75,0)");
  g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
  const blobTex = new THREE.CanvasTexture(blobCanvas);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.002;
  scene.add(blob);

  // rig: root (position/hop) -> body (rotation/squash) -> model
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body); scene.add(root);

  // name tag floats above the head, rigidly following it (placed every frame; see animate)
  const TAG_Y = 2.2;          // height above the feet in the rest pose
  const tag = makeNameTag(NAME, renderer.capabilities.getMaxAnisotropy());
  tag.group.visible = false;  // until the model is in
  scene.add(tag.group);

  let model = null;

  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }

  const progressFn = (f) => onProgress?.(f);
  progressListeners.add(progressFn);
  loadModel().then((m) => {
    if (disposed) return;
    model = m;
    body.add(model);
    onLoaded?.();
    hop(1); // say hi
    later(() => { waveT = 0; grin(1.6); }, 250); // ...and wave, beaming, then say the greeting once the wave is done
  }, (err) => {
    if (disposed) return;
    console.error(err);
    onError?.(`Couldn't load ${MODEL_URL}`);
  });

  // ---------- animation state ----------
  // pointer relative to the stage, so the chibi looks toward the chat panel when you're typing there
  const pointer = new THREE.Vector2();
  const cursorPx = new THREE.Vector2(-1e4, -1e4); // pointer in stage pixels, for the cursor hint + high five
  let cursorMoved = false, hoverAt = 0;
  function onPointerMove(e) {
    const r = container.getBoundingClientRect();
    cursorPx.set(e.clientX - r.left, e.clientY - r.top);
    cursorMoved = true;
    wake();
    const clamp = THREE.MathUtils.clamp;
    pointer.set(
      clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.1, 1.1),
      clamp(-((e.clientY - r.top) / r.height) * 2 + 1, -1.1, 1.1));
  }
  addEventListener("pointermove", onPointerMove);
  addEventListener("keydown", wake); // typing in the chat
  const onPointerLeave = () => cursorPx.set(-1e4, -1e4);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);

  let mood = "idle"; // idle | thinking | talking
  // hop: a short crouch (anticipation), then a ballistic jump. Squash & stretch is a jelly spring kicked at
  // takeoff and landing, and the head and arms get kicked too, so they lag behind and bob after the body.
  let hopPhase = 0, hopT = 0, hopPower = 1, nextHop = 0; // phase 0: grounded, 1: crouching, 2: airborne
  let hopY = 0, hopV = 0;
  const squash = spring(1);
  const spinS = spring(); let spinT = -1; // spin: wind up backwards, whip round, overshoot and settle back
  let nod = 0, nodVel = 0;           // spring for talking nods
  const head = { x: spring(), y: spring(), z: spring() }; // pitch / yaw / roll
  let lastYaw = 0;                   // head yaw target last frame, to blink on big gaze shifts
  const bodyYaw = spring();
  let breathPh = 0;                  // breathing / idle bob phase (slows down while asleep)
  // arm poses (screen-left / screen-right) and their joint velocities
  const armL = { out: 0.3, fwd: 0, bend: 0.2, curl: 0, twist: 0 }, armR = { ...armL };
  const armLv = { out: 0, fwd: 0, bend: 0, curl: 0, twist: 0 }, armRv = { ...armLv };

  // idle fidgets, a few seconds after the visitor goes still: glance around, bounce, tilt the head, stretch
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FIDGET_LEN = { look: 2.4, bounce: 1.2, tilt: 1.8, stretch: 2.2 };
  let fidget = null, fidgetT = 0, fidgetSide = 1, nextFidget = 8;
  // dozing off after a longer quiet spell: eyes drift shut, head droops, breathing slows, z's float up
  const SLEEP_AFTER = 30;
  let lastActive = 0, asleep = false, sleepK = 0;
  const zzz = document.createElement("div");
  zzz.className = "zzz";
  zzz.innerHTML = "<span>z</span><span>z</span><span>Z</span>";
  container.appendChild(zzz);

  // high five: on a click within arm's reach, the arm on that side winds up by the ear,
  // pushes its palm out at the screen onto the click, holds a beat, then drops back down
  let fiveArm = null, fiveHit0 = null; // the arm doing it; its slap pose, aimed so the palm lands on the cursor
  let palmW = 0, palmArm = null;   // how much (and which) wrist is turned palm-out
  let palmTilt = 0;                // fingers leaning side to side while waving

  // wave hello when the page opens: the screen-right arm goes up beside the head and the hand waves
  let waveT = -1;                  // time into the wave, -1 when not playing
  let fiveT = -1, fiveHit = false; // time into the high five (-1: not playing); contact reaction fired
  let grinUntil = 0, grinK = 0;    // happy face (^ ^ and a toothy grin), held until grinUntil
  let lean = 0;                    // forward lean into the slap
  const _px = new THREE.Vector2(), _px2 = new THREE.Vector2();
  function toPx(v, out) { v.project(camera); return out.set((v.x + 1) / 2 * width, (1 - v.y) / 2 * height); }
  // the arm that can reach stage pixel `px` for a high five, or null
  function reachFor(px) {
    const rig = model.userData.rig;
    const H = Math.abs(toPx(_v.set(0, 2, 0), _px).y - toPx(_v.set(0, 0, 0), _px2).y); // chibi height on screen
    const arm = px.x < toPx(_v.set(0, 1.05, 0), _px2).x ? rig.left : rig.right;
    const sh = toPx(arm.arm.bone.getWorldPosition(_v), _px);
    const dx = (px.x - sh.x) * arm.sign, dy = px.y - sh.y;  // outward / downward from the shoulder
    const reach = arm.len * H / 2, d = Math.hypot(dx, dy);
    // beside the body, from shoulder height down to about the waist (not the head, torso or legs)
    return dx > reach * 0.15 && dy > -reach * 0.1 && dy < reach * 1.3 && d < reach * 2 ? arm : null;
  }
  const canHighFive = () => model && fiveT < 0 && waveT < 0 && mood === "idle" && spinT < 0;
  // the palm sits just above the wrist once the hand is turned fingers-up
  const palmCenter = (arm) => arm.hand.bone.getWorldPosition(_v).add(_v2.set(0, 0.07, 0));
  // search arm poses (held forward, toward the screen) for the one whose hand lands nearest `px`
  function aimAt(arm, px) {
    let best = null, bestD = Infinity;
    for (let out = -0.3; out <= 1.51; out += 0.15) {
      for (let fwd = 0.5; fwd <= 2.31; fwd += 0.15) {
        const pose = { out, fwd, bend: 0.5 };
        poseArm(arm, pose);  // overwritten by this frame's real pose below
        const d = toPx(palmCenter(arm), _px2).distanceTo(px);
        if (d < bestD) { bestD = d; best = pose; }
      }
    }
    return best;
  }

  function hop(power = 1) {
    if (hopPhase) { nextHop = Math.max(nextHop, power); return; } // already hopping: go again on landing
    hopPhase = 1; hopT = 0; hopPower = power;
  }
  function spin() { if (spinT < 0) spinT = 0; hop(1.2); grin(1.3); }
  function grin(sec) { grinUntil = Math.max(grinUntil, clock.elapsedTime + sec); }
  function startFidget(name) {
    fidget = name; fidgetT = 0; fidgetSide = Math.random() < 0.5 ? -1 : 1;
    if (name === "bounce") { hop(0.4); nextHop = 0.4; grin(1.2); }
    if (name === "tilt") nudge(0.6);
  }
  // any sign of the visitor: wake up (with a start) and hold off fidgeting for a bit
  function wake() {
    const t = clock.elapsedTime;
    lastActive = t;
    nextFidget = Math.max(nextFidget, t + 4);
    if (asleep) { asleep = false; hop(0.5); nudge(-1.2); }
  }
  function nudge(amount = 1) { nodVel += 3.5 * amount; }

  // --- face: blinking + lip flap ---
  let nextBlink = 1.5, blinkT = -1, doubleBlink = false;
  let speakUntil = 0, mouth = 0;
  const clock = new THREE.Clock();
  // keep the mouth moving for roughly as long as it'd take to say the text (~14 chars/sec)
  function speak(text) {
    const now = clock.elapsedTime;
    speakUntil = Math.max(speakUntil, now) + text.length / 14;
  }

  // high-five impact: a ring, sparks and a little "nice!" popping out of the palm (CSS-animated, see .hi5)
  function burst(at) {
    const el = document.createElement("div");
    el.className = "hi5";
    el.style.left = `${at.x}px`; el.style.top = `${at.y}px`;
    let html = '<div class="hi5-flash"></div><div class="hi5-ring"></div>';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 360 + (Math.random() - 0.5) * 20;
      html += `<i class="hi5-spark${i % 2 ? " alt" : ""}" style="--a:${a}deg;--d:${50 + Math.random() * 30}px"></i>`;
    }
    el.innerHTML = html + '<span class="hi5-text">nice!</span>';
    container.appendChild(el);
    later(() => el.remove(), 1000);
  }

  // click within arm's reach of the chibi -> high five; click on the chibi elsewhere -> spin + hop
  const raycaster = new THREE.Raycaster();
  function onChibi(px) {
    raycaster.setFromCamera(_px2.set(px.x / width * 2 - 1, -px.y / height * 2 + 1), camera);
    return raycaster.intersectObject(model, true).length > 0;
  }
  function onClick(e) {
    if (!model) return;
    if (asleep) { wake(); return; }
    const r = container.getBoundingClientRect();
    const px = new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
    const arm = canHighFive() && reachFor(px);
    if (arm) {
      fiveArm = palmArm = arm; fiveHit0 = aimAt(arm, px);
      fiveT = 0; fiveHit = false;
      return;
    }
    if (onChibi(px)) spin();
  }
  renderer.domElement.addEventListener("click", onClick);

  const lerp = THREE.MathUtils.lerp;
  let frame = 0;

  // mini: the container shrinks to a small draggable box (CSS animates it); the camera moves in to keep
  // the chibi filling it and the name tag shrinks away. miniK eases toward miniT at about the CSS pace.
  let miniT = mini ? 1 : 0, miniK = miniT;
  // full-size framing, frozen while mini so the box's changing aspect mid-shrink doesn't make it jump
  let fullZ = 5.2, fullY = 1.05;
  const frameFull = (aspect) => { fullZ = aspect < 0.8 ? 7 : 5.2; fullY = aspect < 0.8 ? 1.2 : 1.05; };
  frameFull(innerWidth / innerHeight);

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // dozing off when idle and nobody's around for a while; wake() snaps out of it
    const busy = waveT >= 0 || fiveT >= 0 || spinT >= 0 || hopPhase > 0;
    if (!asleep && mood === "idle" && !busy && !fidget && t - lastActive > SLEEP_AFTER) asleep = true;
    sleepK = lerp(sleepK, asleep ? 1 : 0, 1 - Math.exp(-dt * (asleep ? 0.7 : 8)));
    zzz.classList.toggle("on", asleep && sleepK > 0.6);

    // idle fidgets
    if (fidget) {
      fidgetT += dt;
      if (fidgetT > FIDGET_LEN[fidget] || mood !== "idle" || asleep) fidget = null;
    } else if (!reduceMotion && mood === "idle" && !busy && !asleep && t >= nextFidget) {
      startFidget(["look", "bounce", "tilt", "stretch"][Math.floor(Math.random() * 4)]);
      nextFidget = t + 7 + Math.random() * 8;
    }
    // stretch fidget: arms up overhead with a yawn and eyes shut (0 .. 1 .. 0, back to rest 0.5 s before the end)
    const stretchK = fidget === "stretch" ? Math.max(0, Math.min(1, fidgetT / 0.35, (FIDGET_LEN.stretch - 0.5 - fidgetT) / 0.35)) : 0;

    // breathing: a bob and a gentle stretch on the same cycle (the body stretches just ahead of rising)
    breathPh += dt * lerp(2.2, 1.3, sleepK);
    const breath = Math.sin(breathPh);
    let y = Math.sin(breathPh - 0.7) * 0.018 * (1 - sleepK);
    let sqTarget = 1 + breath * 0.013 * (1 + sleepK) + stretchK * 0.04, sqFreq = 3.2, sqZeta = 0.3;

    // hop: crouch, launch, fly, land
    if (hopPhase === 1) {
      hopT += dt;
      sqTarget = 1 - 0.13 * Math.min(hopPower, 1); sqFreq = 7; sqZeta = 0.9;
      if (hopT >= 0.1) {
        hopPhase = 2; hopV = Math.sqrt(2 * GRAVITY * HOP_H * hopPower);
        squash.v += 1.5 * hopPower;                                // spring out of the crouch
        head.x.v -= 0.8 * hopPower;                                // the big head lags: tips back
        armLv.out += 2.5 * hopPower; armRv.out += 2.5 * hopPower;  // arms fling out
      }
    } else if (hopPhase === 2) {
      hopV -= GRAVITY * dt; hopY += hopV * dt;
      sqTarget = 1 + 0.03 * Math.abs(hopV); sqFreq = 5; sqZeta = 0.7; // stretched along the motion
      if (hopY <= 0) {
        const impact = Math.min(-hopV, 4);
        hopY = 0; hopPhase = 0;
        squash.v -= 0.6 * impact;                                  // squash, then jiggle back
        head.x.v += 0.5 * impact;                                  // head bobs forward
        if (nextHop) { const p = nextHop; nextHop = 0; hop(p); }
      }
    }
    stepSpring(squash, sqTarget, sqFreq, sqZeta, dt);
    y += hopY;

    // spin
    if (spinT >= 0) {
      spinT += dt;
      const windup = spinT < 0.12;
      stepSpring(spinS, windup ? -0.35 : Math.PI * 2, windup ? 3 : 1.4, windup ? 0.9 : 0.68, dt);
      if (!windup && Math.abs(spinS.x - Math.PI * 2) < 0.02 && Math.abs(spinS.v) < 0.3) { spinS.x = spinS.v = 0; spinT = -1; }
    }

    // blink: quick close, slower open; sometimes a double blink
    if (blinkT < 0 && t >= nextBlink) { blinkT = 0; doubleBlink = Math.random() < 0.2; }
    let blink = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      const close = 0.07, open = 0.12;
      blink = blinkT < close ? blinkT / close : Math.max(0, 1 - (blinkT - close) / open);
      if (blinkT > close + open) {
        blinkT = -1;
        nextBlink = t + (doubleBlink ? 0.12 : 2 + Math.random() * 3.5);
        if (doubleBlink) doubleBlink = false;
      }
    }
    // thinking: eyes half-lidded while pondering
    faceU.uBlink.value = debugFace?.blink ?? Math.max(blink, mood === "thinking" ? 0.3 : 0, sleepK, stretchK > 0.6 ? 1 : 0);
    grinK = lerp(grinK, t < grinUntil && mood === "idle" ? 1 : 0, 1 - Math.exp(-dt * 12));
    faceU.uHappy.value = debugFace?.happy ?? grinK * (1 - sleepK);
    // flatten the eyes as far as the lids are shut (happy eyes are fully shut from uHappy 0.35; see face.js)
    if (eyesShut) eyesShut.influences[eyesShut.index] = debugFace?.morph ?? Math.max(faceU.uBlink.value, THREE.MathUtils.smoothstep(faceU.uHappy.value, 0, 0.35));

    // mouth: syllable-ish flapping while there's text left to "say"
    const talkingNow = t < speakUntil;
    const target = talkingNow
      ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13 + Math.sin(t * 4.3) * 2)) * (0.6 + 0.4 * Math.sin(t * 7.7))
      : stretchK * 0.8; // yawn
    mouth = lerp(mouth, target, 1 - Math.exp(-dt * 25));
    faceU.uMouth.value = debugFace?.mouth ?? mouth;

    // talking nod spring
    nodVel += (-nod * 60 - nodVel * 9) * dt;
    nod += nodVel * dt;

    // head targets
    let tp = -pointer.y * 0.35, ty = pointer.x * 0.5, tr = 0;   // with body yaw: ~45° max toward the chat
    if (mood === "thinking") {
      tp = -0.18; ty = 0.25 + Math.sin(t * 0.8) * 0.1; tr = 0.28;      // look up & tilt, pondering
    } else if (mood === "talking") {
      tp = tp * 0.3 + nod * 0.5 + Math.sin(t * 7) * 0.03;
      ty = ty * 0.3 + Math.sin(t * 1.3) * 0.12;
      tr = Math.sin(t * 2.1) * 0.08;
    } else {
      tr = Math.sin(t * 0.7) * 0.05 + (waveT >= 0 ? 0.1 : 0); // friendly head tilt, away from the waving hand
      if (fidget === "look") {          // glance one way, then the other, then back
        if (fidgetT < 1.1) { ty = fidgetSide * 0.7; tp = -0.1; } else if (fidgetT < 1.9) { ty = -fidgetSide * 0.45; tp = 0.05; }
      } else if (fidget === "tilt") { tr = fidgetSide * 0.32; tp = -0.08; }
      else if (stretchK > 0) tp = -0.3;
      tp = lerp(tp, 0.42, sleepK); ty *= 1 - sleepK; tr = lerp(tr, 0.12, sleepK); // chin on the chest
    }
    if (Math.abs(ty - lastYaw) > 0.35 && blinkT < 0) { blinkT = 0; doubleBlink = false; } // blink on a big look
    lastYaw = ty;
    const hf = mood === "talking" ? 2 : 1.5;
    stepSpring(head.x, tp, hf, 0.6, dt); stepSpring(head.y, ty, hf, 0.6, dt); stepSpring(head.z, tr, hf, 0.6, dt);

    // arms: relaxed at the sides, gesturing while talking, hand raised to the chin while thinking
    let tl = { out: 0.24, fwd: 0.06 + breath * 0.02, bend: 0.3 };
    let tr2 = { out: 0.24, fwd: 0.06 + breath * 0.02, bend: 0.3 };
    if (mood === "talking") {
      tl = { out: 0.38 + Math.sin(t * 1.9) * 0.1, fwd: 0.3 + Math.sin(t * 2.3) * 0.15, bend: 0.9 + Math.sin(t * 3.1) * 0.35 };
      tr2 = { out: 0.38 + Math.sin(t * 1.7 + 2) * 0.1, fwd: 0.3 + Math.sin(t * 2.1 + 1) * 0.15, bend: 0.9 + Math.sin(t * 2.7 + 2) * 0.35 };
    } else if (mood === "thinking") {
      tl = { out: -0.15, fwd: 0.75, bend: 2.3 };                      // hand up toward the chin
      tr2 = { out: 0.2, fwd: 0.35, bend: 1.3 };                       // other arm across the tummy
    } else if (stretchK > 0) {
      tl = tr2 = { out: 2.45, fwd: 0.3, bend: 0.35 };                 // reach up overhead
    } else if (sleepK > 0.5) {
      tl = tr2 = { out: 0.14, fwd: 0.1, bend: 0.15 };                 // arms hang limp
    }
    // joint springs: the gesturing arm (if any) gets its own stiffness; [freq Hz, damping]
    let armS = [1.4, 0.55], gestS = armS, gestArm = null;
    // pointer cursor wherever a click does something (high five or spin). Raycasting the skinned mesh
    // is costly, so only re-check after the cursor moves, at most ~10x a second.
    if (model && cursorMoved && t - hoverAt > 0.1) {
      cursorMoved = false; hoverAt = t;
      const clickable = (canHighFive() && !!reachFor(cursorPx)) || onChibi(cursorPx);
      renderer.domElement.style.cursor = clickable ? "pointer" : "";
    }
    if (fiveT >= 0 && mood !== "idle") fiveT = -1; // a question interrupts it
    if (fiveT >= 0) {
      fiveT += dt;
      let pose = null, spr = [2.2, 0.7];
      const hit = fiveHit0;
      if (fiveT < 0.45) pose = { out: hit.out + 0.15, fwd: hit.fwd - 0.5, bend: 1.9 };   // wind up: hand back by the ear
      else if (fiveT < 0.8) { pose = hit; spr = [5, 0.45]; }                            // slap: palm onto the cursor
      else if (fiveT < 1.15) pose = { out: hit.out, fwd: hit.fwd - 0.1, bend: 0.7 };   // hold
      else fiveT = -1;                                                                                  // drop
      if (!fiveHit && fiveT > 0.55) {
        fiveHit = true; grin(1.4); hop(0.3); nudge(1.2);
        burst(toPx(palmCenter(fiveArm), _px));
      }
      if (pose) {
        if (fiveArm === model.userData.rig.left) tl = pose; else tr2 = pose;
        gestArm = fiveArm; gestS = spr;
      }
    }
    // wave: elbow out at shoulder height, forearm up; the forearm swings from the elbow while the
    // upper arm barely moves and the hand trails a beat behind (follow-through), then the arm drops
    palmTilt = 0;
    if (waveT >= 0 && mood !== "idle") waveT = -1; // a question interrupts it
    if (waveT >= 0) {
      waveT += dt;
      palmArm = model.userData.rig.right;
      const W0 = 0.3, W1 = 2.3;                                      // swinging from W0 to W1
      if (waveT < W1 + 0.15) {
        const w = waveT - W0, ph = w * 12.5;                         // ~2 waves a second
        const env = waveT < W0 ? 0 : Math.min(1, w / 0.25, (W1 - w - W0) / 0.3 + 1); // ease in / out
        const sw = Math.sin(ph) * Math.max(0, env);
        tr2 = { out: 1.65 + Math.sin(ph + 0.4) * 0.04 * env, fwd: 0.3, bend: 0.25, curl: 1.2 + sw * 0.35 };
        palmTilt = -0.1 - Math.sin(ph - 0.8) * 0.5 * Math.max(0, env); // fingers upright, rocking behind the forearm
        gestArm = model.userData.rig.right; gestS = waveT < W0 ? [2.5, 0.75] : [4.5, 0.8];
      } else {
        waveT = -1;
        nudge(1); speak(GREETING); // mouth only: the greeting text itself is shown in the chat panel
      }
    }
    lean = lerp(lean, fiveT > 0.45 ? 0.06 : 0, 1 - Math.exp(-dt * (fiveT > 0.45 ? 18 : 6)));
    palmW = lerp(palmW, fiveT >= 0 || waveT >= 0 ? 1 : 0, 1 - Math.exp(-dt * 8));
    const sl = model && gestArm === model.userData.rig.left ? gestS : armS, sr = model && gestArm === model.userData.rig.right ? gestS : armS;
    springPose(armL, armLv, tl, sl[0], sl[1], dt); springPose(armR, armRv, tr2, sr[0], sr[1], dt);

    if (model) {
      const rig = model.userData.rig;
      const clamp = THREE.MathUtils.clamp;
      // head turn split between neck (40%) and head (60%) so it bends naturally
      _e.set(clamp(head.x.x, -0.45, 0.5), clamp(head.y.x, -0.8, 0.8), clamp(head.z.x, -0.4, 0.4), "YXZ");
      _q.setFromEuler(_e);
      poseBone(rig.neck, _q2.identity().slerp(_q, 0.4));
      poseBone(rig.head, _q2.identity().slerp(_q, 0.6));
      poseBone(rig.spine, _q.setFromAxisAngle(X, -breath * 0.015 + nod * 0.05));
      poseArm(rig.left, armL);
      poseArm(rig.right, armR);
      rig.left.hand.bone.quaternion.copy(rig.left.hand.rest); rig.right.hand.bone.quaternion.copy(rig.right.hand.rest);
      if (palmArm && palmW > 0.01) {
        // palm toward the camera, in model space
        model.worldToLocal(_v.copy(camera.position)).sub(model.worldToLocal(palmArm.hand.bone.getWorldPosition(_v2))).normalize();
        aimPalm(model, palmArm, _v, palmW, palmTilt);
      }
    }

    // body follows pointer a little; sways while thinking
    stepSpring(bodyYaw, pointer.x * 0.25 * (1 - sleepK) + (mood === "thinking" ? Math.sin(t * 1.5) * 0.08 : 0), 1, 0.7, dt);
    body.rotation.set(nod * 0.06 + lean + sleepK * 0.05, bodyYaw.x + spinS.x,
      Math.sin(t * 1.1) * 0.02 + (mood === "talking" ? Math.sin(t * 3) * 0.02 : 0));
    const sq = THREE.MathUtils.clamp(squash.x, 0.75, 1.3);
    body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    root.position.y = y;
    if (model) {
      // move the tag by however the head moved from its rest pose (turns, nods, hops, spins, sway),
      // as if it were glued to the head: no lag, no drift
      const { headRest } = model.userData.rig, headBone = model.userData.rig.head.bone;
      headBone.getWorldQuaternion(_q).multiply(_q2.copy(headRest.q).invert());
      tag.group.quaternion.copy(_q);
      tag.group.position.set(0, TAG_Y, 0).sub(headRest.pos).applyQuaternion(_q).add(headBone.getWorldPosition(_v));
      const tagScale = Math.max(0, 1 - miniK * 1.6); // gone well before the box is done shrinking
      tag.group.scale.setScalar(tagScale);
      tag.group.visible = tagScale > 0.01;
    }
    if (asleep && model) {               // z's drift up from just above the head, off to one side
      toPx(model.userData.rig.head.bone.getWorldPosition(_v).add(_v2.set(0.45, 0.55, 0)), _px);
      zzz.style.left = `${_px.x}px`; zzz.style.top = `${_px.y}px`;
    }
    const lift = Math.max(0, y) / 0.35;                 // 0 on the ground .. 1 at the top of a hop
    blob.scale.setScalar(1 - 0.35 * lift);
    blob.material.opacity = 1 - 0.5 * lift;

    // keep framing nice on narrow screens; closer in when mini
    miniK = lerp(miniK, miniT, 1 - Math.exp(-dt * 6));
    if (miniT === 0 && miniK < 0.001) frameFull(width / height);
    // mini: frames y -0.1 .. 2.7 so the head stays in the small canvas at the top of a hop (+stretch)
    camera.position.z = lerp(fullZ, 4.9, miniK);
    camera.lookAt(0, lerp(fullY, 1.3, miniK), 0);

    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }

  const resizeObserver = new ResizeObserver(() => {
    width = container.clientWidth || 1; height = container.clientHeight || 1;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.render(scene, camera); // resizing clears the canvas; redraw now so it doesn't flicker mid-animation
  });
  resizeObserver.observe(container);

  // dev-only handle for poking at poses from the console / test scripts
  let debugFace = null;
  if (import.meta.env.DEV) {
    window.__chibi = {
      setMood: (m) => { mood = m; }, setFace: (f) => { debugFace = f; }, camera, renderer,
      fidget: startFidget, sleep: () => { lastActive = -1e3; }, hop, spin,
    };
  }

  animate(); // start last, once everything it touches is declared

  return {
    // a question was asked: ponder
    think() { wake(); mood = "thinking"; },
    // first streamed chunk arrived
    startTalking() { wake(); mood = "talking"; hop(0.35); },
    // `chunk` is the part of the answer that just arrived
    speakChunk(chunk) {
      lastActive = clock.elapsedTime;
      nudge(/[.!?]/.test(chunk) ? 1.4 : 0.5); // nod on punctuation
      speak(chunk);
    },
    done() {
      later(() => { if (mood === "talking") mood = "idle"; }, 600);
    },
    // switch between the full-size stage and the small companion
    setMini(on) { miniT = on ? 1 : 0; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      progressListeners.delete(progressFn);
      removeEventListener("pointermove", onPointerMove);
      removeEventListener("keydown", wake);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("click", onClick);
      resizeObserver.disconnect();
      tag.dispose();
      zzz.remove();
      if (model) body.remove(model); // keep the cached model itself alive for the next mount
      envMap.dispose(); pmrem.dispose();
      blob.geometry.dispose(); blob.material.dispose(); blobTex.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
