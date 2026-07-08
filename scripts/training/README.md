# CatVTON Ethnic Wear Fine-Tuning

Fine-tune CatVTON-FLUX with Indian ethnic wear images to improve saree draping, lehenga flare, and unstitched suit handling.

## Pipeline Overview

```
Product Uploads (R2) 
      ↓
collector.py → Downloads images from R2
      ↓
generate_masks.py → Creates segmentation masks
      ↓
prepare_dataset.py → Packages into training format
      ↓
train_lora.py → LoRA fine-tunes CatVTON-FLUX
      ↓
LoRA weights → Loaded during inference for better ethnic wear results
```

## Quick Start

### 1. Collect Images

```bash
# From R2 product uploads
R2_ENDPOINT=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
R2_BUCKET_NAME=kanchuki-dev R2_PUBLIC_URL=... \
python scripts/dataset/collector.py --since 2026-01-01 --max-photos 200
```

### 2. Generate Masks

```bash
python scripts/dataset/generate_masks.py
python scripts/dataset/generate_masks.py --validate  # Check quality
```

### 3. Prepare Dataset

```bash
# For LoRA training (recommended)
python scripts/dataset/prepare_dataset.py \
    --format flux-lora \
    --output ./training-data

# For full fine-tuning (requires H100 GPUs)
python scripts/dataset/prepare_dataset.py \
    --format catvton \
    --output ./training-data-full
```

### 4. Train LoRA

```bash
# On a single RTX 3090/4090 (24GB)
accelerate launch --config_file accelerate_config.yaml train_lora.py \
    --dataset-path ./training-data \
    --output-dir ./outputs/ethnic-wear-lora \
    --max-train-steps 3000 \
    --train-batch-size 1 \
    --lora-rank 32
```

### 5. Deploy

Upload the LoRA weights to HuggingFace:
```bash
huggingface-cli upload your-hf-username/catvton-ethnic-wear-lora \
    ./outputs/ethnic-wear-lora/kanchuki-ethnic-wear-lora.safetensors
```

Then use in `handler_runpod.py`:
```python
pipe.load_lora_weights("your-hf-username/catvton-ethnic-wear-lora")
```

## GPU Requirements

| Method | GPU | VRAM | Time (3000 steps) | Quality |
|--------|-----|------|-------------------|---------|
| LoRA (rank 32) | RTX 3090/4090 | 24GB | ~3 hours | Good |
| LoRA (rank 64) | A100 80GB | 80GB | ~2 hours | Better |
| Full fine-tune | 2x H100 80GB | 160GB | ~8 hours | Best |

## Monitoring

```bash
# During training, view TensorBoard:
tensorboard --logdir ./outputs/ethnic-wear-lora
```
