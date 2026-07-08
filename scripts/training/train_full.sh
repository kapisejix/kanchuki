#!/bin/bash
# ══════════════════════════════════════════════════════════════
# CatVTON-FLUX Full Fine-Tuning on Indian Ethnic Wear
# ══════════════════════════════════════════════════════════════
#
# REQUIRES: 2x H100 80GB GPUs (or A100 80GB minimum)
#
# This script runs full parameter fine-tuning (not LoRA).
# For most users, use LoRA training instead (train_lora.py).
#
# Usage:
#   bash scripts/training/train_full.sh
#
# Environment variables:
#   DATASET_PATH  - Path to prepared dataset (default: ../../dataset/catvton-training-data)
#   OUTPUT_DIR    - Output directory (default: ./outputs/full-finetune)
#   HUB_TOKEN     - HuggingFace token for model upload (optional)
# ══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────

DATASET_PATH="${DATASET_PATH:-../../dataset/catvton-training-data}"
OUTPUT_DIR="${OUTPUT_DIR:-./outputs/full-finetune}"
MODEL_NAME="black-forest-labs/FLUX.1-dev"
INPAINT_MODEL="xiaozaa/flux1-fill-dev-diffusers"

# Training hyperparameters
TRAIN_BATCH_SIZE=1
GRADIENT_ACCUMULATION=8
LEARNING_RATE=2e-5
MAX_TRAIN_STEPS=100000
CHECKPOINTING_STEPS=1000
MIXED_PRECISION="bf16"
HEIGHT=768
WIDTH=576

# ─── Validation ────────────────────────────────────────────────

# Check GPU availability
echo "🔍 Checking GPUs..."
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || {
    echo "ERROR: No GPU found. This script requires GPUs."
    exit 1
}

GPU_COUNT=$(nvidia-smi --query-gpu=count --format=csv,noheader 2>/dev/null || echo "1")
echo "   Found ${GPU_COUNT} GPU(s)"

# Check dataset
if [ ! -d "$DATASET_PATH" ]; then
    echo "ERROR: Dataset not found at $DATASET_PATH"
    echo "Run scripts/dataset/prepare_dataset.py --format catvton first."
    exit 1
fi
echo "📁 Dataset: $DATASET_PATH"

mkdir -p "$OUTPUT_DIR"

# ─── Training Command ──────────────────────────────────────────
#
# This uses the official CatVTON-FLUX training script from:
# https://github.com/nftblackmagic/catvton-flux
#
# Clone if not present:
#   git clone https://github.com/nftblackmagic/catvton-flux.git

echo "🚀 Starting full fine-tuning..."
echo "   Output: $OUTPUT_DIR"
echo "   Steps:  $MAX_TRAIN_STEPS"
echo ""

# Check if catvton-flux repo is cloned
if [ ! -d "catvton-flux" ]; then
    echo "Cloning CatVTON-FLUX training repo..."
    git clone https://github.com/nftblackmagic/catvton-flux.git
    pip install -r catvton-flux/requirements.txt
fi

cd catvton-flux

accelerate launch --config_file ../accelerate_config.yaml train_flux_inpaint.py \
    --pretrained_model_name_or_path="$MODEL_NAME" \
    --pretrained_inpaint_model_name_or_path="$INPAINT_MODEL" \
    --instance_data_dir="$DATASET_PATH" \
    --output_dir="$OUTPUT_DIR" \
    --mixed_precision="$MIXED_PRECISION" \
    --train_batch_size=$TRAIN_BATCH_SIZE \
    --gradient_accumulation_steps=$GRADIENT_ACCUMULATION \
    --optimizer="adamw" \
    --use_8bit_adam \
    --learning_rate=$LEARNING_RATE \
    --lr_scheduler="constant" \
    --max_train_steps=$MAX_TRAIN_STEPS \
    --height=$HEIGHT \
    --width=$WIDTH \
    --checkpointing_steps=$CHECKPOINTING_STEPS \
    --report_to="tensorboard"

echo ""
echo "✅ Full fine-tuning complete!"
echo "   Model saved to: $OUTPUT_DIR"
echo ""
echo "To upload to HuggingFace:"
echo "  huggingface-cli upload your-org/catvton-ethnic-wear $OUTPUT_DIR"
