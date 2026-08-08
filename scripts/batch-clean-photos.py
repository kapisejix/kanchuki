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
not filling a backdrop-colored gap). --remove-hardware is the fix for that
case (SAM2, see below); --crop trims hardware out of frame as a fallback.
See detect_hollow_regions()'s docstring for the full test writeup.

--remove-hardware removes hanger / mannequin bust / stand / hook hardware
that physically touches the garment — the failure mode rembg can't fix
(saliency segmentation keeps the touching object as "foreground"). Uses
SAM2 (Meta Segment Anything 2, Apache 2.0) automatic mask generation to
find object masks, classifies which ones look like hardware (border-
touching or sitting above the garment, small-to-mid area, minimal garment
overlap), and LaMa-inpaints the union before background removal. Best-
effort by design: if torch/sam2 isn't installed (or the checkpoints aren't
downloaded), it prints HARDWARE_SKIPPED and proceeds WITHOUT removal — the
photo still gets normal bg-removal/composite. Set SAM2_CHECKPOINT /
SAM2_MODEL_CFG env vars to point at a sam2.1_hiera_tiny checkpoint +
config when the defaults don't resolve. See
scripts/test_remove_hardware.py for the mask-classification unit tests.
CONFIRMED LIMITATION (validated 2026-08-08): when the hardware is FUSED
into the same automatic mask as the garment (a mannequin bust/hanger
physically touching the garment, which is the common case), no separate
hardware mask exists to remove and --remove-hardware silently does
nothing. The interactive tap-to-fix below is the fix for that case.

--prompt-points "x,y;x,y;..." is the interactive tap-to-fix override: the
retailer taps the leftover hanger/mannequin on the mobile options screen
(normalized 0..1 coords), and each tap becomes a SAM2 point prompt via
SAM2ImagePredictor — which CAN split a garment/hardware pair that the
automatic mask generator fused into one blob. The prompted mask is
LaMa-inpainted (same ₹0 stack). --prompt-excludes "x,y;..." adds negative
points marking the garment itself so the prompt can't swallow it. When
present, prompt points win over --remove-hardware for that photo (taps
reload the predictor, not the generator — one SAM2 model in memory). An
area guard (mask >40% of frame) refuses to inpaint what is probably the
garment. Points are normalized to the RAW frame; if --crop is also given,
taps outside the crop are dropped and the rest are offset into the cropped
frame.

--tight-crop crops the final composite to the garment's alpha bounding box
plus a small margin — straightens framing (garment fills the frame,
watermark/dead space cropped) with zero extra AI.

rembg segments by saliency, not by subject: if other garments/props in the
shot are also high-contrast, they'll be kept as "foreground" too. --crop
pre-trims to the mannequin/garment region before segmentation to fix that.
"""
import argparse
import io
import os
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
# Lazy: loading the ONNX model at import time costs ~30-60s+ (and downloads
# ~170MB on first ever use) — the pure helpers in this file (e.g.
# classify_hardware_masks) must stay importable for unit tests without
# dragging the model in.
_rembg_session = None


def _get_rembg():
    global _rembg_session
    if _rembg_session is None:
        _rembg_session = new_session("isnet-general-use")
    return _rembg_session


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


# ─── SAM2 hardware removal (hanger / mannequin / stand) ─────────────
# rembg segments by saliency, not identity — a hanger or mannequin bust
# physically touching the garment survives the cutout (proven on real
# photos: 14.6% grey plastic survives the composite). SAM2 segments by
# object identity: its automatic mask generator proposes every object mask
# in the image, we classify which ones look like hardware (border-touching
# or mostly above the garment, small-to-mid area, minimal overlap with the
# garment mask), and LaMa-inpaint the union before rembg ever runs.
# Everything below is best-effort: a missing torch/sam2, a model-load
# failure, or a runtime error logs a warning and returns the image
# unchanged — the photo still flows through the normal cleanup.

_sam2_generator = None
_sam2_predictor = None


def _resolve_sam2_cfg():
    """Resolve the SAM2 model config path. Priority: SAM2_MODEL_CFG env var,
    then configs/ dirs relative to the installed sam2 package (the repo
    ships them INSIDE the package: sam2/configs/sam2.1/...), then a
    configs/ dir in the CWD (standalone checkout layout)."""
    import sam2

    pkg_dir = Path(sam2.__file__).parent
    candidates = [
        os.environ.get("SAM2_MODEL_CFG", ""),
        str(pkg_dir / "configs" / "sam2.1" / "sam2.1_hiera_t.yaml"),
        str(pkg_dir.parent / "configs" / "sam2.1" / "sam2.1_hiera_t.yaml"),
        "configs/sam2.1/sam2.1_hiera_t.yaml",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return "configs/sam2.1/sam2.1_hiera_t.yaml"


def _load_sam2_model():
    """Build the shared SAM2 model once — both the automatic mask generator
    (--remove-hardware) and the point-prompt predictor (--prompt-points)
    wrap this same model instance."""
    import torch  # noqa: F401 — fail loudly here if torch is missing
    from sam2.build_sam import build_sam2

    checkpoint = os.environ.get("SAM2_CHECKPOINT", "checkpoints/sam2.1_hiera_tiny.pt")
    # build_sam2 defaults to device="cuda" unconditionally — a CPU-only
    # torch build (this repo's Railway container) would crash with
    # "Torch not compiled with CUDA enabled". Pass cpu explicitly unless
    # a CUDA build is actually available.
    device = "cuda" if torch.cuda.is_available() else "cpu"
    return build_sam2(_resolve_sam2_cfg(), checkpoint, device=device)


def _get_sam2():
    """Lazy-load the SAM2 automatic mask generator (torch is heavy — only
    loaded when --remove-hardware is used). Raises ImportError when torch /
    sam2 isn't installed; callers must catch and degrade gracefully."""
    global _sam2_generator
    if _sam2_generator is None:
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

        _sam2_generator = SAM2AutomaticMaskGenerator(_load_sam2_model(), points_per_side=16)
    return _sam2_generator


def _get_sam2_predictor():
    """Lazy SAM2ImagePredictor for point-prompted hardware removal (the
    tap-to-fix override — the retailer taps the leftover hanger/mannequin on
    the mobile options screen and the tap becomes a foreground point for
    SAM2's image predictor). Same model instance as the auto generator."""
    global _sam2_predictor
    if _sam2_predictor is None:
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        _sam2_predictor = SAM2ImagePredictor(_load_sam2_model())
    return _sam2_predictor


def parse_point_arg(raw: str | None) -> list[tuple[float, float]]:
    """Parse a normalized (0..1) point list arg: "0.5,0.3;0.6,0.25" ->
    [(0.5, 0.3), (0.6, 0.25)]. Returns [] for None/empty. Pure — unit-tested."""
    if not raw:
        return []
    points = []
    for part in raw.split(";"):
        part = part.strip()
        if not part:
            continue
        x, y = part.split(",")
        points.append((float(x.strip()), float(y.strip())))
    return points


def adjust_points_to_crop(
    points: list[tuple[float, float]],
    crop: tuple[int, int, int, int] | None,
    orig_w: int,
    orig_h: int,
) -> list[tuple[int, int]]:
    """Convert normalized (0..1, relative to the RAW frame the retailer
    tapped on the phone) points to pixel coords in the CROPPED frame the
    pipeline actually processes. Drops taps that land outside the crop.
    Pure — unit-tested."""
    if not points:
        return []
    if not crop:
        return [(int(x * orig_w), int(y * orig_h)) for (x, y) in points]
    x1, y1, x2, y2 = crop
    out = []
    for fx, fy in points:
        px, py = int(fx * orig_w), int(fy * orig_h)
        if x1 <= px < x2 and y1 <= py < y2:
            out.append((px - x1, py - y1))
    return out


def classify_hardware_masks(masks, w: int, h: int):
    """Split SAM2 automatic masks into (hardware_union, garment_bbox).

    Pure numpy logic — no torch import, unit-tested in
    scripts/test_remove_hardware.py. Heuristics:
      - The GARMENT is the largest mask (the central subject of a product
        shot; the automatic generator returns it with the biggest area).
      - HARDWARE candidates: masks that touch the image border (hook at the
        top edge, mannequin stand at the bottom) OR sit mostly above the
        garment's top edge (hanger hook/shoulders), with area between 0.4%
        and 50% of the image and minimal (<15%) overlap with the garment
        mask — a mask that is mostly the garment itself isn't hardware.

    Returns (union | None, (gy_top, gy_bottom)) where union is an HxW bool
    ndarray of hardware pixels (None when nothing qualifies).
    """
    if not masks:
        return None, None
    sorted_masks = sorted(masks, key=lambda m: float(m.get("area", 0)), reverse=True)

    # Garment = the largest mask that does NOT touch the image border.
    # SAM2's automatic mask generator often returns a full-frame background
    # mask (touching every border) that is larger than the garment itself —
    # picking the largest mask unconditionally would classify the wall as
    # the garment (verified on real photos: 66.8% full-frame mask vs 30.7%
    # garment+mannequin blob). The garment is the central subject, so it's
    # the largest border-free mask; fall back to the largest mask overall
    # only if every mask touches a border.
    def mask_touches_border(seg: np.ndarray) -> bool:
        ys, xs = np.nonzero(seg)
        if ys.size == 0:
            return False
        return bool(ys.min() <= 1 or ys.max() >= h - 2 or xs.min() <= 1 or xs.max() >= w - 2)

    garment = next(
        (m for m in sorted_masks if not mask_touches_border(np.asarray(m["segmentation"], dtype=bool))),
        sorted_masks[0],
    )
    garment_seg = np.asarray(garment["segmentation"], dtype=bool)
    gys, _ = np.nonzero(garment_seg)
    if gys.size == 0:
        return None, None
    gy_top, gy_bottom = int(gys.min()), int(gys.max())
    img_area = w * h
    union = None
    for m in sorted_masks:
        if m is garment:
            continue
        seg = np.asarray(m["segmentation"], dtype=bool)
        area = float(seg.sum())
        if area < img_area * 0.004 or area > img_area * 0.5:
            continue
        ys, xs = np.nonzero(seg)
        if ys.size == 0:
            continue
        touches_border = mask_touches_border(seg)
        mostly_above = float(ys.mean()) < gy_top - h * 0.05
        overlap_ratio = float(np.logical_and(seg, garment_seg).sum()) / max(area, 1)
        if (touches_border or mostly_above) and overlap_ratio < 0.15:
            if union is None:
                union = np.zeros((h, w), dtype=bool)
            union |= seg
    return union, (gy_top, gy_bottom)


def try_remove_hardware(src: Image.Image) -> tuple[Image.Image, int]:
    """Remove hanger/mannequin/stand hardware from `src` via SAM2 auto-masks
    + LaMa masked inpainting. Returns (image, regions_removed). Best-effort:
    any failure (missing torch/sam2, bad checkpoint path, runtime error)
    warns and returns the image unchanged — never fails the photo."""
    try:
        generator = _get_sam2()
        arr = np.asarray(src.convert("RGB"))
        h, w, _ = arr.shape
        masks = generator.generate(arr)
        union, _ = classify_hardware_masks(masks, w, h)
        if union is None or not union.any():
            print("remove-hardware: no hardware regions found")
            return src, 0
        # Dilate a few px so inpainting also covers the hardware's edge halo.
        mask_img = Image.fromarray((union.astype(np.uint8)) * 255, mode="L")
        mask_img = mask_img.filter(ImageFilter.MaxFilter(5))
        filled = _get_lama()(src.convert("RGB"), mask_img)
        filled = filled.crop((0, 0, src.width, src.height))
        print(f"remove-hardware: inpainted {int(union.sum())} hardware pixels")
        return filled, 1
    except Exception as e:  # noqa: BLE001 — best-effort by design
        print(f"HARDWARE_SKIPPED: {e}")
        return src, 0


def remove_hardware_at_points(
    src: Image.Image,
    points: list[tuple[int, int]],
    exclude_points: list[tuple[int, int]] = [],
) -> tuple[Image.Image, int]:
    """Remove hardware at retailer-tapped pixel points via SAM2 point
    prompts + LaMa inpainting — the interactive tap-to-fix override.

    Foreground points (label 1) mark the hanger/mannequin the retailer
    wants gone; optional negative points (label 0) mark the garment itself
    so the prompt can't swallow it (SAM2 point prompts CAN split a garment
    that auto-masks fused into one blob with the hardware — the documented
    merged-mask gap --remove-hardware can't fix).

    Returns (image, regions_removed). Best-effort like
    try_remove_hardware: any failure warns and returns the image unchanged.
    """
    try:
        predictor = _get_sam2_predictor()
        arr = np.asarray(src.convert("RGB"))
        h, w, _ = arr.shape
        predictor.set_image(arr)
        point_coords = np.array(points + exclude_points, dtype=np.float32)
        point_labels = np.array(
            [1] * len(points) + [0] * len(exclude_points), dtype=np.int32
        )
        masks, scores, _ = predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            multimask_output=True,
        )
        best = masks[int(np.argmax(scores))]
        area_frac = float(best.sum()) / float(h * w)
        # Area guard: a prompted mask covering most of the frame means the
        # prompt grabbed the garment (or the tap landed on it) — never
        # inpaint away the garment. <40% is comfortably under any garment
        # mask on a product shot (verified: garment+mannequin blobs run
        # 25-70% of frame; a lone hanger/mannequin bust is 2-15%).
        if area_frac > 0.4:
            print(
                f"remove-hardware: prompted mask {area_frac:.0%} of frame — too large, skipping (tap may have hit the garment)"
            )
            return src, 0
        mask_img = Image.fromarray((best.astype(np.uint8)) * 255, mode="L")
        mask_img = mask_img.filter(ImageFilter.MaxFilter(5))
        filled = _get_lama()(src.convert("RGB"), mask_img)
        filled = filled.crop((0, 0, src.width, src.height))
        print(
            f"remove-hardware: point-prompt inpainted {int(best.sum())} px ({area_frac:.1%} of frame)"
        )
        return filled, 1
    except Exception as e:  # noqa: BLE001 — best-effort by design
        print(f"HARDWARE_SKIPPED: {e}")
        return src, 0


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
    remove_hardware: bool = False,
    tight_crop: bool = False,
    hardware_points: list[tuple[float, float]] = [],
    garment_points: list[tuple[float, float]] = [],
) -> None:
    src = Image.open(input_path).convert("RGB")
    orig_w, orig_h = src.size
    if crop:
        src = src.crop(crop)
    # SAM2 hardware removal runs BEFORE segmentation: once the hanger/
    # mannequin is inpainted away, rembg's saliency detector sees only the
    # garment and cuts it out cleanly. Best-effort — skips with a warning
    # when torch/sam2 isn't installed.
    #
    # Two modes: auto (--remove-hardware, SAM2 automatic masks) and the
    # interactive tap-to-fix (--prompt-points, SAM2 point prompts from the
    # retailer's taps). Tap points win when present — the retailer explicitly
    # marked what to remove, so auto-scanning is redundant and would reload
    # a second SAM2 predictor on top of the generator (memory).
    if hardware_points:
        # Taps are normalized to the RAW frame the retailer saw on the phone
        # — convert to px in the cropped frame (drops taps outside the crop).
        px = adjust_points_to_crop(hardware_points, crop, orig_w, orig_h)
        gx = adjust_points_to_crop(garment_points, crop, orig_w, orig_h)
        if px:
            src, _ = remove_hardware_at_points(src, px, gx)
    elif remove_hardware:
        src, _ = try_remove_hardware(src)
    buf = io.BytesIO()
    src.save(buf, format="PNG")
    cutout = remove(buf.getvalue(), session=_get_rembg())
    fg = Image.open(io.BytesIO(cutout)).convert("RGBA")

    if ghost_mannequin:
        filled_rgb, new_alpha = apply_ghost_mannequin(src, fg.split()[-1])
        fg = Image.merge("RGBA", (*filled_rgb.convert("RGB").split(), new_alpha))

    if shine:
        fg = apply_shine(fg)

    # Tight-crop: frame the garment (alpha bbox + small margin) so the final
    # catalog shot is garment-forward and dead space/watermark is cropped
    # out. Runs after shine so the highlight is applied on the full frame.
    if tight_crop:
        bbox = fg.split()[-1].getbbox()
        if bbox:
            x1, y1, x2, y2 = bbox
            m = max(8, int(min(fg.size) * 0.015))
            x1, y1 = max(0, x1 - m), max(0, y1 - m)
            x2, y2 = min(fg.width, x2 + m), min(fg.height, y2 + m)
            fg = fg.crop((x1, y1, x2, y2))

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
    cutout = remove(buf.getvalue(), session=_get_rembg())
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
    ap.add_argument("--remove-hardware", action="store_true", help="remove hanger/mannequin/stand hardware via SAM2 + LaMa inpainting (best-effort: skips gracefully if torch/sam2 isn't installed)")
    ap.add_argument("--prompt-points", default=None, help="interactive tap-to-fix: normalized (0..1) foreground points marking hardware to remove, 'x,y;x,y;...' (SAM2 point prompts; wins over --remove-hardware for that photo)")
    ap.add_argument("--prompt-excludes", default=None, help="normalized (0..1) negative points marking the garment so a --prompt-points mask can't swallow it; 'x,y;x,y;...'")
    ap.add_argument("--tight-crop", action="store_true", help="crop the final composite to the garment bounding box + small margin")
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

    # Normalized tap points apply per-photo when given (same coords for every
    # photo in a batch is the single-photo case; the API route runs one
    # photo per invocation when taps differ).
    hw_points = parse_point_arg(args.prompt_points)
    garment_points = parse_point_arg(args.prompt_excludes)

    ok, failed = 0, []
    for p in photos:
        out = args.output_dir / f"{p.stem}.jpg"
        try:
            if args.blur is not None and not args.ghost_mannequin and not args.remove_hardware and not hw_points:
                blur_one(p, out, args.blur, crop, args.shine)
            else:
                clean_one(
                    p, out, bg_color, bg_image, crop, args.shine, args.ghost_mannequin,
                    args.remove_hardware, args.tight_crop, hw_points, garment_points,
                )
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
