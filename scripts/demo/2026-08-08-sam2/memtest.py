"""Measure peak RSS of the full photo-cleanup Python pipeline (rembg ONNX +
torch/SAM2 + LaMa) vs the baseline (rembg + LaMa only), on a real demo
photo, so the Railway 2GB cgroup budget can be decided with numbers.

Run: python scripts/demo/2026-08-08-sam2/memtest.py
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import psutil

REPO = Path(__file__).resolve().parents[3]
INPUT_DIR = REPO / "scripts/demo/2026-08-07-status/input"
SCRIPT = REPO / "scripts/batch-clean-photos.py"

ENV = os.environ.copy()
ENV["SAM2_CHECKPOINT"] = str(REPO / "tools/sam2/checkpoints/sam2.1_hiera_tiny.pt")
ENV["SAM2_MODEL_CFG"] = str(REPO / "tools/sam2/configs/sam2.1/sam2.1_hiera_t.yaml")


def measure(label: str, flags: list[str]) -> float:
    """Run the pipeline on the mannequin photo (the heaviest SAM2 case) and
    report peak child RSS in MB."""
    work = Path(tempfile.mkdtemp(prefix="memtest-"))
    try:
        inp = work / "input"
        out = work / "out"
        inp.mkdir()
        out.mkdir()
        # The mannequin photo exercises the full SAM2 auto-mask generation.
        photo = next(p for p in INPUT_DIR.iterdir() if "mannequin" in p.name)
        shutil.copy(photo, inp / "photo.jpg")

        # stdout must go to DEVNULL, not a pipe: the script prints a lot and
        # the parent only polls RSS — a full pipe buffer would block the
        # child and stall the measurement.
        proc = subprocess.Popen(
            [sys.executable, str(SCRIPT), str(inp), str(out), *flags],
            env=ENV,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        child = psutil.Process(proc.pid)
        peak = 0.0
        t0 = time.time()
        while proc.poll() is None:
            try:
                peak = max(peak, child.memory_info().rss)
            except psutil.NoSuchProcess:
                break
            time.sleep(0.1)
        rc = proc.wait(timeout=30)
        elapsed = time.time() - t0
        peak_mb = peak / 1024 / 1024
        ok = rc == 0
        print(f"{label}: peak RSS {peak_mb:,.0f} MB over {elapsed:.0f}s {'OK' if ok else f'FAILED rc={rc}'}")
        return peak_mb
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    # Baseline: rembg + LaMa (tight-crop) — what the Railway container runs
    # today without torch/SAM2.
    base = measure("baseline rembg+LaMa (--tight-crop)", ["--tight-crop", "--bg", "245,245,245"])
    # Full: + SAM2 auto hardware removal on top (torch, model, generator).
    full = measure("rembg+SAM2+LaMa (--remove-hardware --tight-crop)", ["--remove-hardware", "--tight-crop", "--bg", "245,245,245"])
    # Tap-to-fix path: SAM2ImagePredictor point prompt (same model, predictor
    # instead of the automatic generator).
    tap = measure(
        "rembg+SAM2-predictor+LaMa (--prompt-points)",
        ["--prompt-points", "0.5,0.35", "--prompt-excludes", "0.5,0.6", "--tight-crop", "--bg", "245,245,245"],
    )
    print(f"\nSAM2 delta (auto vs baseline): {full - base:+,.0f} MB")
    print(f"SAM2 delta (predictor vs baseline): {tap - base:+,.0f} MB")
