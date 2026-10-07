/**
 * The 3D stage.
 *
 * One persistent WebGL canvas sits behind the whole document. Products are
 * floating clusters that hand over to each other on a spring-damped cross
 * fade, while a scroll-driven camera travels a short dolly between the hero
 * and the collection section.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  TAU,
  clamp,
  lerp,
  damp,
  easeInOutCubic,
  easeOutCubic,
  rng,
  Tweener,
  prefersReducedMotion,
  isTouchDevice,
  startLoop,
} from './lib.js';
import { createCluster, makeGlowSprite } from './spices.js';

const INK = 0x050a07;
const LEAF = 0x12b04a;

/* ======================================================================== */
/*  Pixel helpers (used only by the switcher thumbnails)                   */
/* ======================================================================== */

/** IEEE 754 half -> float, for the half-float render target readback. */
function halfToFloat(h) {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x03ff;
  if (exp === 0) return sign * 6.103515625e-5 * (frac / 1024);
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

/** Matches THREE.ACESFilmicToneMapping so thumbnails match the live render. */
function acesFilmic(x) {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1);
}

/** Tone map, then encode to sRGB, returning an 8-bit channel. */
function srgbEncode(x, exposure) {
  const mapped = acesFilmic(x * exposure);
  return Math.round(
    (mapped <= 0.0031308
      ? mapped * 12.92
      : 1.055 * Math.pow(Math.max(mapped, 0), 1 / 2.4) - 0.055) * 255,
  );
}

/** Widen a normalised channel to 8 bit. */
function copy(x) {
  return Math.round(clamp(x, 0, 1) * 255);
}

/* ======================================================================== */
/*  Environment                                                             */
/* ======================================================================== */

/**
 * A hand-built lighting environment baked through PMREM.
 *
 * A neutral studio HDRI would wash out the warm, near-black mood, so this
 * lays out four coloured emitters in a dark shell and lets the spices pick up
 * gold on one side and a cool rim on the other.
 */
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x050406);

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(30, 30, 30),
    new THREE.MeshBasicMaterial({ color: 0x06110a, side: THREE.BackSide }),
  );
  env.add(shell);

  const panel = (color, intensity, w, h, pos, look) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }),
    );
    mesh.position.set(...pos);
    mesh.lookAt(...(look || [0, 0, 0]));
    env.add(mesh);
    return mesh;
  };

  // Neutral key from high front-right so the spices still read as food.
  panel(0xfff4e2, 5.4, 12, 10, [7, 8, 7]);
  // Brand-green bounce from the left. Kept well below the neutral key: push
  // it any harder and the green pods stop reading as cardamom and start
  // glowing like plastic.
  panel(0x2fd074, 2.1, 10, 12, [-9, 1, 3]);
  // Cool rim from behind for edge separation.
  panel(0x4f86c9, 1.8, 14, 12, [0, 2, -10]);
  // Low green kicker.
  panel(0x12b04a, 2.0, 12, 6, [0, -9, 2]);
  // Faint top fill.
  panel(0xffffff, 0.6, 14, 14, [0, 12, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  shell.geometry.dispose();
  shell.material.dispose();
  return target.texture;
}

/* ======================================================================== */
/*  Final grade pass                                                        */
/* ======================================================================== */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.05 },
    uGrain: { value: 0.018 },
    uAberration: { value: 0.0012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    varying vec2 vUv;

    // Hash on gl_FragCoord, not on a fixed uv scale.
    //
    // Scaling uv by a constant (uv * 1024, say) makes the noise stride by more
    // than one period per pixel on a high-DPR buffer. The sin() hash then folds
    // that stride into long vertical moire bands that crawl whenever the camera
    // moves - which is exactly the "vertical lines" artefact. Hashing at one
    // sample per pixel keeps the grain isotropic and stationary.
    //
    // The Dave Hoskins style hash avoids sin() entirely, so it cannot band on
    // drivers with a weak fract(sin(x)) implementation.
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCentre = uv - 0.5;
      float d = length(fromCentre);

      // Lens aberration grows toward the corners, like a fast prime wide open.
      vec2 shift = fromCentre * uAberration * d * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + shift).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - shift).b;

      // Warm the highlights, cool the shadows very slightly.
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.96, 0.98, 1.06), (1.0 - lum) * 0.28);
      col = mix(col, col * vec3(1.04, 1.0, 0.93), smoothstep(0.45, 1.0, lum) * 0.5);

      // Vignette.
      col *= 1.0 - uVignette * d * d * 0.9;

      // Fine grain keeps the huge dark areas from banding. Two decorrelated
      // taps averaged together soften the single-pixel speckle into something
      // that reads as film rather than sensor noise.
      vec2 px = gl_FragCoord.xy;
      float g =
        (hash(px + fract(uTime) * 71.3) + hash(px * 0.5 + 19.7 + fract(uTime) * 131.1)) * 0.5 - 0.5;
      col += g * uGrain * (0.5 + (1.0 - lum) * 0.5);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

/* ======================================================================== */
/*  Dust                                                                    */
/* ======================================================================== */

/**
 * Three cooperating particle layers:
 *   fine   — tiny sharp motes that catch the key light
 *   bokeh  — big soft out-of-focus discs drifting across the frame
 *   swirl  — a comet trail that orbits the current cluster
 */
function createDust(glowTex) {
  const group = new THREE.Group();
  group.name = 'dust';
  const rand = rng(9182);
  const systems = [];

  /* --- fine motes ------------------------------------------------------- */
  {
    const n = 620;
    const pos = new Float32Array(n * 3);
    const speeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand.range(-26, 26);
      pos[i * 3 + 1] = rand.range(-14, 14);
      pos[i * 3 + 2] = rand.range(-22, 6);
      speeds[i] = rand.range(0.1, 0.55);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.1,
      map: glowTex,
      color: 0x9df0bd,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    systems.push({ points, kind: 'fine', speeds, span: [26, 14, 22] });
  }

  /* --- bokeh ------------------------------------------------------------ */
  {
    const n = 130;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    const scale = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand.range(-22, 22);
      pos[i * 3 + 1] = rand.range(-12, 12);
      pos[i * 3 + 2] = rand.range(-14, 10);
      phase[i] = rand.range(0, TAU);
      scale[i] = rand.range(0.45, 2.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.62,
      map: glowTex,
      color: 0x63e79b,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    systems.push({ points, kind: 'bokeh', phase, scale, origin: pos.slice() });
  }

  /* --- swirl trail ------------------------------------------------------ */
  {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      t[i] = i / n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(0x6ef0a0) },
        uSize: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aT;
        uniform float uTime;
        uniform float uSize;
        varying float vFade;
        void main() {
          // A loosely wound helix that thins as it trails away.
          float a = aT * 9.0 - uTime * 0.75;
          float rad = mix(2.4, 8.6, aT) * (1.0 + 0.12 * sin(a * 2.0 + uTime));
          vec3 p = vec3(
            cos(a) * rad,
            sin(a * 1.7 + uTime * 0.4) * (1.6 + aT * 3.4),
            sin(a) * rad * 0.55 - 1.2
          );
          vFade = pow(1.0 - aT, 2.0) * (0.35 + 0.65 * smoothstep(0.0, 0.25, aT));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (1.0 - aT * 0.55) * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(uColor, a * a * vFade * uOpacity);
        }
      `,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    systems.push({ points, kind: 'swirl', mat });
  }

  return { group, systems };
}

/* ======================================================================== */
/*  Stage                                                                   */
/* ======================================================================== */

export function createStage({ canvas, products, initialId, onReady, onFrame }) {
  const reduced = prefersReducedMotion();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setClearColor(INK, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // The rig below sums to well over ten units of light on a lit face. At 0.95
  // exposure ACES pushed every spice into its highlight roll-off, so dark
  // cloves and cinnamon quills came out pale salmon regardless of albedo.
  renderer.toneMappingExposure = 0.72;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.fog = new THREE.FogExp2(0x06110a, 0.018);
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.7;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0.4, 0.6, 13);

  /* --- lights ----------------------------------------------------------- */
  const key = new THREE.SpotLight(0xfff4e2, 165, 70, Math.PI / 4.4, 0.9, 1.5);
  key.position.set(6, 9, 12);
  key.target.position.set(0, 0, 0);
  scene.add(key, key.target);

  // The green bounce that ties the products to the brand.
  const leafRim = new THREE.PointLight(0x2fd074, 95, 46, 1.7);
  leafRim.position.set(-8, -3, -4);
  scene.add(leafRim);

  const coolRim = new THREE.PointLight(0x8fb0ff, 62, 40, 1.7);
  coolRim.position.set(9, 5, -7);
  scene.add(coolRim);

  const front = new THREE.PointLight(0xd8ffe4, 42, 38, 1.7);
  front.position.set(3, -3, 11);
  scene.add(front);

  scene.add(new THREE.AmbientLight(0xdff5e6, 0.14));

  /* --- decorative background arcs ---------------------------------------- */
  const arcs = new THREE.Group();
  arcs.name = 'arcs';
  const arcSpecs = [
    { r: 17, tube: 0.012, color: 0x2fd074, opacity: 0.22, x: -13, y: -7, z: -9, tilt: 0.5 },
    { r: 24, tube: 0.02, color: 0x12b04a, opacity: 0.14, x: 15, y: 9, z: -14, tilt: -0.4 },
    { r: 12, tube: 0.008, color: 0xa6f2c6, opacity: 0.16, x: 11, y: -8, z: -11, tilt: 1.1 },
  ];
  const arcMeshes = [];
  for (const s of arcSpecs) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(s.r, s.tube, 8, 220, Math.PI * 1.45),
      new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: s.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.set(s.tilt, 0.4, s.tilt * 0.6);
    arcs.add(mesh);
    arcMeshes.push(mesh);
  }
  scene.add(arcs);

  /* --- dust -------------------------------------------------------------- */
  const glowTex = makeGlowSprite();
  const dust = createDust(glowTex);
  scene.add(dust.group);

  /* --- clusters ---------------------------------------------------------- */
  const stage = new THREE.Group();
  stage.name = 'stage';
  scene.add(stage);

  /** @type {Map<string, {group: THREE.Group, items: any[], kind: string, count: number, built: boolean}>} */
  const clusters = new Map();
  let activeId = null;
  const tweener = new Tweener();

  function ensureCluster(id) {
    if (clusters.has(id)) return clusters.get(id);
    const built = createCluster(id);
    built.group.visible = false;
    built.group.scale.setScalar(0.001);
    stage.add(built.group);
    const entry = { ...built, built: true, reveal: 0 };
    clusters.set(id, entry);
    return entry;
  }

  // Build the first product immediately; the rest lazily on first request so
  // the opening frame is fast.
  ensureCluster(initialId);

  /**
   * Cross-fade to a different product. The outgoing cluster spins up and
   * drifts away while the incoming one settles from a slight overshoot.
   */
  function showProduct(id, { instant = false } = {}) {
    if (id === activeId) return;
    const incoming = ensureCluster(id);
    const outgoing = activeId ? clusters.get(activeId) : null;
    activeId = id;

    // Snap the incoming cluster to its start pose.
    incoming.group.visible = true;
    incoming.group.position.set(0, 0, 0);

    if (instant || reduced) {
      if (outgoing) {
        outgoing.group.visible = false;
        outgoing.group.scale.setScalar(0.001);
        outgoing.reveal = 0;
      }
      incoming.reveal = 1;
      incoming.group.scale.setScalar(1);
      for (const it of incoming.items) {
        it.mesh.position.copy(it.base);
        it.mesh.scale.setScalar(it.mesh.userData.baseScale);
      }
      return;
    }

    tweener.add({
      duration: 1.15,
      ease: easeInOutCubic,
      onUpdate: (t) => {
        // Outgoing: shrink, spin and drift back.
        if (outgoing) {
          outgoing.reveal = 1 - t;
          const s = Math.max(0.001, 1 - t * t);
          outgoing.group.scale.setScalar(s);
          outgoing.group.rotation.y = t * 1.1;
          outgoing.group.position.y = t * 2.2;
          for (const it of outgoing.items) {
            it.mesh.scale.setScalar(it.mesh.userData.baseScale * Math.max(0.001, 1 - t * 1.3));
          }
        }
        // Incoming: rise into place from slightly below and behind.
        incoming.reveal = t;
        const s = Math.max(0.001, t);
        incoming.group.scale.setScalar(lerp(0.55, 1, easeOutCubic(t)));
        incoming.group.rotation.y = lerp(-0.7, 0, easeOutCubic(t));
        incoming.group.position.y = lerp(-1.6, 0, easeOutCubic(t));
        for (const it of incoming.items) {
          const local = clamp(t * 1.6 - it.phase * 0.02, 0, 1);
          const k = 1 - Math.pow(1 - local, 3);
          it.mesh.position.copy(it.base).multiplyScalar(lerp(0.4, 1, k));
          it.mesh.scale.setScalar(it.mesh.userData.baseScale * lerp(0.2, 1, k));
        }
      },
      onComplete: () => {
        if (outgoing) {
          outgoing.group.visible = false;
          outgoing.group.scale.setScalar(0.001);
          outgoing.group.position.set(0, 0, 0);
          outgoing.group.rotation.set(0, 0, 0);
          outgoing.reveal = 0;
        }
        incoming.group.scale.setScalar(1);
        incoming.group.rotation.set(0, 0, 0);
        incoming.group.position.set(0, 0, 0);
        for (const it of incoming.items) it.mesh.scale.setScalar(it.mesh.userData.baseScale);
      },
    });
  }

  showProduct(initialId, { instant: true });

  /* --- pointer parallax --------------------------------------------------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  if (!isTouchDevice()) {
    window.addEventListener('pointermove', onPointer, { passive: true });
  } else {
    window.addEventListener(
      'touchmove',
      (e) => {
        const t = e.touches[0];
        if (!t) return;
        pointer.tx = (t.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = -(t.clientY / window.innerHeight) * 2 + 1;
      },
      { passive: true },
    );
  }

  /* --- scroll state ------------------------------------------------------ */
  const scroll = { progress: 0, collection: 0, story: 0, velocity: 0, last: 0 };
  let dim = 0; // how far the 3D is pushed back for text-heavy sections

  /**
   * Called from the page scroll handler.
   * @param {object} s
   */
  function setScroll(s) {
    scroll.progress = s.progress;
    scroll.collection = s.collection;
    scroll.story = s.story;
    scroll.velocity = s.velocity;
    dim = s.dim;
  }

  /* --- post-processing ---------------------------------------------------- */
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
      colorSpace: THREE.LinearSRGBColorSpace,
    }),
  );
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.26, 0.6, 0.92);
  const grade = new ShaderPass(GradeShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);

  /* --- sizing ------------------------------------------------------------- */
  let dpr = Math.min(window.devicePixelRatio || 1, 1.8);
  let width = 1;
  let height = 1;

  function resize(force = false) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    if (!force && w === width && h === height) return false;
    width = w;
    height = h;
    camera.aspect = width / height;
    // Pull the camera back on narrow screens so the cluster still fits.
    camera.fov = width < 700 ? 56 : width < 1100 ? 48 : 42;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    bloom.setSize(width * dpr, height * dpr);
    return true;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
  // A canvas that is hidden, then revealed, or moved between displays can miss
  // the window resize event entirely — an observer catches those cases.
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
  }

  /* --- adaptive quality --------------------------------------------------- */
  let fpsAccum = 0;
  let fpsFrames = 0;
  let qualityChecks = 0;
  function monitor(dt) {
    if (qualityChecks > 6) return;
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum < 1.2) return;
    const fps = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
    qualityChecks++;
    const maxDpr = Math.min(window.devicePixelRatio || 1, 1.8);
    if (fps < 42 && dpr > 0.75) {
      dpr = Math.max(0.75, dpr - 0.35);
      resize(true);
    } else if (fps > 57 && dpr < maxDpr) {
      dpr = Math.min(maxDpr, dpr + 0.2);
      resize(true);
    }
  }

  /* --- animation ---------------------------------------------------------- */
  const clock = { last: performance.now(), time: 0 };
  const camTarget = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function frame(dt, now) {
    clock.time += dt;
    const t = clock.time;
    const motion = reduced ? 0 : 1;

    // Cheap self-heal: one integer compare catches any missed resize event.
    resize();

    tweener.update(dt);

    /* clusters ------------------------------------------------------- */
    const active = clusters.get(activeId);
    if (active) {
      // Slow group turn, slightly stronger while the collection is on screen.
      active.group.rotation.y = damp(
        active.group.rotation.y,
        t * 0.085 * motion + scroll.collection * 0.22,
        2.4,
        dt,
      );
      for (const it of active.items) {
        if (motion) {
          it.mesh.rotation.x += it.spin.x * dt;
          it.mesh.rotation.y += it.spin.y * dt;
          it.mesh.position.y = it.base.y + Math.sin(t * it.bob + it.phase) * it.amp;
          it.mesh.position.x = it.base.x + Math.cos(t * it.bob * 0.7 + it.phase) * it.amp * 0.55;
        }
      }
    }

    /* dust ----------------------------------------------------------- */
    const swirl = dust.systems.find((s) => s.kind === 'swirl');
    const bokeh = dust.systems.find((s) => s.kind === 'bokeh');
    const fine = dust.systems.find((s) => s.kind === 'fine');
    swirl.mat.uniforms.uTime.value = t;
    swirl.mat.uniforms.uOpacity.value = damp(
      swirl.mat.uniforms.uOpacity.value,
      0.85 - dim * 0.55 + scroll.collection * 0.35,
      3,
      dt,
    );
    swirl.mat.uniforms.uSize.value = 0.055 * dpr;

    if (motion && bokeh) {
      const pos = bokeh.points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const ph = bokeh.phase[i];
        pos.setY(i, bokeh.origin[i * 3 + 1] + Math.sin(t * 0.18 + ph) * 1.6);
        pos.setX(i, bokeh.origin[i * 3] + Math.cos(t * 0.11 + ph) * 1.1);
      }
      pos.needsUpdate = true;
      bokeh.points.rotation.y = t * 0.012;
    }
    if (motion && fine) {
      const pos = fine.points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + fine.speeds[i] * dt * 0.35;
        if (y > 14) y = -14;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    /* arcs ----------------------------------------------------------- */
    if (motion) {
      arcMeshes.forEach((m, i) => {
        m.rotation.z += (i % 2 ? 1 : -1) * dt * (0.012 + i * 0.006);
      });
      arcs.rotation.y = Math.sin(t * 0.05) * 0.06;
    }

    /* camera --------------------------------------------------------- */
    pointer.x = damp(pointer.x, pointer.tx, 3.2, dt);
    pointer.y = damp(pointer.y, pointer.ty, 3.2, dt);

    // A short dolly: hero → collection, with a lift for the story section.
    const zoom = 1 - scroll.collection * 0.42 - scroll.progress * 0.06;
    const dolly = 11.4 * zoom;
    const lift = scroll.story * 1.6 + scroll.collection * -0.5;

    camTarget.set(
      pointer.x * 2.3 + scroll.collection * -1.1,
      pointer.y * 1.5 + lift,
      dolly,
    );
    camera.position.x = damp(camera.position.x, camTarget.x, 2.6, dt);
    camera.position.y = damp(camera.position.y, camTarget.y, 2.6, dt);
    camera.position.z = damp(camera.position.z, camTarget.z, 2.2, dt);

    // The hero centres the cluster; the collection slides it clear of the
    // detail panel on the left. Turning the look target left pushes the
    // cluster to the right of frame.
    const offset = width > 980 ? lerp(0, -1.5, scroll.collection) : 0;
    camLook.set(pointer.x * -0.5 + offset, pointer.y * -0.35 + lift * 0.3, 0);
    camera.lookAt(camLook);

    /* stage visibility ------------------------------------------------ */
    key.intensity = lerp(165, 78, dim);
    grade.uniforms.uVignette.value = lerp(1.05, 1.35, dim);
    bloom.strength = lerp(0.26, 0.15, dim);

    /* render ---------------------------------------------------------- */
    grade.uniforms.uTime.value = t;
    composer.render(dt);
    monitor(dt);
    onFrame?.(dt, { activeId, dim });
  }

  const stop = startLoop(frame);

  /* ---------------------------------------------------------------------- */
  /*  Switcher thumbnails                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Render one frame of a product into a data URL for the switcher pills.
   *
   * Rendering into a render target bypasses the renderer's tone mapping and
   * output colour-space conversion, so a half-float target is used and both
   * steps are applied here while the pixels are copied into the 2D canvas.
   */
  function thumbnail(id, w = 132, h = 88) {
    const entry = clusters.get(id) || ensureCluster(id);

    // A photo-backed cluster (star anise) paints black until its image has
    // decoded. Returning null keeps the caller's retry loop alive instead of
    // caching a black frame as the pill artwork for good.
    if (typeof entry.notReady === 'function' && entry.notReady()) return null;

    const pw = w * 2;
    const ph = h * 2;

    const restore = [];
    const prevTarget = renderer.getRenderTarget();
    const rt = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType });
    const pixels = new Uint16Array(pw * ph * 4);

    try {
      // A lazily built cluster is parked at zero scale and hidden. Undo that
      // BEFORE measuring, otherwise the bounding box is a millionth of the
      // real thing and the whole cluster falls outside the capture frame.
      const wasVisible = entry.group.visible;
      const wasScale = entry.group.scale.clone();
      const wasPos = entry.group.position.clone();
      const wasRot = entry.group.rotation.clone();

      entry.group.visible = true;
      entry.group.scale.setScalar(1);
      entry.group.position.set(0, 0, 0);
      entry.group.rotation.set(0, 0, 0);

      restore.push(() => {
        entry.group.visible = wasVisible;
        entry.group.scale.copy(wasScale);
        entry.group.position.copy(wasPos);
        entry.group.rotation.copy(wasRot);
      });

      // Frame the cluster: recentre, hide everything else, clear to alpha 0.
      const box = new THREE.Box3().setFromObject(entry.group);
      const centre = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() * 0.5 || 1;
      entry.group.position.sub(centre);

      for (const [key, c] of clusters) {
        if (c === entry) continue;
        const was = c.group.visible;
        c.group.visible = false;
        restore.push(() => {
          c.group.visible = was;
        });
      }
      for (const [obj, prop] of [
        [arcs, 'visible'],
        [dust.group, 'visible'],
      ]) {
        const was = obj[prop];
        obj[prop] = false;
        restore.push(() => {
          obj[prop] = was;
        });
      }

      const prevBg = scene.background;
      scene.background = null;
      restore.push(() => {
        scene.background = prevBg;
      });

      const prevFog = scene.fog;
      scene.fog = null;
      restore.push(() => {
        scene.fog = prevFog;
      });

      const prevEnv = scene.environmentIntensity;
      scene.environmentIntensity = 1.4;
      restore.push(() => {
        scene.environmentIntensity = prevEnv;
      });

      const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 8);
      cam.position.set(0, 0, radius * 3);
      cam.lookAt(0, 0, 0);

      renderer.setClearAlpha(0);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, pw, ph, pixels);

      const exposure = renderer.toneMappingExposure;
      const cnv = document.createElement('canvas');
      cnv.width = pw;
      cnv.height = ph;
      const ctx = cnv.getContext('2d');
      const img = ctx.createImageData(pw, ph);

      for (let y = 0; y < ph; y++) {
        // GL reads bottom-up; the canvas wants top-down.
        const srcRow = (ph - 1 - y) * pw * 4;
        const dstRow = y * pw * 4;
        for (let x = 0; x < pw; x++) {
          const s = srcRow + x * 4;
          const d = dstRow + x * 4;
          if (pixels[s + 3] === 0) {
            img.data[d + 3] = 0;
            continue;
          }
          for (let c = 0; c < 3; c++) {
            const linear = halfToFloat(pixels[s + c]) * exposure;
            const mapped = acesFilmic(linear);
            // Linear -> sRGB transfer.
            img.data[d + c] = Math.round(
              (mapped <= 0.0031308
                ? mapped * 12.92
                : 1.055 * Math.pow(Math.max(mapped, 0), 1 / 2.4) - 0.055) *
                255,
            );
          }
          // Premultiplied source alpha -> straight alpha for the 2D canvas.
          const a = halfToFloat(pixels[s + 3]);
          img.data[d + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      return cnv.toDataURL('image/png');
    } catch (err) {
      console.warn('[vava] thumbnail failed for', id, err);
      return null;
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setClearAlpha(1);
      rt.dispose();
      for (let i = restore.length - 1; i >= 0; i--) restore[i]();
    }
  }

  /**
   * Render the live scene through the full post chain into a data URL.
   * Debug aid: the renderer's drawing buffer is not preserved, so reading the
   * canvas directly would come back empty.
   */
  function capture(maxW = 1280, maxH = 760) {
    const prevScreen = composer.renderToScreen;
    // Never read outside the buffer — that region comes back as zeros.
    //
    // EffectComposer.setSize multiplies by the pixel ratio without flooring,
    // so the buffer can report a fractional size (714.4 x 599.45 on a 1.43x
    // display). A fractional length throws inside the typed-array allocation
    // and the whole capture comes back blank, so round first.
    const w = Math.max(1, Math.min(maxW, Math.floor(composer.readBuffer.width)));
    const h = Math.max(1, Math.min(maxH, Math.floor(composer.readBuffer.height)));
    try {
      composer.renderToScreen = false;
      composer.render();
      // OutputPass already tone mapped and sRGB-encoded into this buffer, so
      // the half floats only need widening to 8 bit.
      const pixels = new Uint16Array(w * h * 4);
      renderer.readRenderTargetPixels(composer.readBuffer, 0, 0, w, h, pixels);
      const cnv = document.createElement('canvas');
      cnv.width = w;
      cnv.height = h;
      const ctx = cnv.getContext('2d');
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const srcRow = (h - 1 - y) * w * 4;
        const dstRow = y * w * 4;
        for (let x = 0; x < w; x++) {
          const s = srcRow + x * 4;
          const d = dstRow + x * 4;
          for (let c = 0; c < 4; c++) {
            img.data[d + c] = copy(halfToFloat(pixels[s + c]));
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      return cnv.toDataURL('image/png');
    } catch (err) {
      console.warn('[vava] capture failed', err);
      return null;
    } finally {
      composer.renderToScreen = prevScreen;
    }
  }

  function prime() {
    // Compile up front and signal readiness synchronously. Deferring this to
    // requestAnimationFrame makes readiness depend on the page painting, which
    // never happens in a backgrounded or throttled tab.
    try {
      renderer.compile(scene, camera);
    } catch (err) {
      console.warn('[vava] shader precompile skipped', err);
    }
    onReady?.();
  }

  return {
    THREE,
    renderer,
    scene,
    camera,
    composer,
    showProduct,
    setScroll,
    thumbnail,
    capture,
    prime,
    dispose: () => {
      stop();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', resize);
      composer.dispose();
      renderer.dispose();
    },
    get activeId() {
      return activeId;
    },
  };
}
