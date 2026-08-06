"""
Batch-clean raw product photos: remove background, composite onto a plain
studio backdrop with a soft shadow. Standalone tool, not wired into the app.

Usage:
    pip install rembg pillow
    python scripts/batch-clean-photos.py <input_dir> <output_dir> [--bg 245,245,245] [--bg-image path.jpg] [--blur 25] [--crop x1,y1,x2,y2]

--bg-image overrides --bg: composites the cutout onto a real backdrop photo
(cover-cropped to the subject's aspect ratio) instead of a flat color.

--blur RADIUS switches mode entirely: keeps the shot's own background (no
removal/swap), just gaussian-blurs it and keeps the subject sharp — portrait
mode. Ignores --bg/--bg-image when set.

--shine boosts contrast/saturation on the subject and screens a soft diagonal
highlight over it, applies in either mode.

rembg segments by saliency, not by subject: if other garments/props in the
shot are also high-contrast, they'll be kept as "foreground" too. --crop
pre-trims to the mannequin/garment region before segmentation to fix that.
"""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
from rembg import remove

EXTS = {".jpg", ".jpeg", ".png", ".webp"}


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
) -> None:
    src = Image.open(input_path).convert("RGB")
    if crop:
        src = src.crop(crop)
    buf = io.BytesIO()
    src.save(buf, format="PNG")
    cutout = remove(buf.getvalue())
    fg = Image.open(io.BytesIO(cutout)).convert("RGBA")
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
    cutout = remove(buf.getvalue())
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
            if args.blur is not None:
                blur_one(p, out, args.blur, crop, args.shine)
            else:
                clean_one(p, out, bg_color, bg_image, crop, args.shine)
            ok += 1
            print(f"done: {p.name} -> {out.name}")
        except Exception as e:
            failed.append(p.name)
            print(f"FAILED: {p.name}: {e}")

    print(f"\n{ok}/{len(photos)} cleaned, output: {args.output_dir}")
    if failed:
        print(f"failed: {failed}")


if __name__ == "__main__":
    main()
