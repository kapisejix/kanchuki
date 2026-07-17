#!/usr/bin/env python3
"""
Pre-download Fashion V-Tone v1.5 model weights.

Downloads all model weights required for the TryOnPipeline into
a local directory so the server doesn't need to fetch them on startup.

Usage:
    python scripts/download-weights.py                    # Default: ./weights
    python scripts/download-weights.py --weights-dir /app/weights
    python scripts/download-weights.py --skip-human-parser  # Only VTON + DWPose

Weights will be structured as:
    <weights-dir>/
    ├── model.safetensors       # 1.94 GB — TryOnModel from fashn-ai/fashn-vton-1.5
    └── dwpose/
        ├── yolox_l.onnx        # 217 MB  — DWPose detector
        └── dw-ll_ucoco_384.onnx # 134 MB  — DWPose pose estimator

Additionally, FashnHumanParser weights (~244 MB) are auto-cached to the
Hugging Face hub cache (~/.cache/huggingface/) when the parser is first
instantiated. This script pre-caches them too.

Requirements:
    pip install huggingface-hub
    pip install fashn-vton  # for the human parser trigger
"""

import argparse
import os
import sys
import time

from huggingface_hub import hf_hub_download

try:
    from fashn_human_parser import FashnHumanParser
    _HAS_HUMAN_PARSER = True
except ImportError:
    _HAS_HUMAN_PARSER = False


def download_tryon_model(weights_dir: str) -> str:
    """Download TryOnModel safetensors from Hugging Face."""
    msg = "Downloading TryOnModel weights (~1.94 GB)..."
    print(msg, flush=True)
    t0 = time.time()
    path = hf_hub_download(
        repo_id="fashn-ai/fashn-vton-1.5",
        filename="model.safetensors",
        local_dir=weights_dir,
        local_dir_use_symlinks=False,
        resume=True,
    )
    elapsed = time.time() - t0
    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f"  ✓ Saved {size_mb:.0f} MB to: {path}  ({elapsed:.1f}s)", flush=True)
    return path


def download_dwpose_models(weights_dir: str) -> str:
    """Download DWPose ONNX models from Hugging Face."""
    dwpose_dir = os.path.join(weights_dir, "dwpose")
    os.makedirs(dwpose_dir, exist_ok=True)

    repo_id = "fashn-ai/DWPose"
    filenames = [
        ("yolox_l.onnx", "217 MB"),
        ("dw-ll_ucoco_384.onnx", "134 MB"),
    ]

    for filename, size_hint in filenames:
        print(f"Downloading DWPose/{filename} (~{size_hint})...", flush=True)
        t0 = time.time()
        path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=dwpose_dir,
            local_dir_use_symlinks=False,
            resume=True,
        )
        elapsed = time.time() - t0
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"  ✓ Saved {size_mb:.0f} MB to: {path}  ({elapsed:.1f}s)", flush=True)

    return dwpose_dir


def cache_human_parser() -> None:
    """Trigger FashnHumanParser weight download so it's cached ahead of time."""
    if not _HAS_HUMAN_PARSER:
        print(
            "  ⚠ fashn-human-parser not installed. Install with:",
            "pip install fashn-vton",
            sep="\n    ",
            flush=True,
        )
        return

    print("Downloading FashnHumanParser weights (~244 MB)...", flush=True)
    t0 = time.time()
    _ = FashnHumanParser(device="cpu")
    elapsed = time.time() - t0
    print(f"  ✓ Cached in HuggingFace hub cache  ({elapsed:.1f}s)", flush=True)


def verify_weights(weights_dir: str) -> bool:
    """Verify that all required weight files exist."""
    required = [
        os.path.join(weights_dir, "model.safetensors"),
        os.path.join(weights_dir, "dwpose", "yolox_l.onnx"),
        os.path.join(weights_dir, "dwpose", "dw-ll_ucoco_384.onnx"),
    ]

    all_ok = True
    for path in required:
        if os.path.isfile(path):
            size_mb = os.path.getsize(path) / (1024 * 1024)
            print(f"  ✓ {os.path.relpath(path, weights_dir)} ({size_mb:.0f} MB)", flush=True)
        else:
            print(f"  ✗ MISSING: {path}", flush=True)
            all_ok = False

    return all_ok


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download Fashion V-Tone v1.5 model weights",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--weights-dir",
        default=os.environ.get("VTONE_WEIGHTS_DIR", "./weights"),
        help="Directory to save model weights (default: ./weights, or $VTONE_WEIGHTS_DIR)",
    )
    parser.add_argument(
        "--skip-human-parser",
        action="store_true",
        help="Skip FashnHumanParser pre-caching (saves ~30s)",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only check if weights exist, don't download",
    )

    args = parser.parse_args()
    weights_dir = os.path.abspath(args.weights_dir)
    os.makedirs(weights_dir, exist_ok=True)

    print(f"\n{'='*60}", flush=True)
    print(f"  Fashion V-Tone v1.5 — Weight Downloader", flush=True)
    print(f"  Target: {weights_dir}", flush=True)
    print(f"{'='*60}\n", flush=True)

    if args.verify_only:
        print("Verifying downloaded weights...\n", flush=True)
        ok = verify_weights(weights_dir)
        print(f"\n{'✓ All weights present' if ok else '✗ Some weights missing'}", flush=True)
        sys.exit(0 if ok else 1)

    t_start = time.time()

    download_tryon_model(weights_dir)
    print()
    download_dwpose_models(weights_dir)

    if not args.skip_human_parser:
        print()
        cache_human_parser()

    print(f"\n{'='*60}", flush=True)
    print(f"  Verifying downloaded weights...", flush=True)
    print(f"{'='*60}\n", flush=True)
    ok = verify_weights(weights_dir)

    total_elapsed = time.time() - t_start
    total_size = sum(
        os.path.getsize(os.path.join(root, f))
        for root, _, files in os.walk(weights_dir)
        for f in files
    )
    total_mb = total_size / (1024 * 1024)

    print(f"\n{'='*60}", flush=True)
    print(f"  Download {'complete' if ok else 'failed'}!", flush=True)
    print(f"  Total size: {total_mb:.0f} MB", flush=True)
    print(f"  Time: {total_elapsed:.1f}s", flush=True)
    if ok:
        print(f"  Weights directory: {weights_dir}", flush=True)
    print(f"{'='*60}\n", flush=True)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
