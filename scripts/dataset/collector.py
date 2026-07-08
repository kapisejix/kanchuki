"""
Indian Ethnic Wear Dataset Collector
======================================
Downloads product images from R2 as shopkeepers upload them.
Organizes images by category and generates metadata for LoRA fine-tuning.

Usage:
    # Collect all products since the last run
    python scripts/dataset/collector.py --since 2026-06-01

    # Collect a specific retailer's products
    python scripts/dataset/collector.py --retailer-id abc123

    # Collect and generate masks
    python scripts/dataset/collector.py --generate-masks

Output:
    ./dataset/
    ├── cloth/                    # Product/garment images
    │   ├── ladies_suit_001.jpg
    │   ├── saree_001.jpg
    │   └── ...
    ├── metadata/                 # JSON metadata per image
    │   ├── ladies_suit_001.json
    │   └── ...
    ├── masks/                    # Segmentation masks (if --generate-masks)
    │   ├── ladies_suit_001.png
    │   └── ...
    └── index.json                # Full dataset index
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, date
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import boto3
from botocore.config import Config
from PIL import Image
from tqdm import tqdm


# ─── Configuration ─────────────────────────────────────────────

R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET_NAME", "kanchuki-dev")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Categories that represent Indian ethnic wear (for filtering)
INDIAN_ETHNIC_CATEGORIES = {
    "Ladies Suit", "Kurti", "Saree", "Lehenga", "Gown",
    "Dupatta", "Blouse", "Kurta Pajama", "Men's Kurta Pajama",
    "Sherwani", "Kids Ethnic Wear", "Readymade Suit",
}

# Output directory
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent.parent / "dataset"


# ─── R2 Client ─────────────────────────────────────────────────

def get_r2_client():
    """Create an S3-compatible client for Cloudflare R2."""
    if not all([R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY]):
        print("ERROR: R2 credentials not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
        sys.exit(1)

    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def list_product_photos(s3, prefix: str = "retailers/") -> list[dict]:
    """List all product photos in R2 under the retailers/ prefix."""
    photos = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=R2_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            # Skip non-product paths and thumbnails
            if not key.endswith((".jpg", ".jpeg", ".png", ".webp")):
                continue
            if "/thumb/" in key or "/tryon/" in key or "/measurements/" in key:
                continue
            photos.append({
                "key": key,
                "size_bytes": obj["Size"],
                "last_modified": obj["LastModified"],
            })
    return photos


def download_photo(s3, key: str, output_path: Path) -> bool:
    """Download a single photo from R2."""
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        s3.download_file(R2_BUCKET, key, str(output_path))
        return True
    except Exception as e:
        print(f"  ⚠ Failed to download {key}: {e}")
        return False


# ─── Metadata Extraction ───────────────────────────────────────

def extract_metadata_from_key(key: str) -> dict:
    """
    Extract retailer_id, product_id, and filename from R2 key.
    Keys follow: retailers/{retailer_id}/products/{product_id}/{filename}
    """
    parts = key.split("/")
    metadata = {
        "r2_key": key,
        "retailer_id": parts[1] if len(parts) > 1 else None,
        "product_id": parts[3] if len(parts) > 3 else None,
        "filename": parts[-1] if parts else None,
        "collected_at": datetime.utcnow().isoformat(),
    }
    return metadata


def save_metadata(metadata: dict, output_dir: Path):
    """Save metadata as JSON alongside the image."""
    base_name = Path(metadata["filename"]).stem
    meta_path = output_dir / "metadata" / f"{base_name}.json"
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2, default=str)


# ─── Main Collector ────────────────────────────────────────────

def collect_photos(
    output_dir: Path = DEFAULT_OUTPUT,
    since: Optional[datetime] = None,
    generate_masks: bool = False,
    max_photos: int = 0,
):
    """
    Main collection loop.
    1. List all product photos in R2
    2. Filter by date (if --since)
    3. Download each photo
    4. Save metadata
    5. Optionally generate masks
    """
    s3 = get_r2_client()
    cloth_dir = output_dir / "cloth"
    cloth_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Dataset] Scanning R2 bucket '{R2_BUCKET}' for product photos...")
    photos = list_product_photos(s3)
    print(f"[Dataset] Found {len(photos)} product photos")

    if since:
        photos = [p for p in photos if p["last_modified"].replace(tzinfo=None) >= since]
        print(f"[Dataset] Filtered to {len(photos)} photos since {since.date()}")

    if max_photos > 0:
        photos = photos[:max_photos]

    if not photos:
        print("[Dataset] No new photos to collect.")
        return

    print(f"[Dataset] Downloading {len(photos)} photos to {cloth_dir}/")
    downloaded = 0
    skipped = 0

    for photo in tqdm(photos, desc="Downloading"):
        key = photo["key"]
        filename = key.split("/")[-1]
        output_path = cloth_dir / filename

        # Skip if already downloaded
        if output_path.exists():
            skipped += 1
            continue

        if download_photo(s3, key, output_path):
            # Save metadata
            metadata = extract_metadata_from_key(key)
            metadata["size_bytes"] = photo["size_bytes"]
            metadata["last_modified"] = photo["last_modified"].isoformat()
            save_metadata(metadata, output_dir)
            downloaded += 1

    print(f"[Dataset] Downloaded: {downloaded}, Skipped: {skipped}")

    # Generate index
    generate_index(output_dir)

    # Generate masks if requested
    if generate_masks and downloaded > 0:
        print("[Dataset] Generating segmentation masks...")
        from generate_masks import generate_all_masks
        generate_all_masks(output_dir)


# ─── Index Generation ──────────────────────────────────────────

def generate_index(output_dir: Path):
    """Generate a dataset index file with all collected images and metadata."""
    cloth_dir = output_dir / "cloth"
    meta_dir = output_dir / "metadata"
    masks_dir = output_dir / "masks"

    if not cloth_dir.exists():
        print("[Dataset] No cloth images found, skipping index")
        return

    entries = []
    for img_path in sorted(cloth_dir.iterdir()):
        if not img_path.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            continue

        base_name = img_path.stem
        meta_path = meta_dir / f"{base_name}.json"
        mask_path = masks_dir / f"{base_name}.png"

        entry = {
            "image": str(img_path.relative_to(output_dir)),
            "metadata": str(meta_path.relative_to(output_dir)) if meta_path.exists() else None,
            "mask": str(mask_path.relative_to(output_dir)) if mask_path.exists() else None,
            "has_mask": mask_path.exists(),
            "width": None,
            "height": None,
        }

        # Get image dimensions
        try:
            with Image.open(img_path) as img:
                entry["width"], entry["height"] = img.size
        except Exception:
            pass

        entries.append(entry)

    index = {
        "dataset_name": "kanchuki-indian-ethnic-wear",
        "created_at": datetime.utcnow().isoformat(),
        "total_images": len(entries),
        "source": "Kanchuki product uploads",
        "categories": list(INDIAN_ETHNIC_CATEGORIES),
        "entries": entries,
    }

    index_path = output_dir / "index.json"
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2, default=str)

    print(f"[Dataset] Index written to {index_path}")
    print(f"[Dataset] Total images: {len(entries)}")
    print(f"[Dataset] Images with masks: {sum(1 for e in entries if e['has_mask'])}")


# ─── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Collect Indian ethnic wear images from Kanchuki product uploads"
    )
    parser.add_argument(
        "--output", "-o",
        default=str(DEFAULT_OUTPUT),
        help=f"Output directory (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--since",
        type=str,
        help="Collect photos uploaded since this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--retailer-id",
        type=str,
        help="Collect photos for a specific retailer",
    )
    parser.add_argument(
        "--generate-masks",
        action="store_true",
        help="Generate segmentation masks after download",
    )
    parser.add_argument(
        "--max-photos",
        type=int,
        default=0,
        help="Maximum number of photos to download (0 = unlimited)",
    )
    parser.add_argument(
        "--update-index",
        action="store_true",
        help="Re-generate index.json from existing files without downloading",
    )

    args = parser.parse_args()

    output_dir = Path(args.output)

    if args.update_index:
        print("[Dataset] Re-generating index from existing files...")
        generate_index(output_dir)
        return

    since = None
    if args.since:
        try:
            since = datetime.strptime(args.since, "%Y-%m-%d")
        except ValueError:
            print("ERROR: Invalid date format. Use YYYY-MM-DD")
            sys.exit(1)

    collect_photos(
        output_dir=output_dir,
        since=since,
        generate_masks=args.generate_masks,
        max_photos=args.max_photos,
    )


if __name__ == "__main__":
    main()
