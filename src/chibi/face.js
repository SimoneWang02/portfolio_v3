// Blinking and talking for a face with no blendshapes or face bones: both are painted in the fragment
// shader over the texture, so they work at any mesh density and follow the head bone through skinning.
// (Sliding the texture itself for a jaw drop doesn't work here: the chin's UVs are split into islands.)

// Face landmarks as fractions of the mesh's bind-pose bounding box (x: screen left->right, y: feet->top,
// z: back->front). Measured from an orthographic front render of chibi-rigged.glb.
const FACE_GLSL = `
  const vec2 EYE_L = vec2(0.3755, 0.7255);      // screen-left eye
  const vec2 EYE_R = vec2(0.6185, 0.7255);
  // painted eye outlines, measured by rendering the texture into these coordinates: each eye's x extent
  // (relative to its center) and quartic fits, in u = dx / EYE_HW, of the top edge of the upper lash line,
  // the bottom edge of the eye white, and the lash line's thickness. The lids rest exactly on these, so
  // they open onto the painted eye without a seam.
  const float EYE_HW = 0.06;
  const vec2 EYE_XR_L = vec2(-0.0588, 0.0584), EYE_XR_R = vec2(-0.0592, 0.0592);
  const float TOP_L[5] = float[5](0.01924, 0.00129, -0.01143, -0.00194, -0.01097);
  const float TOP_R[5] = float[5](0.01939, -0.00101, -0.00912, 0.00169, -0.0128);
  const float BOT_L[5] = float[5](-0.01887, -0.00419, 0.00989, -0.00142, 0.00301);
  const float BOT_R[5] = float[5](-0.01847, 0.00576, 0.00785, -0.00119, 0.00584);
  const float LASH_L[5] = float[5](0.00633, -0.00172, -0.00098, 0.0, 0.0);
  const float LASH_R[5] = float[5](0.00608, 0.0015, 0.0007, 0.0, 0.0);
  float poly(float c[5], float u) { return c[0] + u * (c[1] + u * (c[2] + u * (c[3] + u * c[4]))); }
  const vec2 MOUTH = vec2(0.502, 0.6194);       // seam corners at x 0.420 / 0.584; seam height at x = 0.5
  const float MOUTH_HALF_W = 0.082;             // half-width of the opening (reaches the corners)
  const float MOUTH_DROP = 0.02;                // opening height when fully open
  const float LIP_T = 0.008;                    // lower-lip thickness (painted lip spans ~0.610-0.618)
  // skin tone for the eyelids (linear), sampled from the texture just under the eyes
  const vec3 LID_COLOR = vec3(0.80, 0.40, 0.27);
  const float LID_GLOW = 0.9;   // self-lit lid color through the corner cracks (see eyelid use), matched by eye
  // lip tone (linear), sampled from the painted lower lip
  const vec3 LIP_COLOR = vec3(0.77, 0.30, 0.21);
  const vec3 TEETH_COLOR = vec3(0.82, 0.80, 0.76);             // off-white: pure white glares under the key light
  const vec3 MOUTH_DARK = vec3(0.05, 0.008, 0.012), MOUTH_DEEP = vec3(0.16, 0.025, 0.035);
  const vec3 TONGUE_TOP = vec3(0.62, 0.14, 0.16), TONGUE_BASE = vec3(0.36, 0.06, 0.08);
  // hair tone (linear). Tripo projected the texture from the front, so the hidden undersides of the
  // fringe (and the inner sides of the hair at the temples) got skin painted on them; those faces are
  // found by their bind-pose normal and repainted with this.
  const vec3 HAIR_COLOR = vec3(0.019, 0.015, 0.012);
  float hairUnderside(vec3 f, vec3 n) {
    float front = smoothstep(0.6, 0.7, f.z);
    // above the eyebrows, anything facing down or back toward the forehead is under a strand
    float fringe = max(smoothstep(-0.25, -0.5, n.y), smoothstep(-0.1, -0.35, n.z)) * smoothstep(0.76, 0.775, f.y);
    // beside the face, hair whose surface faces inward (toward the cheeks)
    float side = sign(f.x - 0.5);
    float temple = smoothstep(-0.3, -0.55, n.x * side) * smoothstep(0.19, 0.21, abs(f.x - 0.5)) * smoothstep(0.66, 0.68, f.y);
    return max(fringe, temple) * front;
  }
  float frontGate(float z) { return smoothstep(0.62, 0.72, z); }   // face surface is z > ~0.8
  // front of the head, chin to above the hairline. Tripo's normal map bakes a sharp bevel around every
  // painted feature there (brows, lash lines, hairline) that catches the light as a pale halo, so the
  // normal map is dropped in this region; the mesh itself carries the shape of the brows and fringe.
  float faceRegion(vec3 f) {
    return frontGate(f.z) * smoothstep(0.56, 0.60, f.y) * (1.0 - smoothstep(0.86, 0.90, f.y))
         * (1.0 - smoothstep(0.25, 0.29, abs(f.x - 0.5)));
  }
  // lip seam, least-squares fit to the darkest row of the painted smile (rms error 0.0004):
  // slightly tilted, lowest just right of center
  float mouthLine(float x) { float d = x - 0.5; return MOUTH.y + 0.0071 * d + 1.49 * d * d; }
  // opening height profile across the mouth: rounded ends, zero at +/- MOUTH_HALF_W; smaller k is fuller
  float mouthProfile(float x, float k) { float u = (x - MOUTH.x) / MOUTH_HALF_W; return pow(max(1.0 - u * u, 0.0), k); }
`;

export function addFace(material, faceU) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, faceU);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        uniform vec3 uBMin; uniform vec3 uBMax;
        varying vec3 vFace; varying vec3 vFaceN;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vFace = (position - uBMin) / (uBMax - uBMin);  // bind-pose coords, so skinning doesn't shift them
        vFaceN = normal;                                // bind-pose normal`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uMouth, uBlink, uHappy;
        varying vec3 vFace; varying vec3 vFaceN;
        ${FACE_GLSL}
        // eyelids: the upper lid slides down from the top of the painted lash line, carrying a lash line of
        // the same thickness, and the lower lid rises from the bottom of the eye white; they meet at the close
        // line: a gentle downward curve for a blink, an upward arch for happy closed eyes (^ ^).
        // returns (lid coverage, lash-line coverage)
        vec2 eyelid(vec2 c, vec2 xr, float top[5], float bot[5], float lashT[5], float aa) {
          // happy: the lids shut first (uHappy 0 .. 0.35), then the closed line bends up into an arch
          // (0.35 .. 1), so on the way back the eyes stay shut until the arch has flattened out
          float arch = smoothstep(0.35, 1.0, uHappy);
          float shut = max(uBlink, smoothstep(0.0, 0.35, uHappy));   // keep in sync with eyesShut in createChibi.js
          float dx = vFace.x - c.x;
          if (shut < 0.01 || dx < xr.x - 0.008 || dx > xr.y + 0.008 || abs(vFace.y - c.y) > 0.03) return vec2(0.0);
          float u = dx / EYE_HW, y = vFace.y;
          float uc = clamp(dx, xr.x, xr.y) / EYE_HW;                     // the fits only hold over the eye
          float U = c.y + poly(top, uc), D = min(c.y + poly(bot, uc), U);
          // once the lids move, they also cover the painted lash's soft top edge, the eye white's bottom
          // fringe and the lash tips flicking out at the corners
          float corner = smoothstep(0.3, 1.0, abs(u)), grow = smoothstep(0.0, 0.2, shut);
          float Um = U + (0.0015 + 0.011 * corner) * grow, Dm = D - (0.0025 + 0.003 * corner) * grow;
          float closeY = mix(mix(U, D, 0.62), c.y + 0.026 * (0.85 * (1.0 - u * u) - 0.4), arch);
          float e = mix(U, closeY, shut);                                // upper lid edge: top of its lash line
          float f = mix(D, closeY, shut);                                // lower lid edge
          float ends = smoothstep(xr.x - 0.008, xr.x - 0.004, dx) * (1.0 - smoothstep(xr.y + 0.004, xr.y + 0.008, dx));
          float lid = max(smoothstep(e - aa, e + aa, y) * (1.0 - smoothstep(Um - aa, Um + aa, y)),
                          smoothstep(Dm - aa, Dm + aa, y) * (1.0 - smoothstep(f - aa, f + aa, y)));
          // the lash line keeps the painted thickness as it comes down, thinning to the closed line (bold arches when happy)
          float th = mix(clamp(poly(lashT, uc), 0.003, 0.009), mix(0.0026, 0.0042, arch) * (1.0 - 0.6 * u * u), shut);
          float lash = smoothstep(e - th - aa, e - th + aa, y) * (1.0 - smoothstep(e - aa, e + aa, y));
          return vec2(lid, lash) * ends;
        }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        float faceAA = fwidth(vFace.y) * 1.2;   // outside branches: derivatives need uniform control flow
        float gate = frontGate(vFace.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, HAIR_COLOR, hairUnderside(vFace, normalize(vFaceN)));
        vec2 lidMask = vec2(0.0);
        float lidBack = 0.0, mouthIn = 0.0;
        if (gate > 0.0 || !gl_FrontFacing) {
          vec2 l = max(eyelid(EYE_L, EYE_XR_L, TOP_L, BOT_L, LASH_L, faceAA),
                       eyelid(EYE_R, EYE_XR_R, TOP_R, BOT_R, LASH_R, faceAA)) * gate;
          // the mesh has a hairline crack at the outer eye corners, normally hidden by the painted lash; with
          // the lids painted shut, the inside of the head shows through it as a dark tick. Those back faces
          // near the eyes are painted as lid and made self-lit (they sit in shadow, inside the head).
          if (!gl_FrontFacing) {
            float nearEye = step(-0.04, vFace.y - EYE_L.y) * step(vFace.y - EYE_L.y, 0.07) * max(
              step(EYE_XR_L.x - 0.01, vFace.x - EYE_L.x) * step(vFace.x - EYE_L.x, EYE_XR_L.y + 0.01),
              step(EYE_XR_R.x - 0.01, vFace.x - EYE_R.x) * step(vFace.x - EYE_R.x, EYE_XR_R.y + 0.01));
            // (no front gate: these layers sit deeper in the head than the face surface)
            lidBack = smoothstep(0.0, 0.2, max(uBlink, smoothstep(0.0, 0.35, uHappy))) * nearEye * step(0.5, vFace.z);
            l.x = max(l.x, lidBack);
          }
          lidMask = l;
          diffuseColor.rgb = mix(diffuseColor.rgb, LID_COLOR, l.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.02, 0.02), l.y);
          // mouth: the lips part at the seam; the cavity opens below it and the lower lip is redrawn
          // under the opening (covering the painted one), so it reads as the jaw dropping
          // a happy grin opens wider and fuller, with the top teeth showing
          float k = mix(0.6, 0.35, uHappy);
          float jawH = max(uMouth, uHappy) * MOUTH_DROP * (1.0 + 0.9 * uHappy) * mouthProfile(vFace.x, k);
          float below = mouthLine(vFace.x) - vFace.y;                  // > 0 under the seam
          if (jawH > 0.0) {
            float u = (vFace.x - MOUTH.x) / MOUTH_HALF_W;
            // lower lip: redrawn under the opening; slimmer and closer to the skin tone in a grin
            float lipT = LIP_T * (0.5 + 0.5 * mouthProfile(vFace.x, k)) * mix(1.0, 0.6, uHappy); // thinner toward the corners
            float lip = smoothstep(-faceAA, faceAA, below - jawH)
                      * (1.0 - smoothstep(lipT * 0.6, lipT + faceAA, below - jawH))
                      * smoothstep(0.0, 0.003, jawH) * gate;
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(LIP_COLOR, LID_COLOR, 0.3 * uHappy), lip);
            float inside = smoothstep(-faceAA, faceAA, below) * smoothstep(-faceAA, faceAA, jawH - below)
                         * smoothstep(0.0, 0.0015, jawH) * gate;
            mouthIn = inside;
            float t = below / max(jawH, 1e-4);                           // 0 at the seam .. 1 at the lower lip
            vec3 cavity = mix(MOUTH_DARK, MOUTH_DEEP, t);
            // tongue: a rounded mound rising from the bottom, lit from above
            float tu = u / 0.6;
            float tongueTop = 1.0 - 0.45 * sqrt(max(1.0 - tu * tu, 0.0));
            float tongue = smoothstep(tongueTop - 0.08, tongueTop + 0.08, t) * step(abs(tu), 1.0);
            cavity = mix(cavity, mix(TONGUE_TOP, TONGUE_BASE, smoothstep(tongueTop, 1.0, t)), tongue);
            diffuseColor.rgb = mix(diffuseColor.rgb, cavity, inside);
            // upper teeth: tucked under the lip (shadowed at the top), rounded ends short of the corners,
            // and a faint split between the front two
            float teethH = jawH * 0.36 * smoothstep(0.0, 0.5, uHappy) * sqrt(max(1.0 - pow(u / 0.78, 2.0), 0.0));
            float teeth = (1.0 - smoothstep(teethH - faceAA, teethH + faceAA, below)) * smoothstep(0.0, 0.0008, teethH) * inside;
            float tt = below / max(teethH, 1e-4);
            vec3 teethCol = TEETH_COLOR * mix(0.55, 1.0, smoothstep(0.0, 0.45, tt)) * mix(1.0, 0.85, smoothstep(0.75, 1.0, tt));
            teethCol *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, faceAA * 1.5, abs(vFace.x - MOUTH.x))) * step(0.2, tt);
            diffuseColor.rgb = mix(diffuseColor.rgb, teethCol, teeth);
          }
        }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance = mix(totalEmissiveRadiance, LID_COLOR * LID_GLOW, lidBack);
        diffuseColor.rgb *= 1.0 - lidBack;`)
      // shut lids are matte, so the sculpted eye rim under them doesn't glint
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, max(lidMask.x, mouthIn)); // the mouth too: no glints inside`)
      // drop the normal map on the face (see faceRegion) and under a closed lid, so the eye's sculpted
      // rim doesn't show through the skin
      .replace("#include <normal_fragment_maps>", `
        vec3 geoNormal = normal;
        #include <normal_fragment_maps>
        normal = normalize(mix(normal, geoNormal, max(faceRegion(vFace), lidMask.x)));
`);
  };
  material.needsUpdate = true;
}
