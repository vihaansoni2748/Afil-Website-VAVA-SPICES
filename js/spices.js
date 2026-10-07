/**
 * Procedural spice library.
 *
 * Every product on the site is generated in code: a parametric surface (or a
 * displaced icosphere) for the solid, a canvas-drawn texture for the skin, and
 * a physical material tuned for that particular spice. Nothing is loaded from
 * an image, so the whole catalogue ships inside this file.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TAU,
  clamp,
  lerp,
  rng,
  makeNoise3D,
  fbm,
  surfaceGeometry,
} from './lib.js';

/* ======================================================================== */
/*  Catalogue                                                               */
/* ======================================================================== */

export const CATALOG = [
  {
    id: 'cardamom',
    name: 'Green Cardamom',
    latin: 'Elettaria cardamomum',
    accent: '#7fc46a',
    tagline: 'The Queen of Spices',
    origin: 'Idukki, Kerala',
    grade: '8mm Bold',
    specs: [
      ['Moisture', 'Below 12%'],
      ['Screen', '8 – 10 mm'],
      ['Crop', '2025 harvest'],
    ],
    price: 1850,
    unit: 'per kg',
    blurb:
      'Hand-picked from the cardamom estates of Idukki, where the mist keeps the pods fat and the oils dense. Sorted pod by pod — only the plumped, seam-tight survivors reach the grading table.',
    notes: ['Eucalyptus', 'Citrus peel', 'Green floral', 'Sweet resin'],
    meters: [
      ['Aroma', 92],
      ['Heat', 18],
      ['Bite', 34],
      ['Balance', 88],
    ],
  },
  {
    id: 'pepper',
    name: 'Black Pepper',
    latin: 'Piper nigrum',
    accent: '#9a8a7a',
    tagline: 'Monsoon-Ripened',
    origin: 'Malabar Coast',
    grade: 'Tellicherry TGSEB',
    specs: [
      ['Moisture', 'Below 11%'],
      ['Density', '550 g/l'],
      ['Grade', 'TGSEB'],
    ],
    price: 980,
    unit: 'per kg',
    blurb:
      'Sun-dried on the Malabar coast and garbled on site so only the heaviest, most uniform berries survive. Wreath-drying locks in the piperine and that bright citrus note over black peppercorn.',
    notes: ['Citrus peel', 'Warm woods', 'Floral', 'Clean heat'],
    meters: [
      ['Aroma', 86],
      ['Heat', 84],
      ['Bite', 78],
      ['Balance', 74],
    ],
  },
  {
    id: 'clove',
    name: 'Cloves',
    latin: 'Syzygium aromaticum',
    accent: '#a35f37',
    tagline: 'Whole Unbroken',
    origin: 'Malabar Coast',
    grade: 'SHS / Hand Sorted',
    specs: [
      ['Moisture', 'Below 10%'],
      ['Eugenol', '15 – 20%'],
      ['Form', 'Whole cloves'],
    ],
    price: 1450,
    unit: 'per kg',
    blurb:
      'Picked while still pink and slow-dried on racks so each clove keeps its snap. Nothing ground, nothing bleached — the oils stay where nature put them.',
    notes: ['Eugenol', 'Warm honey', 'Dried fruit', 'Heat'],
    meters: [
      ['Aroma', 95],
      ['Heat', 71],
      ['Bite', 52],
      ['Balance', 69],
    ],
  },
  {
    id: 'turmeric',
    name: 'Turmeric',
    latin: 'Curcuma longa',
    accent: '#e0a13c',
    tagline: 'High-Curcumin Rhizome',
    origin: 'Erode · Kerala',
    grade: 'Curcumin 5%+',
    specs: [
      ['Curcumin', 'Above 5%'],
      ['Moisture', 'Below 9%'],
      ['Form', 'Rhizome / Powder'],
    ],
    price: 720,
    unit: 'per kg',
    blurb:
      'Finger rhizomes from the Erode belt and the Kerala borderlands, cured in the sun until the interior goes that deep saffron orange. Graded on curcumin, not on colour alone.',
    notes: ['Earth', 'Ginger', 'Warm milk', 'Bitter edge'],
    meters: [
      ['Aroma', 58],
      ['Heat', 22],
      ['Bite', 30],
      ['Balance', 91],
    ],
  },
  {
    id: 'cinnamon',
    name: 'Cinnamon Quill',
    latin: 'Cinnamomum verum',
    accent: '#b5763f',
    tagline: 'Hand-Rolled Bark',
    origin: 'Kerala · Ceylon',
    grade: '8" Long Cut',
    specs: [
      ['Length', '7 – 9 inch'],
      ['Quills', 'Single / Double'],
      ['Thickness', 'Below 1 mm'],
    ],
    price: 1650,
    unit: 'per kg',
    blurb:
      'Inner bark peeled from young shoots and rolled by hand into tight quills, then dried in the shade so the sweetness holds. Each roll is a length we know the cutter behind.',
    notes: ['Sweet bark', 'Clove', 'Citrus', 'Wood'],
    meters: [
      ['Aroma', 79],
      ['Heat', 44],
      ['Bite', 47],
      ['Balance', 94],
    ],
  },
  {
    id: 'star',
    name: 'Star Anise',
    latin: 'Illicium verum',
    accent: '#8d5a33',
    tagline: 'Eight-Point Whole Pods',
    origin: 'Traded via Kochi',
    grade: 'Grade 1 Whole',
    specs: [
      ['Points', '8 (intact)'],
      ['Moisture', 'Below 10%'],
      ['Form', 'Whole star'],
    ],
    price: 1340,
    unit: 'per kg',
    blurb:
      'Whole eight-point stars, no broken rays and no filler seeds in the centre. Licorice-sweet and warming — the finishing note in a masala, or steeped whole into chai.',
    notes: ['Anise', 'Licorice', 'Sweet wood', 'Mint'],
    meters: [
      ['Aroma', 88],
      ['Heat', 38],
      ['Bite', 41],
      ['Balance', 85],
    ],
  },
];

export const byId = (id) => CATALOG.find((p) => p.id === id) || CATALOG[0];

/* ======================================================================== */
/*  Canvas textures                                                         */
/* ======================================================================== */

const TEX = 512;

/**
 * A 2D canvas for painting a texture.
 *
 * `readback` must be set on the *first* getContext call for it to stick —
 * every later getContext('2d') on the same canvas returns the original
 * context and ignores the flag. The spice skins are painted and then read back
 * by applyContrast / applySaturation / dominantHue, so they ask for the
 * CPU-backed path and skip a GPU round trip per pixel.
 */
function canvas2d(size = TEX, { readback = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  return { c, ctx, size };
}

function toTexture(canvas, { srgb = true, repeat = 1, aniso = 8, contrast = 1, saturation = 1 } = {}) {
  if (contrast > 1) applyContrast(canvas, contrast);
  if (saturation !== 1) applySaturation(canvas, saturation);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Push a texture away from its midpoint.
 *
 * Procedurally painted spice skins come out washed out because every stroke
 * is low-alpha over a mid tone. A contrast curve restores the bite without
 * having to redraw each one.
 */
function applyContrast(canvas, amount) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c] / 255;
      d[i + c] = clamp((v - 0.5) * amount + 0.5, 0, 1) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Push colour away from (or towards) its own grey.
 *
 * Procedural paint is desaturated by construction — every stroke is a low-alpha
 * blend over a neighbouring tone — so a spice ends up looking dusty even when
 * the recipe is right. This recovers the chroma without touching the value, so
 * the texture keeps its shading and only gains colour.
 */
function applySaturation(canvas, amount) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
    for (let c = 0; c < 3; c++) {
      d[i + c] = clamp((d[i + c] / 255 - luma) * amount + luma, 0, 1) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Average hue of a painted texture, in 0..1.
 *
 * Used to tint per-piece material variants. The tint has to start from each
 * spice's own colour — forcing a single brand hue across the catalogue turns
 * black pepper and cinnamon bark green.
 */
function dominantHue(canvas) {
  try {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    // One sample is the average; blur it so the alpha is not discarded.
    ctx.filter = 'blur(1px)';
    ctx.drawImage(canvas, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 6) return 0.08; // effectively neutral
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return ((h / 6) % 1 + 1) % 1;
  } catch {
    return 0.08;
  }
}

/** Find the first colour texture on a material (which may be an array). */
function firstColourMap(material) {
  const list = Array.isArray(material) ? material : [material];
  for (const m of list) {
    const map = m?.map;
    if (map?.image && typeof map.image.getContext === 'function') return map.image;
  }
  return null;
}

/**
 * Bake a shading term into a vertex-colour attribute.
 *
 * This is what stops a painted texture from reading as plastic: the rib
 * grooves and surface creases get a real ambient-occlusion falloff that
 * moves with the form instead of sliding across it.
 *
 * @param {THREE.BufferGeometry} geo
 * @param {(u:number, v:number, x:number, y:number, z:number) => number} fn
 */
function bakeVertexShade(geo, fn) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = clamp(
      fn(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, pos.getX(i), pos.getY(i), pos.getZ(i)),
      0,
      2,
    );
    // Slightly warm in the light, slightly cool in the shadow.
    colors[i * 3] = k * 1.015;
    colors[i * 3 + 1] = k;
    colors[i * 3 + 2] = k * 0.965;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Give a geometry a flat vertex-colour attribute.
 *
 * mergeGeometries requires every input to carry the same attribute set, so
 * helper pieces (stems, bosses) need the attribute even though they are
 * shaded uniformly.
 */
function flatVertexShade(geo, k = 1) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3).fill(k);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Soft round sprite used by the dust / bokeh particle systems. */
export function makeGlowSprite(inner = 'rgba(205,255,225,1)', outer = 'rgba(56,214,138,0)') {
  const { c, ctx, size } = canvas2d(128);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, 'rgba(120,240,175,0.45)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* --- cardamom ----------------------------------------------------------- */

function cardamomTexture(seed) {
  const S = 1024;
  const { c, ctx, size } = canvas2d(S, { readback: true });
  const r = rng(seed);

  // Green cardamom is GREEN — a bright, slightly yellow grass green at the
  // beak settling into a deeper leaf green at the stem. The earlier ramp ran
  // straw-to-olive and read as a dried pod rather than a fresh green one.
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#bfe07a');
  grad.addColorStop(0.1, '#a9d965');
  grad.addColorStop(0.34, '#8ecc52');
  grad.addColorStop(0.62, '#71bb46');
  grad.addColorStop(0.86, '#57a83d');
  grad.addColorStop(1.0, '#439136');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Broad bleached / shaded patches so the batch does not read as one hue.
  for (let i = 0; i < 170; i++) {
    const rad = r.range(size * 0.03, size * 0.16);
    const x = r.range(rad, size - rad);
    const y = r.range(rad, size - rad);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const pale = r.next() > 0.5;
    g.addColorStop(
      0,
      pale
        ? `rgba(${r.int(196, 226)},${r.int(226, 244)},${r.int(150, 190)},${r.range(0.05, 0.16)})`
        : `rgba(${r.int(64, 96)},${r.int(118, 156)},${r.int(56, 92)},${r.range(0.05, 0.17)})`,
    );
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // The geometry twists its ribs by 1.9 rad along the body, so the painted ribs
  // are sheared to match. Without this the shading slides across the form as the
  // pod turns, which is what made it read as printed stripes on a balloon.
  const ribs = POD_RIBS;
  const step = size / ribs;
  const shear = 1.9 / (TAU * ribs);
  ctx.save();
  ctx.transform(1, 0, shear, 1, -shear * size, 0);
  for (let i = -1; i <= ribs; i++) {
    const x = i * step;
    const g = ctx.createLinearGradient(x, 0, x + step, 0);
    g.addColorStop(0.0, 'rgba(238,246,198,0.16)'); // crest
    g.addColorStop(0.16, 'rgba(162,178,98,0.04)');
    g.addColorStop(0.5, 'rgba(42,52,20,0.4)'); // groove
    g.addColorStop(0.84, 'rgba(162,178,98,0.04)');
    g.addColorStop(1.0, 'rgba(238,246,198,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(x, -size, step, size * 3);
  }
  ctx.restore();

  // Papery longitudinal fibres between the ribs.
  for (let i = 0; i < 1400; i++) {
    const x = r.range(0, size);
    const light = r.next() > 0.5;
    ctx.strokeStyle = light
      ? `rgba(${r.int(216, 244)},${r.int(240, 252)},${r.int(176, 216)},${r.range(0.04, 0.13)})`
      : `rgba(${r.int(78, 114)},${r.int(126, 166)},${r.int(58, 96)},${r.range(0.05, 0.16)})`;
    ctx.lineWidth = r.range(0.6, 2.6);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + r.range(-10, 10),
      size * 0.35,
      x + r.range(-10, 10),
      size * 0.7,
      x + r.range(-8, 8),
      size,
    );
    ctx.stroke();
  }

  // Brown lenticel specks and drying scars — sparse, they are blemishes on a
  // green pod, not the base colour.
  for (let i = 0; i < 900; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(0.6, 3.0) * (size / 512);
    ctx.fillStyle = `rgba(${r.int(96, 138)},${r.int(112, 152)},${r.int(52, 86)},${r.range(0.05, 0.26)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * r.range(1, 2.6), r.range(0, TAU), 0, TAU);
    ctx.fill();
  }

  // A whisper of straw at the very beak and a touch of shade at the stem —
  // both subtle enough that the pod still reads unmistakably green.
  const tip = ctx.createLinearGradient(0, 0, 0, size * 0.12);
  tip.addColorStop(0, 'rgba(226,238,168,0.34)');
  tip.addColorStop(1, 'rgba(226,238,168,0)');
  ctx.fillStyle = tip;
  ctx.fillRect(0, 0, size, size * 0.12);

  const base = ctx.createLinearGradient(0, size * 0.86, 0, size);
  base.addColorStop(0, 'rgba(52,96,44,0)');
  base.addColorStop(1, 'rgba(46,88,42,0.4)');
  ctx.fillStyle = base;
  ctx.fillRect(0, size * 0.86, size, size * 0.14);

  return c;
}

/* --- pepper ------------------------------------------------------------- */

function pepperTexture(seed) {
  const { c, ctx, size } = canvas2d(TEX, { readback: true });
  const r = rng(seed);
  ctx.fillStyle = '#191009';
  ctx.fillRect(0, 0, size, size);

  // Broad colour drift so the batch is not one flat brown.
  for (let i = 0; i < 90; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(50, 180);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r.next() > 0.45;
    g.addColorStop(
      0,
      warm
        ? `rgba(${r.int(74, 104)},${r.int(50, 72)},${r.int(30, 46)},${r.range(0.12, 0.3)})`
        : `rgba(${r.int(30, 44)},${r.int(20, 32)},${r.int(14, 24)},${r.range(0.12, 0.3)})`,
    );
    g.addColorStop(1, 'rgba(20,14,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // The signature of a dried peppercorn is a reticulated network: pale, raised
  // plates separated by near-black crevices. Painting a dense field of soft
  // light discs leaves exactly that net behind - the discs become the plates
  // and the uncovered base shows through as the fissures.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 520; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(9, 26);
    const g = ctx.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    const bright = r.next() > 0.35;
    g.addColorStop(
      0,
      bright
        ? `rgba(${r.int(96, 136)},${r.int(76, 108)},${r.int(58, 84)},${r.range(0.3, 0.62)})`
        : `rgba(${r.int(74, 104)},${r.int(56, 80)},${r.int(40, 60)},${r.range(0.22, 0.46)})`,
    );
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Fine crazing across the plates.
  for (let i = 0; i < 900; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    ctx.strokeStyle = `rgba(10,6,4,${r.range(0.12, 0.44)})`;
    ctx.lineWidth = r.range(0.5, 1.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + r.range(-14, 14),
      y + r.range(-14, 14),
      x + r.range(-26, 26),
      y + r.range(-26, 26),
    );
    ctx.stroke();
  }

  // Dusty bloom on the highest plates.
  for (let i = 0; i < 260; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(4, 14);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${r.int(126, 166)},${r.int(112, 146)},${r.int(96, 126)},${r.range(0.05, 0.16)})`);
    g.addColorStop(1, 'rgba(120,110,96,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

/* --- clove -------------------------------------------------------------- */

function cloveTexture(seed) {
  const S = 1024;
  const { c, ctx, size } = canvas2d(S, { readback: true });
  const r = rng(seed);

  // Canvas top = the crown (four sepals), bottom = the stalk tip.
  // A dried clove is deep reddish-brown, darkest at the crown and at the stalk
  // tip, warmest across the belly of the head where the oil sits. The head only
  // owns the top 40% of the texture now that the stalk owns the rest.
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#2a1409');
  grad.addColorStop(0.1, '#452211');
  grad.addColorStop(0.26, '#6e3a1d');
  grad.addColorStop(0.4, '#5c2f17');
  grad.addColorStop(0.66, '#4d2813');
  grad.addColorStop(0.86, '#3d1f0e');
  grad.addColorStop(1.0, '#331809');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Broad oily patches: clove oil pools unevenly and darkens as it oxidises.
  for (let i = 0; i < 150; i++) {
    const rad = r.range(size * 0.03, size * 0.18);
    const x = r.range(rad, size - rad);
    const y = r.range(rad, size - rad);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r.next() > 0.45;
    g.addColorStop(
      0,
      dark
        ? `rgba(${r.int(24, 42)},${r.int(12, 24)},${r.int(5, 13)},${r.range(0.1, 0.3)})`
        : `rgba(${r.int(126, 172)},${r.int(66, 100)},${r.int(30, 54)},${r.range(0.07, 0.2)})`,
    );
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Longitudinal wrinkles down the head. Real cloves shrivel as they dry and
  // the furrows are deep - hard-edged, not soft, so they survive at any scale.
  for (let i = 0; i < 260; i++) {
    const x = r.range(-size * 0.05, size * 1.05);
    const w = r.range(1.2, 5.5);
    const dark = r.next() > 0.35;
    ctx.strokeStyle = dark
      ? `rgba(${r.int(16, 30)},${r.int(8, 17)},${r.int(3, 9)},${r.range(0.28, 0.6)})`
      : `rgba(${r.int(148, 196)},${r.int(78, 116)},${r.int(38, 66)},${r.range(0.1, 0.3)})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, r.range(-size * 0.05, size * 0.1));
    ctx.bezierCurveTo(
      x + r.range(-16, 16),
      size * 0.35,
      x + r.range(-16, 16),
      size * 0.7,
      x + r.range(-12, 12),
      r.range(size * 0.9, size * 1.05),
    );
    ctx.stroke();
  }

  // Fine secondary striations between the deep furrows.
  for (let i = 0; i < 700; i++) {
    const x = r.range(0, size);
    ctx.strokeStyle =
      r.next() > 0.5
        ? `rgba(${r.int(120, 164)},${r.int(62, 94)},${r.int(28, 50)},${r.range(0.06, 0.2)})`
        : `rgba(${r.int(28, 48)},${r.int(14, 26)},${r.int(6, 14)},${r.range(0.08, 0.26)})`;
    ctx.lineWidth = r.range(0.6, 2.2);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + r.range(-8, 8), size * 0.4, x + r.range(-8, 8), size * 0.6, x, size);
    ctx.stroke();
  }

  // The crown: four sepal seams radiating from the very top.
  for (let i = 0; i < 4; i++) {
    const x = ((i + 0.5) / 4) * size;
    const g = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
    g.addColorStop(0, 'rgba(20,10,5,0)');
    g.addColorStop(0.5, 'rgba(16,8,4,0.62)');
    g.addColorStop(1, 'rgba(20,10,5,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 26, 0, 52, size * 0.1);
  }
  // Dark cap over the crown itself.
  const cap = ctx.createLinearGradient(0, 0, 0, size * 0.08);
  cap.addColorStop(0, 'rgba(14,7,3,0.72)');
  cap.addColorStop(1, 'rgba(14,7,3,0)');
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, size, size * 0.08);

  // Dusty bloom - sun-dried buds are never glossy, and the stalk carries the
  // most of it.
  for (let i = 0; i < 420; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(size * 0.008, size * 0.05);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const lift = y / size > 0.72 ? 0.16 : 0.1;
    g.addColorStop(0, `rgba(${r.int(126, 168)},${r.int(96, 130)},${r.int(74, 104)},${r.range(0.03, lift)})`);
    g.addColorStop(1, 'rgba(120,94,76,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // A few broken/bruised marks where buds rubbed together in the basket.
  for (let i = 0; i < 60; i++) {
    const x = r.range(0, size);
    const y = r.range(size * 0.1, size * 0.9);
    const rad = r.range(size * 0.01, size * 0.035);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${r.int(18, 32)},${r.int(9, 18)},${r.int(4, 10)},${r.range(0.25, 0.55)})`);
    g.addColorStop(1, 'rgba(20,10,5,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  return c;
}

/* --- turmeric ----------------------------------------------------------- */

function turmericTexture(seed) {
  const { c, ctx, size } = canvas2d(TEX, { readback: true });
  const r = rng(seed);
  ctx.fillStyle = '#a8650f';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(4, 26);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const bright = r.next();
    const col = bright > 0.5 ? '222,150,40' : '118,62,10';
    g.addColorStop(0, `rgba(${col},${r.range(0.12, 0.4)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Growth nodes / skin wrinkles.
  for (let i = 0; i < 90; i++) {
    const y = r.range(0, size);
    ctx.strokeStyle = `rgba(84,42,6,${r.range(0.16, 0.4)})`;
    ctx.lineWidth = r.range(2, 6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + r.range(-18, 18), size * 0.7, y + r.range(-18, 18), size, y);
    ctx.stroke();
  }
  return c;
}

/* --- cinnamon ----------------------------------------------------------- */

function cinnamonTexture(seed) {
  const { c, ctx, size } = canvas2d(TEX, { readback: true });
  const r = rng(seed);
  ctx.fillStyle = '#7d4c26';
  ctx.fillRect(0, 0, size, size);

  // Broad tonal drift along the quill. Inner bark is far more even than the
  // heavily worked outer bark, so the variation stays soft and wide.
  for (let i = 0; i < 70; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(60, 190);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const light = r.next() > 0.5;
    g.addColorStop(
      0,
      light
        ? `rgba(${r.int(186, 220)},${r.int(132, 164)},${r.int(78, 106)},${r.range(0.06, 0.18)})`
        : `rgba(${r.int(72, 104)},${r.int(40, 62)},${r.int(20, 36)},${r.range(0.06, 0.18)})`,
    );
    g.addColorStop(1, 'rgba(140,90,48,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Long, fine grain running the length of the quill (u wraps around, v runs
  // along it). Low alpha and soft widths: hard strokes read as wood grain, not
  // as bark.
  for (let i = 0; i < 1100; i++) {
    const x = r.range(0, size);
    const light = r.next() > 0.5;
    ctx.strokeStyle = light
      ? `rgba(${r.int(184, 226)},${r.int(134, 170)},${r.int(84, 116)},${r.range(0.04, 0.15)})`
      : `rgba(${r.int(64, 96)},${r.int(34, 56)},${r.int(16, 32)},${r.range(0.05, 0.17)})`;
    ctx.lineWidth = r.range(0.7, 3.2);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + r.range(-7, 7), size * 0.35, x + r.range(-7, 7), size * 0.7, x + r.range(-5, 5), size);
    ctx.stroke();
  }

  // The seam where the bark was rolled — one soft dark line with a pale lip.
  const seam = size * r.range(0.3, 0.7);
  const seamGrad = ctx.createLinearGradient(seam - 22, 0, seam + 22, 0);
  seamGrad.addColorStop(0, 'rgba(150,100,54,0)');
  seamGrad.addColorStop(0.42, 'rgba(60,32,14,0.26)');
  seamGrad.addColorStop(0.62, 'rgba(214,164,112,0.14)');
  seamGrad.addColorStop(1, 'rgba(150,100,54,0)');
  ctx.fillStyle = seamGrad;
  ctx.fillRect(seam - 22, 0, 44, size);

  // Fine pores in the cut face of the bark.
  for (let i = 0; i < 1400; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    ctx.fillStyle = `rgba(${r.int(44, 74)},${r.int(22, 42)},${r.int(10, 24)},${r.range(0.05, 0.2)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r.range(0.5, 2.2), r.range(0.5, 1.6), 0, 0, TAU);
    ctx.fill();
  }
  return c;
}

/** Concentric growth rings for the cut ends of a cinnamon quill. */
function cinnamonEndTexture(seed) {
  const { c, ctx, size } = canvas2d(256, { readback: true });
  const r = rng(seed);
  ctx.fillStyle = '#b5763f';
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  for (let ring = 1; ring < 16; ring++) {
    ctx.beginPath();
    // Slightly noisy circles — a real cut end is never a clean ring.
    for (let a = 0; a <= TAU + 0.01; a += 0.08) {
      const rad = (ring / 16) * size * 0.46 * (1 + (r.next() - 0.5) * 0.07);
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = ring % 2 ? `rgba(96,54,24,${r.range(0.3, 0.6)})` : `rgba(210,158,102,${r.range(0.2, 0.4)})`;
    ctx.lineWidth = r.range(1.4, 4);
    ctx.stroke();
  }
  return c;
}

/* --- star anise --------------------------------------------------------- */

function starTexture(seed) {
  const { c, ctx, size } = canvas2d(TEX, { readback: true });
  const r = rng(seed);
  ctx.fillStyle = '#4e2c13';
  ctx.fillRect(0, 0, size, size);

  // Grain running along each lobe — lobes point along U.
  for (let i = 0; i < 1800; i++) {
    const y = r.range(0, size);
    const light = r.next() > 0.62;
    ctx.strokeStyle = light
      ? `rgba(${r.int(168, 206)},${r.int(118, 152)},${r.int(70, 98)},${r.range(0.05, 0.18)})`
      : `rgba(${r.int(38, 68)},${r.int(18, 40)},${r.int(8, 24)},${r.range(0.08, 0.32)})`;
    ctx.lineWidth = r.range(0.7, 3.4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + r.range(-10, 10), size * 0.7, y + r.range(-10, 10), size, y + r.range(-6, 6));
    ctx.stroke();
  }
  // Oil sheen dots.
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(240,190,120,${r.range(0.02, 0.1)})`;
    ctx.beginPath();
    ctx.arc(r.range(0, size), r.range(0, size), r.range(0.6, 2.4), 0, TAU);
    ctx.fill();
  }
  return c;
}

/* ======================================================================== */
/*  Geometry                                                                */
/* ======================================================================== */

const POD_RIBS = 10;

/**
 * A cardamom pod: a ribbed, slightly bent teardrop with a dry stem at the
 * base. `v` runs base → beak, `u` runs around the pod.
 *
 * Real 8mm pods are roughly 2.6 : 1 long to wide, which is what `radius`
 * below encodes — get that ratio wrong and they read as almonds, not pods.
 */
function buildCardamomPod({ length = 1, seed = 7, belly = 0.34 } = {}) {
  const noise = makeNoise3D(seed);
  // Plumper than life: a strictly 2.6:1 pod silhouettes as a leaf, and the
  // extra girth is what makes it read as a seed at a glance.
  const radius = 0.262 * length;

  const fn = (u, v, out) => {
    const th = u * TAU;
    const t = v;

    // Silhouette. The stem end has to be BLUNT — a pod is a closed capsule
    // with a beak, not a lens. A slow rise at the base (exponent 0.26 reaches
    // 40% of full width in the first 5% of the length) keeps the bottom round
    // while still closing the mesh at v = 0, so there is no open hole.
    let r;
    if (t < belly) {
      r = Math.pow(t / belly, 0.26);
    } else {
      const k = (1 - t) / (1 - belly);
      r = Math.pow(k, 0.92);
    }

    // Ribs fade out towards both tips so the silhouette stays clean.
    const ribFade = Math.pow(Math.sin(Math.PI * clamp(t * 1.04, 0, 1)), 0.35);
    const ribPhase = th * POD_RIBS + t * 1.9;
    r *= 1 + Math.cos(ribPhase) * 0.022 * ribFade;

    // Organic asymmetry so no two reads are identical.
    r *= 1 + noise(Math.cos(th) * 1.5, Math.sin(th) * 1.5, t * 3.1) * 0.035;

    const rr = r * radius;
    // Slight lateral flattening — real pods are not round.
    const z = Math.sin(th) * rr * 0.95;
    const x = Math.cos(th) * rr;
    // Gentle banana bend down the spine.
    const bend = Math.sin(t * Math.PI) * 0.05 * length + (t - 0.35) * 0.028 * length;
    out[0] = x + bend;
    out[1] = (t - 0.5) * length;
    out[2] = z;
  };

  // Ten ribs need enough samples each or the cosine aliases into hard facets, so
  // the ring count is tied to the rib count. Twelve per rib keeps the grooves
  // reading as soft shading rather than flat planes.
  const body = surfaceGeometry(fn, POD_RIBS * 12, 96);

  // Keep the rib shading almost imperceptible. The painted texture already
  // carries the ribs, and stacking a heavy vertex term on top turned the pod
  // into a striped balloon.
  bakeVertexShade(body, (u, v) => {
    const phase = u * TAU * POD_RIBS + v * 1.9;
    const rib = Math.cos(phase) * 0.5 + 0.5; // 1 at the crest, 0 in the valley
    const fade = Math.pow(Math.sin(Math.PI * clamp(v * 1.04, 0, 1)), 0.35);
    return 0.87 + 0.13 * rib * fade + (v - 0.45) * 0.1;
  });

  // Dry stem: a short tapered spike with a tiny collar ring.
  const stem = new THREE.CylinderGeometry(0.019 * length, 0.007 * length, 0.12 * length, 12, 1, false);
  stem.translate(0, -0.5 * length - 0.058 * length, 0);
  const collar = new THREE.TorusGeometry(0.023 * length, 0.008 * length, 8, 16);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, -0.5 * length - 0.004 * length, 0);

  // The stem is the darkest part of a dried pod.
  return mergeGeometries([body, flatVertexShade(stem, 0.52), flatVertexShade(collar, 0.6)], false);
}

/** A single dried peppercorn: a sphere pushed around by creased noise. */
function buildPeppercorn({ radius = 0.28, seed = 3 } = {}) {
  const noise = makeNoise3D(seed);
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Broad lumps, then the creased network, then fine grain.
    const lumps = fbm(noise, v.x * 2.4, v.y * 2.4, v.z * 2.4, 3);
    const cells = fbm(noise, v.x * 7.5 + 21, v.y * 7.5, v.z * 7.5 + 9, 2);
    // |n - 0.5| ridges produce the hard crease lines real peppercorns have.
    const crease = 1 - Math.abs(cells) * 2;
    const grain = fbm(noise, v.x * 17, v.y * 17, v.z * 17, 2);

    const rr = 1 + lumps * 0.1 - Math.pow(Math.max(crease, 0), 2.4) * 0.11 + grain * 0.022;
    v.multiplyScalar(rr * radius);
    // Peppercorns are never perfectly spherical.
    v.y *= 0.93;
    v.x *= 1.04;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // Darken the creases; peppercorns are defined by them.
  const v2 = new THREE.Vector3();
  bakeVertexShade(geo, (u, vv, x, y, z) => {
    v2.set(x, y, z).normalize();
    const lumps = fbm(noise, v2.x * 2.4, v2.y * 2.4, v2.z * 2.4, 3);
    const cells = fbm(noise, v2.x * 7.5 + 21, v2.y * 7.5, v2.z * 7.5 + 9, 2);
    const crease = Math.pow(clamp(1 - Math.abs(cells) * 2, 0, 1), 2.4);
    return 0.82 + 0.2 * lumps - crease * 0.42;
  });
  return geo;
}

/**
 * A clove: a long, slender stalk carrying a small round head of unopened
 * petals, with four tiny sepal teeth at the crown.
 *
 * The proportion is the whole point. A clove is sold as the nail-shaped spice
 * — roughly two thirds thin stalk, one third ball — so the head is only about
 * a third of the length and barely three times the stalk's width. The earlier
 * build made the head more than half the length, which read as a bud on a hair
 * rather than a clove.
 */
function buildClove({ length = 1, seed = 11 } = {}) {
  const noise = makeNoise3D(seed);

  const HEAD_R = 0.145; // head radius, ~3x the stalk
  const HEAD_AT = 0.6; // where the stalk hands over to the head
  const STALK_R = 0.04;

  const fn = (u, v, out) => {
    const th = u * TAU;
    // v: 0 at the cut end of the stalk, 1 at the crown.
    let r;
    if (v < HEAD_AT) {
      // The stalk. Thin, and just slightly heavier as it meets the head.
      r = lerp(0.026, STALK_R, v / HEAD_AT);
    } else {
      // The head: a sphere spanning the rest of the length. sqrt closes with a
      // vertical tangent at both poles, so the ball reads round rather than
      // pinched, and its radius overtakes the stalk within a few percent of v —
      // that overlap is the shoulder where the two meet.
      const k = (v - HEAD_AT) / (1 - HEAD_AT);
      const ball = HEAD_R * Math.sqrt(Math.max(0, 1 - Math.pow(2 * k - 1, 2)));
      r = Math.max(ball, STALK_R * Math.max(0, 1 - k * 2.4));
    }

    // Fine vertical striations across the head, fainter down the stalk.
    const stria = v < HEAD_AT ? 0.5 : 1;
    r *= 1 + Math.cos(th * 9) * 0.035 * stria + noise(Math.cos(th) * 2, Math.sin(th) * 2, v * 4) * 0.028;
    // Above the crown line the four sepals pinch in.
    if (v > 0.9) {
      r *= 1 - 0.3 * Math.abs(Math.cos(th * 2)) * clamp((v - 0.9) / 0.1, 0, 1);
    }

    out[0] = Math.cos(th) * r * length;
    out[1] = (v - 0.42) * length;
    out[2] = Math.sin(th) * r * length;
  };
  const bud = surfaceGeometry(fn, 44, 72);

  // Shade the striations, and keep the stalk a shade darker than the head so
  // the two read as different parts rather than one continuous form.
  bakeVertexShade(bud, (u, v) => {
    const stria = Math.cos(u * TAU * 9) * 0.5 + 0.5;
    const headLift = v < HEAD_AT ? 0.86 : 1.04;
    return (0.84 + 0.16 * stria) * headLift;
  });

  // Four tiny sepal teeth sitting on the crown. They are mostly buried in the
  // ball with just the tips clear — a clove's crown is a notch, not a calyx.
  const sepals = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.ConeGeometry(0.019 * length, 0.055 * length, 5, 1, true);
    s.scale(1, 1, 0.55);
    const a = (i / 4) * TAU + Math.PI / 4;
    const m = new THREE.Matrix4().makeRotationX(Math.cos(a) * 0.42);
    const m2 = new THREE.Matrix4().makeRotationZ(Math.sin(a) * 0.42);
    s.applyMatrix4(m.multiply(m2));
    // Sit them on the crown, which is at v = 0.985 on the lathe.
    s.translate(0, (0.985 - 0.42) * length, 0);
    sepals.push(flatVertexShade(s, 0.66));
  }

  return mergeGeometries([bud, ...sepals], false);
}

/** A turmeric finger: a knobbly, ringed rhizome segment. */
function buildTurmericFinger({ length = 1, seed = 19 } = {}) {
  const noise = makeNoise3D(seed);
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const lumps = fbm(noise, v.x * 3.1, v.y * 2.2, v.z * 3.1, 3);
    const fine = fbm(noise, v.x * 11, v.y * 9, v.z * 11, 2);
    const rr = 1 + lumps * 0.22 + fine * 0.035;
    v.multiplyScalar(rr);
    // Fingers are blunt cones, wider at the cut end.
    const taper = 1 - clamp((v.y + 1) * 0.5, 0, 1) * 0.34;
    v.x *= 0.40 * taper;
    v.z *= 0.40 * taper;
    v.y *= 0.7;
    pos.setXYZ(i, v.x * length, v.y * length, v.z * length);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  bakeVertexShade(geo, (u, v, x, y, z) => {
    const grain = fbm(noise, x * 6, y * 6, z * 6, 3);
    return 0.68 + 0.34 * grain;
  });
  return geo;
}

/**
 * A cinnamon quill.
 *
 * A quill is a sheet of inner bark rolled into a tube, so two things give it
 * away: the visible spiral lip where the outer edge of the bark wraps around,
 * and a slightly oval section. The earlier build was a plain fat cylinder with
 * a domed cap, which read as a dowel.
 *
 * Geometry groups are kept so the rolled lip can take the bark material while
 * the cut ends take the ring texture.
 */
function buildCinnamonQuill({ length = 1, radius = 0.13, seed = 23 } = {}) {
  const rOut = radius * length;
  const noise = makeNoise3D(seed);
  const v = new THREE.Vector3();

  // The wall on its own. mergeGeometries emits one group per *input*, so the
  // wall, the two cut ends and the two rolled lips each have to be their own
  // geometry if they are to take different materials.
  const wall = new THREE.CylinderGeometry(rOut, rOut * 0.94, length, 40, 4, true);
  const pos = wall.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(noise, v.x * 9, v.y * 4, v.z * 9, 3);
    const along = new THREE.Vector3(v.x, 0, v.z).normalize();
    // Two things at once: the bark is slightly oval, and it is not straight.
    v.addScaledVector(along, n * 0.01 * length);
    v.z *= 0.88;
    v.x *= 1 + Math.sin(v.y * 3.1 + seed) * 0.02;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  wall.computeVertexNormals();
  flatVertexShade(wall, 1);

  // Cut ends. These carry the concentric-ring texture, so they are separate
  // discs rather than cylinder caps.
  const capTop = new THREE.CircleGeometry(rOut * 0.985, 40);
  capTop.rotateX(-Math.PI / 2);
  capTop.translate(0, length / 2, 0);
  flatVertexShade(capTop, 1);

  const capBottom = new THREE.CircleGeometry(rOut * 0.925, 40);
  capBottom.rotateX(Math.PI / 2);
  capBottom.translate(0, -length / 2, 0);
  flatVertexShade(capBottom, 0.94);

  // The rolled outer edge of the bark, proud of the wall at both ends.
  const lips = [];
  for (const [i, end] of [-1, 1].entries()) {
    const lip = new THREE.TorusGeometry(rOut * 0.985, rOut * 0.1, 6, 32);
    lip.rotateX(Math.PI / 2);
    lip.scale(1, 0.88, 1);
    // Nudge the two lips off each other so a double quill reads as two rolls.
    lip.rotateX(i * 0.16);
    lip.translate(0, (end * length) / 2, 0);
    lips.push(flatVertexShade(lip, 1.08));
  }

  const merged = mergeGeometries([wall, capTop, capBottom, ...lips], true);
  merged.rotateZ(Math.PI / 2); // lie the quill down along X
  return merged;
}

/**
 * A star anise: eight boat-shaped lobes radiating from a seed-filled centre,
 * each cupped like a tiny canoe.
 */
function buildStarAnise({ radius = 0.46, seed = 31 } = {}) {
  const noise = makeNoise3D(seed);
  const parts = [];

  for (let lobe = 0; lobe < 8; lobe++) {
    const angle = (lobe / 8) * TAU;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);

    const fn = (u, v, out) => {
      // u: 0 centre → 1 tip.  v: -1..1 mapped from 0..1, across the lobe.
      const across = v * 2 - 1;
      const s = u;

      // Width swells then draws to a point at the tip.
      const swell = Math.pow(Math.sin(Math.PI * clamp(s * 0.94 + 0.06, 0, 1)), 0.5);
      const width = radius * 0.38 * swell * Math.sqrt(Math.max(0, 1 - across * across));

      const d = radius * 0.22 + s * (radius * 0.8);
      const x = d;
      const z = across * width;
      // Cupped section plus a raised keel down the middle.
      const y =
        -0.055 * radius * across * across * 2.2 +
        0.05 * radius * (1 - across * across) +
        s * 0.11 * radius +
        noise(x * 3, z * 3, angle) * 0.008 * radius;

      out[0] = x * ca - z * sa;
      out[1] = y;
      out[2] = x * sa + z * ca;
    };

    const g = surfaceGeometry(fn, 26, 18);
    // Shade the cupped centre of each lobe and lift the outer edges.
    bakeVertexShade(g, (u, v) => {
      const across = v * 2 - 1;
      return 0.6 + 0.4 * (1 - across * across * 0.55) + u * 0.12;
    });
    // Taper the lobe tip upward so the star opens like a real pod.
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const along = v.x * ca + v.z * sa;
      v.y += Math.pow(clamp((along / radius - 0.2) / 0.9, 0, 1), 2) * radius * 0.2;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    parts.push(g);
  }

  // Centre boss with the seeds.
  const boss = new THREE.SphereGeometry(radius * 0.3, 20, 16);
  boss.scale(1, 0.55, 1);
  parts.push(flatVertexShade(boss, 0.68));

  return mergeGeometries(parts, false);
}

/* ======================================================================== */
/*  Materials                                                               */
/* ======================================================================== */

/** @type {Record<string, {geometry: () => THREE.BufferGeometry, material: () => THREE.Material, seed: number}>} */
const RECIPES = {
  cardamom: {
    seed: 7,
    geometry: () => buildCardamomPod({ length: 1 }),
    material: () => {
      // Barely any contrast push: the painted skin should survive intact, it
      // just needs its colour back.
      const map = toTexture(cardamomTexture(7), { contrast: 1.06, saturation: 1.22 });
      return new THREE.MeshPhysicalMaterial({
        map,
        vertexColors: true,
        bumpMap: map,
        bumpScale: 0.005,
        roughness: 0.6,
        metalness: 0.0,
        clearcoat: 0.22,
        clearcoatRoughness: 0.55,
        sheen: 0.3,
        sheenColor: new THREE.Color('#cfe0a0'),
        sheenRoughness: 0.65,
      });
    },
    scale: 1.35,
    kind: 'pod',
  },
  pepper: {
    seed: 3,
    geometry: () => buildPeppercorn({ radius: 0.3 }),
    material: () => {
      const map = toTexture(pepperTexture(3), { contrast: 1.14, saturation: 1.15 });
      return new THREE.MeshPhysicalMaterial({
        map,
        vertexColors: true,
        bumpMap: map,
        bumpScale: 0.022,
        roughness: 0.62,
        metalness: 0.05,
        clearcoat: 0.2,
        clearcoatRoughness: 0.7,
        sheen: 0.34,
        sheenColor: new THREE.Color('#7d6350'),
        sheenRoughness: 0.5,
      });
    },
    scale: 1.2,
    kind: 'berry',
  },
  clove: {
    seed: 11,
    geometry: () => buildClove({ length: 1 }),
    material: () => {
      const map = toTexture(cloveTexture(11), { contrast: 1.12, saturation: 1.3 });
      return new THREE.MeshPhysicalMaterial({
        map,
        vertexColors: true,
        bumpMap: map,
        bumpScale: 0.01,
        roughness: 0.66,
        metalness: 0.0,
        clearcoat: 0.18,
        clearcoatRoughness: 0.66,
        sheen: 0.16,
        sheenColor: new THREE.Color('#7a452a'),
        side: THREE.DoubleSide,
      });
    },
    scale: 1.3,
    kind: 'bud',
  },
  turmeric: {
    seed: 19,
    geometry: () => buildTurmericFinger({ length: 1 }),
    material: () => {
      const map = toTexture(turmericTexture(19), { contrast: 1.26 });
      return new THREE.MeshPhysicalMaterial({
        map,
        vertexColors: true,
        bumpMap: map,
        bumpScale: 0.035,
        roughness: 0.82,
        metalness: 0.0,
        sheen: 0.2,
        sheenColor: new THREE.Color('#d8912c'),
      });
    },
    scale: 1.45,
    kind: 'knob',
  },
  cinnamon: {
    seed: 23,
    geometry: () => buildCinnamonQuill({ length: 1, radius: 0.115 }),
    material: () => {
      const side = toTexture(cinnamonTexture(23), { contrast: 1.1, saturation: 1.3 });
      const cap = toTexture(cinnamonEndTexture(23), { contrast: 1.15, saturation: 1.25 });
      const bark = new THREE.MeshPhysicalMaterial({
        map: side,
        vertexColors: true,
        bumpMap: side,
        bumpScale: 0.014,
        roughness: 0.82,
        metalness: 0.0,
        clearcoat: 0.06,
        clearcoatRoughness: 0.8,
        sheen: 0.16,
        sheenColor: new THREE.Color('#8a5f38'),
      });
      const rings = new THREE.MeshPhysicalMaterial({
        map: cap,
        vertexColors: true,
        bumpMap: cap,
        bumpScale: 0.008,
        roughness: 0.86,
        metalness: 0.0,
        sheen: 0.14,
        sheenColor: new THREE.Color('#96683c'),
      });
      // mergeGeometries(.., true) emits one group per input geometry, in the
      // order they were passed: wall, top cut, bottom cut, lip, lip. The quill
      // is rotated onto its side, so the cut groups read as the ends.
      return [bark, rings, rings, bark, bark];
    },
    scale: 1.3,
    kind: 'quill',
  },
  star: {
    seed: 31,
    geometry: () => buildStarAnise({ radius: 0.5 }),
    material: () => {
      const map = toTexture(starTexture(31), { contrast: 1.34 });
      return new THREE.MeshPhysicalMaterial({
        map,
        vertexColors: true,
        bumpMap: map,
        bumpScale: 0.02,
        roughness: 0.66,
        metalness: 0.0,
        clearcoat: 0.28,
        sheen: 0.35,
        sheenColor: new THREE.Color('#b07a48'),
        side: THREE.DoubleSide,
      });
    },
    scale: 1.4,
    kind: 'star',
  },
};

/* ======================================================================== */
/*  Instance groups                                                         */
/* ======================================================================== */

const cache = new Map();

export function recipe(id) {
  if (!cache.has(id)) {
    const def = RECIPES[id] || RECIPES.cardamom;
    const material = def.material();
    // Real produce is never one colour. A few tinted clones of the same
    // material (sharing the texture) give each piece its own cast without
    // multiplying the texture memory.
    const variants = Array.isArray(material) ? material : [material];
    const materials = [material];
    const rand = rng(def.seed * 31 + 7);
    const source = firstColourMap(material);
    const baseHue = source ? dominantHue(source) : 0.08;
    for (let i = 0; i < 2; i++) {
      const clone = variants.map((m) => {
        const c = m.clone();
        // Drift around this spice's own hue, never a global one.
        c.color = new THREE.Color().setHSL(
          baseHue + rand.range(-0.02, 0.02),
          rand.range(0.08, 0.26),
          rand.range(0.44, 0.6),
        );
        if (c.roughness !== undefined) c.roughness = clamp(c.roughness + rand.range(-0.1, 0.1), 0.1, 1);
        return c;
      });
      materials.push(Array.isArray(material) ? clone : clone[0]);
    }
    cache.set(id, {
      geometry: def.geometry(),
      material,
      materials,
      kind: def.kind,
      scale: def.scale ?? 1,
      seed: def.seed,
    });
  }
  return cache.get(id);
}

/** How many solids each product gets in its floating cluster. */
const CLUSTER_SIZE = {
  pod: 17,
  berry: 28,
  bud: 16,
  knob: 12,
  quill: 10,
  star: 9,
};

export function clusterSize(id) {
  return CLUSTER_SIZE[(recipe(id).kind)] ?? 12;
}

/**
 * Build a floating cluster of one product.
 *
 * Bodies are spread over a flattened ellipsoid using a golden-angle spiral so
 * the silhouette stays even instead of clumping, then given independent drift
 * speeds for the idle animation.
 */
/**
 * The star anise is shown as a photograph rather than a solid.
 *
 * A star anise is so geometrically distinctive that a procedural build always
 * reads as a toy — eight flat wedges with no bark texture. The client's own
 * photo is the honest representation, so it is drawn into a rounded-corner
 * canvas (with a thin leaf-green keyline) to read as a print floating in the
 * stage rather than a rectangle pasted over it.
 *
 * The image loads async: until it lands the canvas is empty, which is why the
 * thumbnail path retries.
 */
function photoTexture(src, size = 1024) {
  const { c: canvas, ctx } = canvas2d(size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const roundRect = (x, y, w, h, rad) => {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  };

  const img = new Image();
  img.decoding = 'async';
  // Flag the texture until it has real pixels. thumbnail() reads this and
  // returns null while the photo is still in flight, so the caller's retry loop
  // keeps trying instead of caching a black frame forever.
  tex.vavaReady = false;
  img.onload = () => {
    const rad = size * 0.05;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    roundRect(0, 0, size, size, rad);
    ctx.clip();
    // Cover-fit so the photo fills the square without letterboxing.
    const s = Math.max(size / img.width, size / img.height);
    const w = img.width * s;
    const h = img.height * s;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    ctx.restore();

    // Thin keyline so the edge of the print stays legible against the stage.
    ctx.save();
    ctx.strokeStyle = 'rgba(166,242,198,0.55)';
    ctx.lineWidth = size * 0.007;
    roundRect(size * 0.006, size * 0.006, size * 0.988, size * 0.988, rad);
    ctx.stroke();
    ctx.restore();

    tex.needsUpdate = true;
    tex.vavaReady = true;
  };
  img.src = src;
  return tex;
}

/** The star anise cluster: one photographic print, gently adrift. */
function createStarPhotoCluster() {
  const group = new THREE.Group();
  group.name = 'cluster-star';

  const tex = photoTexture('assets/star-anise.jpg');
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });  const SIZE = 3.5;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE, 1, 1), mat);
  // showProduct() drives every item's scale from userData.baseScale; without it
  // the mesh is set to undefined and the plane silently stops rendering.
  mesh.userData.baseScale = 1;
  group.add(mesh);

  return {
    group,
    items: [
      {
        mesh,
        base: new THREE.Vector3(0, 0, 0),
        // No spin: a rotating flat plane only advertises that it is flat.
        spin: new THREE.Vector3(0, 0, 0),
        bob: 0.6,
        phase: 0,
        amp: 0.1,
        squash: 1,
      },
    ],
    kind: 'star',
    count: 1,
    // Read by thumbnail(): a photo cluster renders black until its image has
    // decoded, and a black frame must never be cached as the pill artwork.
    notReady: () => tex.vavaReady !== true,
  };
}

export function createCluster(id) {
  if (id === 'star') return createStarPhotoCluster();
  const { geometry, material, materials, kind, scale, seed } = recipe(id);
  const group = new THREE.Group();
  group.name = `cluster-${id}`;
  const count = clusterSize(id);
  const rand = rng(seed * 977 + 13);
  const golden = Math.PI * (3 - Math.sqrt(5));

  const items = [];
  const spread = kind === 'star' ? 3.2 : kind === 'quill' ? 3.9 : 3.3;

  for (let i = 0; i < count; i++) {
    // Cycle the tinted material clones so neighbouring pieces differ.
    const mesh = new THREE.Mesh(geometry, materials[i % materials.length]);
    const t = (i + 0.5) / count;

    // Golden-angle spiral, squashed so the cluster is wider than it is tall.
    const r = Math.pow(t, 0.62) * spread;
    const a = i * golden;
    const px = Math.cos(a) * r * 1.18 + rand.range(-0.2, 0.2);
    const py = Math.sin(a) * r * 0.82 + rand.range(-0.16, 0.16);
    const pz = (rand.next() - 0.5) * spread * 1.45;

    mesh.position.set(px, py, pz);
    mesh.rotation.set(rand.range(0, TAU), rand.range(0, TAU), rand.range(0, TAU));

    const s = scale * rand.range(0.72, 1.05);
    mesh.scale.set(s, s, s);
    mesh.userData.baseScale = s;

    group.add(mesh);
    items.push({
      mesh,
      base: mesh.position.clone(),
      spin: new THREE.Vector3(rand.range(-0.24, 0.24), rand.range(-0.3, 0.3), rand.range(-0.16, 0.16)),
      bob: rand.range(0.5, 1.5),
      phase: rand.range(0, TAU),
      amp: rand.range(0.1, 0.34),
      squash: kind === 'berry' ? rand.range(0.9, 1.08) : 1,
    });
  }

  return { group, items, kind, count };
}
