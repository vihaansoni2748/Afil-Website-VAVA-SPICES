"""Turn the supplied flat JPEG logo into transparent PNGs usable on the dark UI.

Produces:
  assets/logo-mark.png      - original green mark, transparent background
  assets/logo-mark-gold.png  - gold gradient tint of the same mark, for dark backgrounds
  assets/logo-wordmark.png   - the "Vava Spices" wordmark alone, transparent
  assets/favicon.png         - 96px square crop of the gold mark for the favicon
"""

import os

import numpy as np
from PIL import Image

SRC = "website logo.jpeg"
OUT = "assets"

GOLD_TOP = np.array([0xfa, 0xef, 0xcd])  # pale champagne highlight
GOLD_BOT = np.array([0xd0, 0xaa, 0x43])  # antique gold


def load() -> Image.Image:
    return Image.open(SRC).convert("RGB")


def ink_alpha(img: Image.Image) -> np.ndarray:
    """Alpha from distance-to-white so the white paper background disappears."""
    a = np.asarray(img).astype(np.float32) / 255.0
    # Luma of a pixel that is pure white -> 0 alpha, saturated colour -> 1.
    luma = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    alpha = np.clip((0.97 - luma) / 0.62, 0.0, 1.0)
    # Boost contrast on the ramp to keep edges crisp but not jagged.
    alpha = alpha**0.72
    return alpha


def trim(img: Image.Image, alpha: np.ndarray, pad: int = 6) -> tuple[Image.Image, Image.Image]:
    ys, xs = np.nonzero(alpha > 0.02)
    if len(ys) == 0:
        return img, alpha
    y0, y1 = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + pad + 1)
    return img.crop((x0, y0, x1, y1)), alpha[y0:y1, x0:x1]


def rgba(img: Image.Image, alpha: np.ndarray, rgb: np.ndarray) -> Image.Image:
    h, w = alpha.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    img = load()
    alpha = ink_alpha(img)
    img, alpha = trim(img, alpha)
    h, w = alpha.shape
    print(f"trimmed mark: {w}x{h}")

    # --- green mark (original colour, alpha only) ---------------------------
    rgb = np.asarray(img).astype(np.float32)
    # Desaturate the JPEG's muddy edges back toward the pure brand green.
    lum = rgb.mean(axis=2, keepdims=True)
    rgb = rgb * 0.55 + lum * 0.45
    rgba(img, alpha, rgb).save(os.path.join(OUT, "logo-mark.png"))

    # --- gold mark (vertical champagne gradient) ----------------------------
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    gold = GOLD_TOP * (1 - t) + GOLD_BOT * t
    rgba(img, alpha, np.broadcast_to(gold, (h, w, 3))).save(
        os.path.join(OUT, "logo-mark-gold.png")
    )

    # --- wordmark (below the circular mark) ---------------------------------
    row_has_ink = (alpha > 0.05).any(axis=1)
    rows = np.nonzero(row_has_ink)[0]
    gap = rows[0]
    # The circle and the wordmark are separated by a wide blank band.
    blank = np.nonzero(~row_has_ink[rows[0] : rows[-1] + 1])[0]
    if len(blank):
        split = rows[0] + blank[len(blank) // 2]
        # Confirm the gap is a real separator, not a speckle.
        if (rows[-1] - split) > (h * 0.15):
            gap = split

    word_alpha = alpha[gap:, :]
    word_rgb = np.broadcast_to(gold[gap:, :, :], (h - gap, w, 3))
    word = rgba(img.crop((0, gap, w, h)), word_alpha, word_rgb)
    word.save(os.path.join(OUT, "logo-wordmark.png"))
    print(f"wordmark: {word.width}x{word.height}")

    # --- favicon: square crop of the gold circle mark -----------------------
    side = int(min(w, rows[0] - gap) * 0.0) or w
    circle_alpha = alpha[: gap, :]
    cw = circle_alpha.shape[1]
    ch = circle_alpha.shape[0]
    size = int(min(cw, ch) * 0.92)
    left = (cw - size) // 2
    top = (ch - size) // 2
    square = rgba(
        img.crop((left, top, left + size, top + size)),
        circle_alpha[top : top + size, left : left + size],
        np.broadcast_to(
            GOLD_TOP * 0.85 + GOLD_BOT * 0.15,
            (size, size, 3),
        ),
    ).resize((96, 96), Image.LANCZOS)
    square.save(os.path.join(OUT, "favicon.png"))

    for f in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, f)
        print(f"  {f:24s} {os.path.getsize(p):>8,d} bytes  {Image.open(p).size}")


if __name__ == "__main__":
    main()
