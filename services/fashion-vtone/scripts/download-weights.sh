#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Fashion V-Tone v1.5 — Weight Downloader (Shell)
# ──────────────────────────────────────────────────────────────
# Pre-downloads model weights into a local directory so the
# server doesn't fetch ~2.3 GB on cold start.
#
# Usage:
#   bash scripts/download-weights.sh                    # default: ./weights
#   bash scripts/download-weights.sh /app/weights
#   VTONE_WEIGHTS_DIR=/app/weights bash scripts/download-weights.sh
#
# Requires: huggingface-hub CLI (pip install huggingface-hub)
# ──────────────────────────────────────────────────────────────

set -euo pipefail

WEIGHTS_DIR="${1:-${VTONE_WEIGHTS_DIR:-./weights}}"
WEIGHTS_DIR="$(cd "$WEIGHTS_DIR" 2>/dev/null && pwd)" || WEIGHTS_DIR="$(pwd)/$(basename "$WEIGHTS_DIR")"

echo "════════════════════════════════════════════════════"
echo "  Fashion V-Tone v1.5 — Weight Downloader"
echo "  Target: $WEIGHTS_DIR"
echo "════════════════════════════════════════════════════"
echo ""

mkdir -p "$WEIGHTS_DIR/dwpose"

# ── Download TryOnModel ──────────────────────────────────
echo "Downloading TryOnModel weights (~1.94 GB)..."
if [ ! -f "$WEIGHTS_DIR/model.safetensors" ]; then
    huggingface-cli download \
        fashn-ai/fashn-vton-1.5 \
        model.safetensors \
        --local-dir "$WEIGHTS_DIR" \
        --local-dir-use-symlinks False \
        --resume-download
    echo "  ✓ model.safetensors downloaded"
else
    echo "  ✓ model.safetensors already exists (skipping)"
fi
echo ""

# ── Download DWPose ONNX models ──────────────────────────
echo "Downloading DWPose/yolox_l.onnx (~217 MB)..."
if [ ! -f "$WEIGHTS_DIR/dwpose/yolox_l.onnx" ]; then
    huggingface-cli download \
        fashn-ai/DWPose \
        yolox_l.onnx \
        --local-dir "$WEIGHTS_DIR/dwpose" \
        --local-dir-use-symlinks False \
        --resume-download
    echo "  ✓ yolox_l.onnx downloaded"
else
    echo "  ✓ yolox_l.onnx already exists (skipping)"
fi

echo "Downloading DWPose/dw-ll_ucoco_384.onnx (~134 MB)..."
if [ ! -f "$WEIGHTS_DIR/dwpose/dw-ll_ucoco_384.onnx" ]; then
    huggingface-cli download \
        fashn-ai/DWPose \
        dw-ll_ucoco_384.onnx \
        --local-dir "$WEIGHTS_DIR/dwpose" \
        --local-dir-use-symlinks False \
        --resume-download
    echo "  ✓ dw-ll_ucoco_384.onnx downloaded"
else
    echo "  ✓ dw-ll_ucoco_384.onnx already exists (skipping)"
fi
echo ""

# ── Human parser (auto-cached by huggingface_hub) ────────
# We can't pre-trigger this from shell; it happens on first
# import of fashn_human_parser. Advise using the Python script
# or just letting the server download it on first init.
echo "Note: FashnHumanParser weights (~244 MB) auto-download"
echo "on first pipeline init via huggingface_hub cache."
echo "To pre-cache, run: python scripts/download-weights.py"
echo ""

# ── Verify ────────────────────────────────────────────────
echo "════════════════════════════════════════════════════"
echo "  Verifying downloaded weights..."
echo "════════════════════════════════════════════════════"
echo ""

ERRORS=0

check_file() {
    local file="$1"
    local label="$2"
    if [ -f "$file" ]; then
        local size=$(du -h "$file" | cut -f1)
        echo "  ✓ $label ($size)"
    else
        echo "  ✗ MISSING: $label ($file)"
        ERRORS=$((ERRORS + 1))
    fi
}

check_file "$WEIGHTS_DIR/model.safetensors" "model.safetensors"
check_file "$WEIGHTS_DIR/dwpose/yolox_l.onnx" "dwpose/yolox_l.onnx"
check_file "$WEIGHTS_DIR/dwpose/dw-ll_ucoco_384.onnx" "dwpose/dw-ll_ucoco_384.onnx"

TOTAL_SIZE=$(du -sh "$WEIGHTS_DIR" | cut -f1)

echo ""
echo "════════════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
    echo "  ✓ Download complete! ($TOTAL_SIZE)"
    echo "  Weights directory: $WEIGHTS_DIR"
else
    echo "  ✗ $ERRORS file(s) missing — check errors above"
    exit 1
fi
echo "════════════════════════════════════════════════════"
