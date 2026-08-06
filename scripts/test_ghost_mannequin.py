"""
Self-check for the ghost-mannequin hollow-region heuristic in
batch-clean-photos.py. Tests the pure geometry+color logic
(detect_hollow_regions) only — no LaMa model download needed, so this runs
anywhere PIL/numpy are installed.

    pip install pillow numpy
    python scripts/test_ghost_mannequin.py

History: the first version of this test (and of detect_hollow_regions)
assumed rembg's own alpha mask would already have a gap at the neckline.
A real test photo (2026-08-06) proved that false — rembg outputs one solid
blob regardless of interior color differences. detect_hollow_regions was
rewritten to look at backdrop color instead of rembg's mask shape; these
tests were rewritten to match.
"""
import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw

_spec = importlib.util.spec_from_file_location(
    "batch_clean_photos", Path(__file__).parent / "batch-clean-photos.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
detect_hollow_regions = _module.detect_hollow_regions


BACKDROP = (30, 30, 200)
GARMENT_COLOR = (200, 30, 30)


def synthetic_garment_with_neckline() -> tuple[Image.Image, Image.Image]:
    """A backdrop-colored canvas with a filled rounded-rectangle "garment" on
    it, and a small backdrop-colored hole punched near the top-center — the
    neckline gap where the mannequin/backdrop shows through. rembg's alpha
    (simulated here directly, since this test doesn't run rembg) covers the
    whole garment silhouette including that hole, matching what the real
    test photo showed rembg actually does. Returns (src, alpha)."""
    size = 200
    src = Image.new("RGB", (size, size), BACKDROP)
    draw = ImageDraw.Draw(src)
    draw.rounded_rectangle([40, 30, 160, 180], radius=15, fill=GARMENT_COLOR)
    draw.ellipse([90, 38, 110, 55], fill=BACKDROP)  # neckline hole (backdrop showing through)

    alpha = Image.new("L", (size, size), 0)
    adraw = ImageDraw.Draw(alpha)
    adraw.rounded_rectangle([40, 30, 160, 180], radius=15, fill=255)  # solid — no gap, like real rembg output
    return src, alpha


def test_finds_the_backdrop_colored_hole():
    src, alpha = synthetic_garment_with_neckline()
    holes, closed = detect_hollow_regions(src, alpha, radius=15)

    bbox = holes.getbbox()
    assert bbox is not None, "expected the backdrop-colored neckline hole to be detected"
    # the hole was drawn at (90,38)-(110,55); detected bbox should overlap it
    assert bbox[0] < 110 and bbox[2] > 90, f"hole bbox {bbox} misses the drawn hole"
    assert bbox[1] < 55 and bbox[3] > 38, f"hole bbox {bbox} misses the drawn hole"

    # the garment's own fabric color must NOT be flagged as a hole
    assert holes.getpixel((100, 150)) == 0, "solid garment fabric should not be flagged as a hole"


def test_no_hole_is_a_noop():
    size = 200
    src = Image.new("RGB", (size, size), BACKDROP)
    draw = ImageDraw.Draw(src)
    draw.rounded_rectangle([40, 30, 160, 180], radius=15, fill=GARMENT_COLOR)  # no backdrop-colored gap

    alpha = Image.new("L", (size, size), 0)
    adraw = ImageDraw.Draw(alpha)
    adraw.rounded_rectangle([40, 30, 160, 180], radius=15, fill=255)

    holes, closed = detect_hollow_regions(src, alpha, radius=15)
    assert holes.getbbox() is None, "a garment with no backdrop-colored gap should have no detected holes"


if __name__ == "__main__":
    test_finds_the_backdrop_colored_hole()
    test_no_hole_is_a_noop()
    print("ok: 2/2 ghost-mannequin hollow-region tests passed")
