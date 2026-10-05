// Damped springs: motion that overshoots a little and settles, instead of easing to a dead stop. That
// overshoot (and the wobble after an impulse) is most of what makes a cartoon character read as bouncy.
// `freq` is the natural frequency in Hz, `zeta` the damping ratio (1: no overshoot, ~0.3: jelly).

export const spring = (x = 0) => ({ x, v: 0 });

export function stepSpring(s, target, freq, zeta, dt) {
  const w = 2 * Math.PI * freq;
  const n = Math.ceil(dt * 240); // substeps: semi-implicit Euler is only stable for w * h < 2
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (w * w * (target - s.x) - 2 * zeta * w * s.v) * h;
    s.x += s.v * h;
  }
  return s.x;
}
