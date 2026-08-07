"""
Batch-clean raw product photos: remove background, composite onto a plain
studio backdrop with a soft shadow. Standalone tool, not wired into the app.

Usage:
    pip install rembg pillow simple-lama-inpainting
    python scripts/batch-clean-photos.py <input_dir> <output_dir> [--bg 245,245,245] [--bg-image path.jpg] [--blur 25] [--crop x1,y1,x2,y2] [--ghost-mannequin]

--bg-image overrides --bg: composites the cutout onto a real backdrop photo
(cover-cropped to the subject's aspect ratio) instead of a flat color.

--blur RADIUS switches mode entirely: keeps the shot's own background (no
removal/swap), just gaussian-blurs it and keeps the subject sharp — portrait
mode. Ignores --bg/--bg-image when set. Ignored (composite mode wins) if
--ghost-mannequin is also set.

--shine boosts contrast/saturation on the subject and screens a soft diagonal
highlight over it, applies in either mode.

--ghost-mannequin fills gaps in the garment silhouette that show the plain
studio *backdrop* through them (e.g. a low neckline you can see straight
through to the wall/floor behind), using local LaMa inpainting (no
third-party API, no key — see docs/photo-feature/ghost-mannequin-research.md
for why this replaced the Snappyit integration, which was wired to a vendor
that turns out to have no public API at all). Forces composite mode.
CONFIRMED LIMITATION (tested against a real product photo, not assumed): it
does NOT remove a visible mannequin neck/stand or hanger of a different
color than the backdrop — that's a different problem (erasing an object,
not filling a backdrop-colored gap) and isn't handled here. Use --crop to
trim such hardware out of frame in the meantime. See
detect_hollow_regions()'s docstring for the full test writeup.

rembg segments by saliency, not by subject: if other garments/props in the
shot are also high-contrast, they'll be kept as "foreground" too. --crop
pre-trims to the mannequin/garment region before segmentation to fix that.
"""
import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
from rembg import new_session, remove

EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# isnet-general-use segments cluttered scenes (second garment/prop in frame,
# textured curtain backdrop) far more cleanly than u2net (the old default) —
# verified against a real photo where u2net kept the entire backdrop +
# neighboring garment as "foreground". Same rembg package, just a better
# bundled model; first run downloads+caches it like u2net did.
_rembg_session = new_session("isnet-general-use")

_lama = None


def _get_lama():
    """Lazy-load the LaMa inpainting model — avoids the checkpoint
    download/load cost for every run that doesn't use --ghost-mannequin."""
    global _lama
    if _lama is None:
        from simple_lama_inpainting import SimpleLama

        _lama = SimpleLama()
    return _lama


def sample_backdrop_color(img: Image.Image, patch: int = 12) -> tuple[int, int, int]:
    """Average color of the raw photo's four corners — the studio backdrop,
    on the assumption the subject doesn't reach the corners (true for a
    garment shot with margin, which product photos generally have)."""
    w, h = img.size
    px = np.asarray(img.convert("RGB"))
    corners = np.concatenate(
        [
            px[:patch, :patch].reshape(-1, 3),
            px[:patch, w - patch :].reshape(-1, 3),
            px[h - patch :, :patch].reshape(-1, 3),
            px[h - patch :, w - patch :].reshape(-1, 3),
        ]
    )
    return tuple(int(v) for v in corners.mean(axis=0))


def detect_hollow_regions(
    src: Image.Image,
    alpha: Image.Image,
    radius: int | None = None,
    color_threshold: int = 30,
) -> tuple[Image.Image, Image.Image]:
    """Find the gaps inside a garment's silhouette (neckline, sleeve
    openings, waist) where the *studio backdrop* shows through — e.g. a low
    neckline against a plain backdrop where you can see straight through to
    the wall/floor behind the garment.

    Verified against real photos (2026-08-06): closing rembg's own alpha
    mask to find gaps IT had already excluded — the first version of this
    function — doesn't work; rembg (a saliency segmenter, not a chroma-key
    tool) outputs one solid blob for the whole garment silhouette regardless
    of interior color, with no gap to find. This version compares pixel
    color to the sampled backdrop instead of relying on rembg's mask shape.

    HONEST LIMITATION, confirmed on a real product photo, not theoretical:
    this only catches gaps that show the *backdrop* — it does NOT catch a
    visible mannequin, dress-form neck/stand, or hanger of a different color
    than the backdrop (tested against a real Met Museum dress-shirt photo
    with a metal collar stand: rembg kept the stand as foreground and its
    color didn't match the backdrop, so it went undetected and unfilled).
    That is a materially different, unsolved problem — removing an
    extraneous *object* stuck to the silhouette, not filling a hollow gap —
    and this function does not attempt it. Use --crop to manually trim such
    hardware out of frame before running this script in the meantime.
    threshold=30 was picked by testing 6-40 against that same real photo:
    below ~15 it still leaves a few scattered single-pixel false positives
    from shadow noise (harmless — LaMa smooths a handful of stray pixels
    with no visible effect) but doesn't widen into real fabric; the exact
    value is not precision-tuned beyond "confirmed not to falsely blanket
    real fabric on one real photo," not "verified correct in general."

    Returns (holes_mask, closed_mask) — both single-band 'L' images, 255 =
    on. `holes_mask` is what to feed an inpainter; `closed_mask` is the
    widened garment alpha to use once those holes are filled.
    """
    w, h = alpha.size
    if radius is None:
        radius = max(15, (min(w, h) // 20) | 1)  # odd, scales with image size
    elif radius % 2 == 0:
        radius += 1

    orig_bin = alpha.point(lambda a: 255 if a > 128 else 0)
    closed_bin = orig_bin.filter(ImageFilter.MaxFilter(radius)).filter(ImageFilter.MinFilter(radius))

    backdrop = np.array(sample_backdrop_color(src), dtype=np.int16)
    rgb = np.asarray(src.convert("RGB"), dtype=np.int16)
    close_to_backdrop = np.abs(rgb - backdrop).sum(axis=2) < color_threshold
    inside_silhouette = np.asarray(closed_bin) > 0

    holes_arr = (close_to_backdrop & inside_silhouette).astype(np.uint8) * 255
    holes = Image.fromarray(holes_arr, mode="L")
    return holes, closed_bin


def apply_ghost_mannequin(src: Image.Image, alpha: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Fill the hollow interior of a garment (see detect_hollow_regions) with
    plausible fabric using local LaMa inpainting, then return the widened
    alpha so the caller's composite step treats the filled interior as part
    of the garment. Returns (filled_rgb, new_alpha)."""
    holes, closed_bin = detect_hollow_regions(src, alpha)
    if holes.getbbox() is None:
        # no backdrop-colored gap found inside the silhouette — nothing to fill
        return src, closed_bin
    filled = _get_lama()(src.convert("RGB"), holes)
    # LaMa internally pads to a multiple of 8 and returns that padded size —
    # crop back to the original dimensions so it lines up with closed_bin.
    filled = filled.crop((0, 0, src.width, src.height))
    return filled, closed_bin


def cover_resize(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize+crop img to exactly fill size, like CSS background-size: cover."""
    tw, th = size
    sw, sh = img.size
    scale = max(tw / sw, th / sh)
    img = img.resize((int(sw * scale) + 1, int(sh * scale) + 1))
    left = (img.width - tw) // 2
    top = (img.height - th) // 2
    return img.crop((left, top, left + tw, top + th))


def apply_shine(fg: Image.Image) -> Image.Image:
    """Punch up contrast/saturation and screen a soft diagonal highlight over the subject only."""
    alpha = fg.split()[-1]
    rgb = fg.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.12)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.03)

    w, h = rgb.size
    highlight = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(highlight)
    draw.ellipse([w * 0.15, -h * 0.05, w * 0.55, h * 0.25], fill=70)
    highlight = highlight.filter(ImageFilter.GaussianBlur(int(min(w, h) * 0.06)))
    rgb = ImageChops.screen(rgb, Image.merge("RGB", (highlight, highlight, highlight)))

    return Image.merge("RGBA", (*rgb.split(), alpha))


def clean_one(
    input_path: Path,
    output_path: Path,
    bg_color: tuple[int, int, int],
    bg_image: Image.Image | None,
    crop: tuple[int, int, int, int] | None,
    shine: bool,
    ghost_mannequin: bool = False,
) -> None:
    src = Image.open(input_path).convert("RGB")
    if crop:
        src = src.crop(crop)
    buf = io.BytesIO()
    src.save(buf, format="PNG")
    cutout = remove(buf.getvalue(), session=_rembg_session)
    fg = Image.open(io.BytesIO(cutout)).convert("RGBA")

    if ghost_mannequin:
        filled_rgb, new_alpha = apply_ghost_mannequin(src, fg.split()[-1])
        fg = Image.merge("RGBA", (*filled_rgb.convert("RGB").split(), new_alpha))

    if shine:
        fg = apply_shine(fg)

    if bg_image:
        backdrop = cover_resize(bg_image, fg.size).convert("RGBA")
    else:
        backdrop = Image.new("RGBA", fg.size, bg_color + (255,))

    shadow = Image.new("RGBA", fg.size, (0, 0, 0, 0))
    shadow.putalpha(fg.split()[-1].point(lambda a: int(a * 0.35)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    backdrop.paste(shadow, (0, 15), shadow)

    backdrop.paste(fg, (0, 0), fg)
    backdrop.convert("RGB").save(output_path, quality=95)


def blur_one(
    input_path: Path,
    output_path: Path,
    blur_radius: int,
    crop: tuple[int, int, int, int] | None,
    shine: bool,
) -> None:
    src = Image.open(input_path).convert("RGB")
    if crop:
        src = src.crop(crop)
    buf = io.BytesIO()
    src.save(buf, format="PNG")
    cutout = remove(buf.getvalue(), session=_rembg_session)
    fg = Image.open(io.BytesIO(cutout)).convert("RGBA")
    if shine:
        fg = apply_shine(fg)

    result = src.filter(ImageFilter.GaussianBlur(blur_radius)).convert("RGBA")
    result.paste(fg, (0, 0), fg)
    result.convert("RGB").save(output_path, quality=95)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_dir", type=Path)
    ap.add_argument("output_dir", type=Path)
    ap.add_argument("--bg", default="245,245,245", help="R,G,B backdrop color")
    ap.add_argument("--bg-image", type=Path, default=None, help="backdrop photo to composite onto instead of --bg")
    ap.add_argument("--blur", type=int, default=None, help="portrait mode: blur the shot's own background by this radius instead of removing it")
    ap.add_argument("--crop", default=None, help="x1,y1,x2,y2 region to isolate the subject before bg removal")
    ap.add_argument("--shine", action="store_true", help="boost contrast/saturation and add a soft highlight on the subject")
    ap.add_argument("--ghost-mannequin", action="store_true", help="fill hollow neckline/sleeve/waist gaps with local LaMa inpainting (forces composite mode)")
    args = ap.parse_args()

    bg_color = tuple(int(x) for x in args.bg.split(","))
    if len(bg_color) != 3:
        sys.exit("--bg must be R,G,B")

    bg_image = Image.open(args.bg_image).convert("RGB") if args.bg_image else None

    crop = None
    if args.crop:
        crop = tuple(int(x) for x in args.crop.split(","))
        if len(crop) != 4:
            sys.exit("--crop must be x1,y1,x2,y2")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    photos = [p for p in args.input_dir.iterdir() if p.suffix.lower() in EXTS]
    if not photos:
        sys.exit(f"no photos found in {args.input_dir}")

    ok, failed = 0, []
    for p in photos:
        out = args.output_dir / f"{p.stem}.jpg"
        try:
            if args.blur is not None and not args.ghost_mannequin:
                blur_one(p, out, args.blur, crop, args.shine)
            else:
                clean_one(p, out, bg_color, bg_image, crop, args.shine, args.ghost_mannequin)
            ok += 1
            print(f"done: {p.name} -> {out.name}")
        except Exception as e:
            failed.append(p.name)
            print(f"FAILED: {p.name}: {e}")

    print(f"\n{ok}/{len(photos)} cleaned, output: {args.output_dir}")
    if failed:
        print(f"failed: {failed}")
        sys.exit(1)


if __name__ == "__main__":
    main()
