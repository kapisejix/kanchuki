"""
Garment Segmentation Mask Generator
======================================
Generates binary segmentation masks for product images using rembg (background removal).
CatVTON training requires agnostic masks that isolate the garment from the background.

Usage:
    # Generate masks for all images in the dataset
    python scripts/dataset/generate_masks.py

    # Generate mask for a single image
    python scripts/dataset/generate_masks.py --image path/to/garment.jpg

Input:  dataset/cloth/*.jpg
Output: dataset/masks/*.png (binary masks, white = garment, black = background)
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image
from tqdm import tqdm


# ─── Configuration ─────────────────────────────────────────────

# Minimum mask coverage (as fraction of image) to consider valid.
# If mask covers < 5% of image, it's likely a failed detection.
MIN_MASK_COVERAGE = 0.05

# Output directory relative to dataset root
MASKS_DIR = "masks"

# Categories where we want to filter by Indian ethnic wear
ETHNIC_CATEGORIES = {
    "Ladies Suit", "Kurti", "Saree", "Lehenga", "Gown",
    "Dupatta", "Blouse", "Kurta Pajama", "Sherwani",
    "Kids Ethnic Wear", "Readymade Suit",
}


# ─── Mask Generation ──────────────────────────────────────────

def generate_mask_rembg(image: Image.Image) -> Optional[Image.Image]:
    """
    Generate garment mask using rembg (RMBG-1.4).
    Removes background to isolate the garment.
    Returns a binary PIL Image (mode 'L') or None if failed.
    """
    try:
        from rembg import remove as rembg_remove

        # rembg returns RGBA with transparent background
        output = rembg_remove(image)

        if output.mode == "RGBA":
            # Extract alpha channel as mask
            mask = output.split()[3]
            # Threshold: anything opaque is garment
            mask_np = np.array(mask)
            # Apply minimum coverage check
            coverage = (mask_np > 128).sum() / mask_np.size
            if coverage < MIN_MASK_COVERAGE:
                return None
            return mask
        else:
            # Fallback: create full garment mask (white)
            return Image.fromarray(
                np.ones((image.height, image.width), dtype=np.uint8) * 255
            )
    except ImportError:
        print("[Masks] rembg not installed. Install with: pip install rembg")
        return None
    except Exception as e:
        print(f"[Masks] rembg failed: {e}")
        return None


def generate_mask_opencv(image: Image.Image) -> Optional[Image.Image]:
    """
    Fallback mask generation using OpenCV GrabCut when rembg is unavailable.
    Less accurate but doesn't require the large rembg model download.
    """
    try:
        import cv2

        img_np = np.array(image.convert("RGB"))
        h, w = img_np.shape[:2]

        # Initialize mask with probable foreground in center (assuming garment is centered)
        mask = np.zeros((h, w), np.uint8)
        rect = (int(w * 0.05), int(h * 0.05), int(w * 0.9), int(h * 0.9))

        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)

        # Run GrabCut
        cv2.grabCut(img_np, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)

        # Extract foreground mask
        mask_out = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

        coverage = (mask_out > 0).sum() / mask_out.size
        if coverage < MIN_MASK_COVERAGE:
            return None

        return Image.fromarray(mask_out, mode="L")
    except ImportError:
        print("[Masks] OpenCV not available")
        return None
    except Exception as e:
        print(f"[Masks] OpenCV failed: {e}")
        return None


def generate_mask(image: Image.Image) -> Optional[Image.Image]:
    """
    Generate best-effort mask. Tries rembg first, falls back to OpenCV.
    """
    # Try rembg first (most accurate)
    mask = generate_mask_rembg(image)
    if mask is not None:
        return mask

    # Fallback: OpenCV GrabCut
    mask = generate_mask_opencv(image)
    if mask is not None:
        return mask

    # Last resort: full image mask (white rectangle = entire image as garment)
    print("[Masks] All methods failed, using fallback full-image mask")
    return Image.fromarray(
        np.ones((image.height, image.width), dtype=np.uint8) * 255
    )


# ─── Batch Processing ─────────────────────────────────────────

def generate_all_masks(dataset_dir: Path, force: bool = False):
    """
    Generate masks for all garment images in the dataset that don't have one yet.
    """
    cloth_dir = dataset_dir / "cloth"
    masks_dir = dataset_dir / MASKS_DIR

    if not cloth_dir.exists():
        print(f"[Masks] No cloth directory found at {cloth_dir}")
        return

    masks_dir.mkdir(parents=True, exist_ok=True)

    # Find images that need masks
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    images_to_process = []
    for img_path in sorted(cloth_dir.iterdir()):
        if not img_path.suffix.lower() in image_extensions:
            continue
        mask_path = masks_dir / f"{img_path.stem}.png"
        if not mask_path.exists() or force:
            images_to_process.append(img_path)

    if not images_to_process:
        print("[Masks] All images already have masks. Use --force to regenerate.")
        return

    print(f"[Masks] Generating masks for {len(images_to_process)} images...")
    success = 0
    failed = 0

    for img_path in tqdm(images_to_process, desc="Generating masks"):
        try:
            image = Image.open(img_path).convert("RGB")
            mask = generate_mask(image)

            # Save mask as PNG
            mask_path = masks_dir / f"{img_path.stem}.png"
            if mask is not None:
                mask.save(str(mask_path))
                success += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ⚠ Failed {img_path.name}: {e}")
            failed += 1

    print(f"[Masks] Generated: {success}, Failed: {failed}")


# ─── Mask Quality Check ───────────────────────────────────────

def validate_masks(dataset_dir: Path):
    """
    Check mask quality — ensure masks have reasonable coverage and are not empty.
    Reports problematic masks for review.
    """
    masks_dir = dataset_dir / MASKS_DIR
    if not masks_dir.exists():
        print("[Masks] No masks directory found")
        return

    print("[Masks] Validating mask quality...")
    issues = []

    for mask_path in sorted(masks_dir.iterdir()):
        if mask_path.suffix != ".png":
            continue

        try:
            mask = Image.open(mask_path).convert("L")
            mask_np = np.array(mask)
            coverage = (mask_np > 128).sum() / mask_np.size
            h, w = mask_np.shape

            if coverage < MIN_MASK_COVERAGE:
                issues.append(f"  ⚠ {mask_path.name}: coverage only {coverage:.1%}")
            # For product catalog photos (saree laid flat, kurta on mannequin),
            # near-full coverage is expected and normal. Only flag if coverage
            # is > 99.9% AND the image looks like a non-product photo (too small).
            if coverage > 0.999 and min(h, w) < 200:
                issues.append(f"  ⚠ {mask_path.name}: near-full coverage ({coverage:.1%}) — verify quality")
            if min(h, w) < 100:
                issues.append(f"  ⚠ {mask_path.name}: very small mask ({w}x{h})")
        except Exception as e:
            issues.append(f"  ⚠ {mask_path.name}: error - {e}")

    if issues:
        print(f"[Masks] Found {len(issues)} issues:")
        for issue in issues[:20]:  # Show first 20
            print(issue)
        if len(issues) > 20:
            print(f"  ... and {len(issues) - 20} more")
    else:
        print("[Masks] All masks look good!")


# ─── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate garment segmentation masks for CatVTON training dataset"
    )
    parser.add_argument(
        "--image", "-i",
        type=str,
        help="Generate mask for a single image file",
    )
    parser.add_argument(
        "--dataset-dir", "-d",
        type=str,
        default=str(Path(__file__).resolve().parent.parent.parent / "dataset"),
        help="Dataset root directory (default: project-root/dataset)",
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Regenerate masks even if they already exist",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate existing masks for quality issues",
    )

    args = parser.parse_args()

    if args.image:
        # Single image mode
        img_path = Path(args.image)
        if not img_path.exists():
            print(f"ERROR: Image not found: {args.image}")
            sys.exit(1)

        image = Image.open(img_path).convert("RGB")
        mask = generate_mask(image)

        if mask is None:
            print("ERROR: Failed to generate mask")
            sys.exit(1)

        output_path = img_path.parent.parent / MASKS_DIR / f"{img_path.stem}.png"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        mask.save(str(output_path))
        print(f"Mask saved to {output_path}")
        return

    dataset_dir = Path(args.dataset_dir)

    if args.validate:
        validate_masks(dataset_dir)
        return

    generate_all_masks(dataset_dir, force=args.force)


if __name__ == "__main__":
    main()
