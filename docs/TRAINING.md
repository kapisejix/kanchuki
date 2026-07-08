# CatVTON Fine-Tuning for Indian Ethnic Wear

## Overview

This document describes the complete pipeline for fine-tuning CatVTON-FLUX with Indian ethnic wear images. The goal is to improve Virtual Try-On quality for sarees, lehengas, unstitched suits, and other Indian garments that general VTO models struggle with.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DATA COLLECTION                        │
│                                                         │
│  R2 Bucket ──→ collector.py ──→ dataset/cloth/           │
│  (product      Downloads        ~200-500 images          │
│   photos)      images           + metadata.json          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                    MASK GENERATION                        │
│                                                         │
│  dataset/cloth/ ──→ generate_masks.py ──→ dataset/masks/ │
│  Images            rembg/SCHP         Binary PNG masks   │
│                    + quality validation                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                   DATASET PREPARATION                     │
│                                                         │
│  dataset/ ──→ prepare_dataset.py ──→ training-data/      │
│  cloth/        ┌ flux-lora: for LoRA training           │
│  masks/        └ catvton:  for full fine-tuning         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                   MODEL FINE-TUNING                       │
│                                                         │
│  training-data/ ──→ train_lora.py ──→ LoRA weights       │
│  CatVTON-FLUX         LoRA rank 32    .safetensors file  │
│  base model        ~3 hours on 4090                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                   DEPLOYMENT                              │
│                                                         │
│  LoRA weights ──→ HuggingFace ──→ handler_runpod.py     │
│                              pipe.load_lora_weights()    │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

### Hardware

| Component | LoRA Training | Full Fine-Tuning |
|-----------|--------------|------------------|
| GPU | RTX 3090/4090 (24GB) | 2x H100 (160GB) |
| RAM | 32GB+ | 64GB+ |
| Storage | 50GB+ | 100GB+ |

### Software

- Python 3.10+
- CUDA 12.4
- Docker (for training container)

### API Keys

- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — for accessing product images

## Step-by-Step Training Guide

### Step 1: Collect Dataset

```bash
pip install -r scripts/dataset/requirements.txt

# Collect up to 500 recent product photos
python scripts/dataset/collector.py \
    --since 2026-01-01 \
    --max-photos 500 \
    --output ./dataset
```

This downloads images from R2 to `./dataset/cloth/` and saves metadata to `./dataset/metadata/`.

### Step 2: Generate Segmentation Masks

```bash
python scripts/dataset/generate_masks.py \
    --dataset-dir ./dataset \
    --force              # Regenerate even if masks exist

# Validate mask quality
python scripts/dataset/generate_masks.py \
    --dataset-dir ./dataset \
    --validate
```

Masks are saved as PNG files in `./dataset/masks/`. The validation step checks for:
- Minimum coverage (>5% of image area)
- Not near-full coverage (poor quality indicator)
- Minimum resolution (100px)

### Step 3: Prepare Training Data

For LoRA training (recommended for single GPU):

```bash
python scripts/dataset/prepare_dataset.py \
    --dataset-dir ./dataset \
    --format flux-lora \
    --output ./training-data
```

For full fine-tuning (H100 GPUs only):

```bash
python scripts/dataset/prepare_dataset.py \
    --dataset-dir ./dataset \
    --format catvton \
    --output ./training-data-full
```

To filter by specific categories (e.g., only sarees and lehengas):

```bash
python scripts/dataset/prepare_dataset.py \
    --format flux-lora \
    --output ./training-data \
    --categories Saree Lehenga Gown
```

### Step 4: Run LoRA Training

```bash
pip install -r scripts/training/requirements.txt

accelerate launch --config_file scripts/training/accelerate_config.yaml \
    scripts/training/train_lora.py \
    --dataset-path ./training-data \
    --output-dir ./outputs/ethnic-lora \
    --max-train-steps 3000 \
    --train-batch-size 1 \
    --gradient-accumulation-steps 4 \
    --learning-rate 1e-4 \
    --lora-rank 32 \
    --checkpointing-steps 500 \
    --tracking
```

**Training time estimate:** ~3 hours on RTX 4090 for 3000 steps.

**Monitor progress:**
```bash
tensorboard --logdir ./outputs/ethnic-lora
```

### Step 5: Evaluate the Model

After training, test the LoRA weights qualitatively:

```python
from diffusers import FluxPipeline
import torch

pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-dev",
    torch_dtype=torch.bfloat16,
)

# Load your fine-tuned LoRA
pipe.load_lora_weights("./outputs/ethnic-lora/lora-final")

pipe.to("cuda")

# Test with a saree image
result = pipe(
    prompt="A woman wearing a traditional Indian silk saree with gold border",
    num_inference_steps=30,
    guidance_scale=3.5,
).images[0]
result.save("test-saree-output.jpg")
```

### Step 6: Deploy to Production

Upload LoRA weights to HuggingFace:

```bash
# Install huggingface-cli if not installed
pip install huggingface-hub

# Upload
huggingface-cli upload \
    snumbhraal/catvton-ethnic-wear-lora \
    ./outputs/ethnic-lora/kanchuki-ethnic-wear-lora.safetensors \
    --repo-type model
```

Update the RunPod handler (`services/tryon/handler_runpod.py`) to load the fine-tuned LoRA:

```python
# In load_model(), after creating the pipe:
try:
    pipe.load_lora_weights("snumbhraal/catvton-ethnic-wear-lora")
    print("[CatVTON] Fine-tuned LoRA weights loaded successfully!")
except Exception as e:
    print(f"[CatVTON] Failed to load LoRA weights: {e}")
    print("[CatVTON] Using base CatVTON-FLUX model (no fine-tuning)")
```

Rebuild and deploy the Docker image to RunPod.

## Dataset Size Recommendations

| Images | Quality | Training Time (4090) | Notes |
|--------|---------|---------------------|-------|
| 30-50  | Fair    | ~1 hour            | Minimum viable |
| 100-200| Good    | ~2 hours            | Good starting point |
| 300-500| Great   | ~3-4 hours          | Recommended for production |
| 1000+  | Best    | ~8+ hours           | Diminishing returns |

## Hyperparameter Guide

| Parameter | Recommended | Description |
|-----------|------------|-------------|
| LoRA rank | 32-64 | Higher = more capacity, more memory |
| LoRA alpha | rank/2 | Scaling factor for LoRA weights |
| Learning rate | 1e-4 (LoRA) / 2e-5 (full) | Higher = faster but unstable |
| Batch size | 1 | Limited by VRAM; use gradient accumulation |
| Gradient accumulation | 4-8 | Simulates larger batch size |
| Steps | 2000-5000 | More steps = better, watch for overfitting |
| Mixed precision | bf16 | Saves memory, stable training |
| LR scheduler | constant | Best for LoRA fine-tuning |

## Troubleshooting

### OOM (Out of Memory)
- Reduce `lora-rank` to 16
- Enable `use-8bit-adam`
- Reduce `height`/`width` to 512/384
- Reduce `train-batch-size` to 1

### Poor Quality Results
- Increase dataset size (aim for 200+ images)
- Check mask quality with `--validate`
- Reduce learning rate to 5e-5
- Increase training steps
- Filter to specific categories (don't mix sarees and kurtis)

### Overfitting
- Add more diverse images
- Reduce training steps
- Increase LoRA dropout (0.1 instead of 0.05)
- Add image augmentation (not implemented yet)

### Training Too Slow
- Use a GPU with more VRAM (A100 > 4090 > 3090)
- Reduce image resolution
- Reduce LoRA rank

## Roadmap

- [ ] Automated dataset collection from new product uploads
- [ ] Multi-category LoRA (one LoRA per garment type)
- [ ] SCHP-based mask generation (better than rembg for garments)
- [ ] DensePose integration for person-aware training
- [ ] A/B testing framework: compare base vs fine-tuned quality
- [ ] Automatic deployment to RunPod after training
