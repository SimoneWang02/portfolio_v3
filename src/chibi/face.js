// Blinking and talking for a face with no blendshapes or face bones: both are painted in the fragment
// shader over the texture, so they work at any mesh density and follow the head bone through skinning.
// (Sliding the texture itself for a jaw drop doesn't work here: the chin's UVs are split into islands.)

// Face landmarks as fractions of the mesh's bind-pose bounding box (x: screen left->right, y: feet->top,
// z: back->front). Measured from an orthographic front render of chibi-rigged.glb.
const FACE_GLSL = `
  const vec2 EYE_L = vec2(0.3755, 0.7255);      // screen-left eye
  const vec2 EYE_R = vec2(0.6185, 0.7255);
  const vec2 EYE_SIZE = vec2(0.066, 0.026);     // ellipse radii covering the eye and its lash line
  const float EYE_CLOSE_Y = -0.004;             // lids meet slightly below eye center
  const vec2 MOUTH = vec2(0.502, 0.6194);       // seam corners at x 0.420 / 0.584; seam height at x = 0.5
  const float MOUTH_HALF_W = 0.082;             // half-width of the opening (reaches the corners)
  const float MOUTH_DROP = 0.02;                // opening height when fully open
  const float LIP_T = 0.008;                    // lower-lip thickness (painted lip spans ~0.610-0.618)
  // skin tone for the eyelids (linear), sampled from the texture just under the eyes
  const vec3 LID_COLOR = vec3(0.80, 0.40, 0.27);
  // lip tone (linear), sampled from the painted lower lip
  const vec3 LIP_COLOR = vec3(0.77, 0.30, 0.21);
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
  // opening height profile across the mouth: rounded ends, zero at +/- MOUTH_HALF_W
  float mouthProfile(float x) { float u = (x - MOUTH.x) / MOUTH_HALF_W; return pow(max(1.0 - u * u, 0.0), 0.6); }
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
        uniform float uMouth, uBlink;
        varying vec3 vFace; varying vec3 vFaceN;
        ${FACE_GLSL}
        // eyelids: upper lid comes down, lower lid comes up, meeting at the close line.
        // returns (lid coverage, lash-line coverage)
        vec2 eyelid(vec2 c, float aa) {
          vec2 d = (vFace.xy - c) / EYE_SIZE;
          float r2 = dot(d, d);
          if (r2 > 1.0 || uBlink < 0.01) return vec2(0.0);
          float u2 = d.x * d.x;
          float arc = EYE_SIZE.y * sqrt(1.0 - u2);
          float closeY = c.y + EYE_CLOSE_Y - 0.004 * (1.0 - u2);        // gentle downward curve
          float top = mix(c.y + arc, closeY, uBlink);
          float bot = mix(c.y - arc, closeY, uBlink);
          float lid = max(smoothstep(top - aa, top + aa, vFace.y), 1.0 - smoothstep(bot - aa, bot + aa, vFace.y));
          lid *= 1.0 - smoothstep(0.85, 1.0, r2);                        // feather the outer edge
          float th = mix(0.0008, 0.0022, smoothstep(0.1, 0.9, uBlink)) * (1.0 - 0.6 * u2);
          float lash = (1.0 - smoothstep(th - aa, th + aa, abs(vFace.y - top))) * (1.0 - smoothstep(0.8, 1.0, r2));
          return vec2(lid, lash);
        }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        float faceAA = fwidth(vFace.y) * 1.2;   // outside branches: derivatives need uniform control flow
        float gate = frontGate(vFace.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, HAIR_COLOR, hairUnderside(vFace, normalize(vFaceN)));
        vec2 lidMask = vec2(0.0);
        if (gate > 0.0) {
          vec2 l = max(eyelid(EYE_L, faceAA), eyelid(EYE_R, faceAA)) * gate;
          lidMask = l;
          diffuseColor.rgb = mix(diffuseColor.rgb, LID_COLOR, l.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.02, 0.02), l.y);
          // mouth: the lips part at the seam; the cavity opens below it and the lower lip is redrawn
          // under the opening (covering the painted one), so it reads as the jaw dropping
          float jawH = uMouth * MOUTH_DROP * mouthProfile(vFace.x);   // opening height at this x
          float below = mouthLine(vFace.x) - vFace.y;                  // > 0 under the seam
          if (jawH > 0.0) {
            float lipT = LIP_T * (0.5 + 0.5 * mouthProfile(vFace.x));  // thinner toward the corners
            float lip = smoothstep(-faceAA, faceAA, below - jawH)
                      * (1.0 - smoothstep(lipT * 0.6, lipT + faceAA, below - jawH))
                      * smoothstep(0.0, 0.003, jawH) * gate;
            diffuseColor.rgb = mix(diffuseColor.rgb, LIP_COLOR, lip);
            float inside = smoothstep(-faceAA, faceAA, below) * smoothstep(-faceAA, faceAA, jawH - below)
                         * smoothstep(0.0, 0.0015, jawH);
            float tongue = smoothstep(0.5, 0.95, below / max(jawH, 1e-4));
            vec3 cavity = mix(vec3(0.06, 0.01, 0.015), vec3(0.45, 0.10, 0.12), tongue);
            diffuseColor.rgb = mix(diffuseColor.rgb, cavity, inside);
          }
        }`)
      // drop the normal map on the face (see faceRegion) and under a closed lid, so the eye's sculpted
      // rim doesn't show through the skin
      .replace("#include <normal_fragment_maps>", `
        vec3 geoNormal = normal;
        #include <normal_fragment_maps>
        normal = normalize(mix(normal, geoNormal, max(faceRegion(vFace), lidMask.x)));`);
  };
  material.needsUpdate = true;
}
