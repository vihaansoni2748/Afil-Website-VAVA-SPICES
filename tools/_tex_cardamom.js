function cardamomTexture(seed) {
  const S = 1024;
  const { c, ctx, size } = canvas2d(S, { readback: true });
  const r = rng(seed);

  // Straw at the beak, deep olive at the stem - and never one flat colour: a
  // dried husk mottles unevenly as it loses moisture.
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#dcd9a4');
  grad.addColorStop(0.1, '#cbcfa0');
  grad.addColorStop(0.34, '#a6b96d');
  grad.addColorStop(0.62, '#84a255');
  grad.addColorStop(0.86, '#67863f');
  grad.addColorStop(1.0, '#4f6d31');
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
        ? `rgba(${r.int(214, 236)},${r.int(216, 234)},${r.int(150, 186)},${r.range(0.05, 0.16)})`
        : `rgba(${r.int(70, 102)},${r.int(92, 126)},${r.int(42, 68)},${r.range(0.05, 0.17)})`,
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
      ? `rgba(${r.int(208, 238)},${r.int(214, 240)},${r.int(152, 194)},${r.range(0.04, 0.13)})`
      : `rgba(${r.int(74, 106)},${r.int(92, 124)},${r.int(44, 70)},${r.range(0.05, 0.16)})`;
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

  // Brown lenticel specks and drying scars.
  for (let i = 0; i < 1800; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(0.6, 3.4) * (size / 512);
    ctx.fillStyle = `rgba(${r.int(84, 138)},${r.int(72, 112)},${r.int(34, 62)},${r.range(0.06, 0.34)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * r.range(1, 2.6), r.range(0, TAU), 0, TAU);
    ctx.fill();
  }

  // The beak bleaches to straw and the stem collar browns off first.
  const tip = ctx.createLinearGradient(0, 0, 0, size * 0.14);
  tip.addColorStop(0, 'rgba(234,226,178,0.55)');
  tip.addColorStop(1, 'rgba(234,226,178,0)');
  ctx.fillStyle = tip;
  ctx.fillRect(0, 0, size, size * 0.14);

  const base = ctx.createLinearGradient(0, size * 0.84, 0, size);
  base.addColorStop(0, 'rgba(96,74,40,0)');
  base.addColorStop(1, 'rgba(88,66,34,0.55)');
  ctx.fillStyle = base;
  ctx.fillRect(0, size * 0.84, size, size * 0.16);

  return c;
}
