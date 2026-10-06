function cloveTexture(seed) {
  const S = 1024;
  const { c, ctx, size } = canvas2d(S, { readback: true });
  const r = rng(seed);

  // Canvas top = the crown (four sepals), bottom = the stalk tip.
  // A dried clove is deep reddish-brown, darkest at the crown and the neck,
  // a shade warmer and lighter across the belly where the oil sits.
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#2a1409');
  grad.addColorStop(0.1, '#3d1f10');
  grad.addColorStop(0.3, '#5a2d16');
  grad.addColorStop(0.55, '#6e3a1d');
  grad.addColorStop(0.72, '#5e3118');
  grad.addColorStop(0.88, '#48230f');
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
    ctx.fillRect(x - 26, 0, 52, size * 0.13);
  }
  // Dark cap over the crown itself.
  const cap = ctx.createLinearGradient(0, 0, 0, size * 0.1);
  cap.addColorStop(0, 'rgba(14,7,3,0.72)');
  cap.addColorStop(1, 'rgba(14,7,3,0)');
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, size, size * 0.1);

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
