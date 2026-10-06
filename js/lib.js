/**
 * Shared maths, seeded noise and tween helpers.
 * Imported by the procedural spice builders and the renderer.
 */

import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = (v) => clamp(v, 0, 1);

export function smoothstep(edge0, edge1, x) {
  const t = saturate((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/* ---------------------------------------------------------------- easings */

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Frame-rate independent exponential approach. */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/* ------------------------------------------------------------------ random */

/** Deterministic 32-bit PRNG so every reload renders the same scene. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random helper bundle bound to one seed. */
export function rng(seed) {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (lo, hi) => lo + (hi - lo) * r(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()),
    sign: () => (r() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(r() * arr.length) % arr.length],
    /** Even-ish distribution across a sphere. */
    onSphere: (radius = 1) => {
      const z = 2 * r() - 1;
      const a = r() * TAU;
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      return [radius * s * Math.cos(a), radius * z, radius * s * Math.sin(a)];
    },
  };
}

/* ------------------------------------------------------------------- noise */

/**
 * 3D value noise in [-1, 1] built on a seeded permutation table.
 * Cheap and smooth — plenty for organic surface displacement.
 */
export function makeNoise3D(seed = 1) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  const table = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 512; i++) table[i] = perm[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rand() * 2 - 1;

  const at = (xi, yi, zi) =>
    vals[table[table[table[xi & 255] + yi] & 255 + zi] & 255];

  return function noise(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const c000 = at(xi, yi, zi);
    const c100 = at(xi + 1, yi, zi);
    const c010 = at(xi, yi + 1, zi);
    const c110 = at(xi + 1, yi + 1, zi);
    const c001 = at(xi, yi, zi + 1);
    const c101 = at(xi + 1, yi, zi + 1);
    const c011 = at(xi, yi + 1, zi + 1);
    const c111 = at(xi + 1, yi + 1, zi + 1);

    const x00 = lerp(c000, c100, u);
    const x10 = lerp(c010, c110, u);
    const x01 = lerp(c001, c101, u);
    const x11 = lerp(c011, c111, u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  };
}

/** Fractal brownian motion over a noise function. */
export function fbm(noise, x, y, z, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += noise(fx, fy, fz) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
    fz *= lacunarity;
  }
  return sum / norm;
}

/* ---------------------------------------------------- parametric surfaces */

/**
 * Build a BufferGeometry from a parametric surface.
 *
 * `fn(u, v, out)` writes a position into `out` (length-3 array).
 *   u ∈ [0,1] wraps around the surface (closed)
 *   v ∈ [0,1] runs bottom → top (open)
 *
 * Normals are taken from central differences of `fn`, so a closed seam has no
 * visible crease — `computeVertexNormals()` would split there because the
 * seam column is duplicated for UVs.
 *
 * `flipNormals` is for open shells whose visible face is the underside.
 */
export function surfaceGeometry(fn, segU, segV, { flipNormals = false } = {}) {
  const cols = segU + 1; // duplicate seam column for a clean UV wrap
  const rows = segV + 1;
  const count = cols * rows;

  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);

  const p = [0, 0, 0];
  const pu0 = [0, 0, 0];
  const pu1 = [0, 0, 0];
  const pv0 = [0, 0, 0];
  const pv1 = [0, 0, 0];
  const h = 1e-3;

  for (let j = 0; j < rows; j++) {
    const v = j / segV;
    for (let i = 0; i < cols; i++) {
      const u = i / segU;
      const idx = j * cols + i;

      fn(u, v, p);
      // Tangents, wrapping in u and clamped in v.
      fn((u - h + 1) % 1, v, pu0);
      fn((u + h) % 1, v, pu1);
      fn(u, Math.max(0, v - h), pv0);
      fn(u, Math.min(1, v + h), pv1);

      const tux = pu1[0] - pu0[0];
      const tuy = pu1[1] - pu0[1];
      const tuz = pu1[2] - pu0[2];
      const tvx = pv1[0] - pv0[0];
      const tvy = pv1[1] - pv0[1];
      const tvz = pv1[2] - pv0[2];

      // dv × du, not du × dv: with u running anticlockwise around the body and
      // v running up it, du × dv points into the solid and lights every pod
      // from the inside.
      let nx = tvy * tuz - tvz * tuy;
      let ny = tvz * tux - tvx * tuz;
      let nz = tvx * tuy - tvy * tux;
      const len = Math.hypot(nx, ny, nz) || 1;
      const sign = flipNormals ? -1 : 1;
      nx = (nx / len) * sign;
      ny = (ny / len) * sign;
      nz = (nz / len) * sign;

      position[idx * 3] = p[0];
      position[idx * 3 + 1] = p[1];
      position[idx * 3 + 2] = p[2];
      normal[idx * 3] = nx;
      normal[idx * 3 + 1] = ny;
      normal[idx * 3 + 2] = nz;
      uv[idx * 2] = u;
      uv[idx * 2 + 1] = v;
    }
  }

  const indices = [];
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flipNormals) {
        indices.push(a, b, c, b, d, c);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  return geo;
}

/* ------------------------------------------------------------------ tween */

/**
 * Minimal timeline. Tweens are ticked from the render loop so they stay in
 * sync with the frame clock instead of fighting requestAnimationFrame.
 */
export class Tweener {
  constructor() {
    this.items = [];
  }

  /** @returns {object} handle with .cancel() and .finish() */
  add({ duration = 0.6, delay = 0, ease = easeInOutCubic, onUpdate, onComplete }) {
    const item = {
      elapsed: -delay,
      duration: Math.max(0.0001, duration),
      ease,
      onUpdate,
      onComplete,
      done: false,
    };
    this.items.push(item);
    return {
      cancel: () => {
        item.done = true;
      },
      finish: () => {
        if (item.done) return;
        item.elapsed = item.duration;
        item.done = true;
        item.onUpdate?.(1);
        item.onComplete?.();
      },
    };
  }

  cancelAll() {
    this.items.length = 0;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.done) {
        this.items.splice(i, 1);
        continue;
      }
      it.elapsed += dt;
      if (it.elapsed < 0) continue;
      const t = saturate(it.elapsed / it.duration);
      it.onUpdate?.(it.ease(t));
      if (t >= 1) {
        it.done = true;
        it.onComplete?.();
        this.items.splice(i, 1);
      }
    }
  }
}

/* -------------------------------------------------------------- utilities */

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isTouchDevice = () =>
  typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

/** requestAnimationFrame loop with visibility pausing and an fps callback. */
export function startLoop(step) {
  let raf = 0;
  let last = performance.now();
  let running = true;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    // Clamp dt so a backgrounded tab does not teleport the simulation.
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (!running) return;
    step(dt, now / 1000);
  };

  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    last = performance.now();
  });

  return () => cancelAnimationFrame(raf);
}

/** Map a value from one range onto another, clamped. */
export function mapRange(v, inLo, inHi, outLo, outHi) {
  return outLo + (outHi - outLo) * saturate((v - inLo) / (inHi - inLo));
}
