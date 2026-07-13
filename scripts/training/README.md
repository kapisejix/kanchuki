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

## Training Options

Two training scripts are available, matching different CatVTON model architectures:

| Script | Model | VRAM | When to use |
|--------|-------|------|-------------|
| `train_lora_sd.py` (⭐ recommended) | SD 1.5 inpainting UNet | **12GB+** | Matches deployed RunPod handler. Train once, deploy to production. |
| `train_lora.py` | CatVTON-FLUX (FLUX.1-dev) | 24GB+ | Higher capacity but different architecture. Needs model swap in production. |

## Quick Start (SD-based, matches production)

### 1. Collect Images from R2

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

### 3. Prepare Dataset (flux-lora format works for both scripts)

```bash
python scripts/dataset/prepare_dataset.py \
    --format flux-lora \
    --output ./training-data
```

### 4. Train LoRA (SD-based, 12GB VRAM)

```bash
# On an RTX 3060/4060 (12GB) or any CUDA GPU
accelerate launch --config_file accelerate_config.yaml train_lora_sd.py \
    --dataset-path ./training-data \
    --output-dir ./outputs/sd-ethnic-lora \
    --max-train-steps 3000 \
    --train-batch-size 1 \
    --lora-rank 32
```

### 5. Deploy to RunPod

Set the `CATVTON_LORA_PATH` environment variable on your RunPod endpoint to
point at the LoRA weights. The handler automatically loads them on startup.

```bash
# Upload LoRA weights to R2 for accessibility
python -c "
import boto3
from botocore.config import Config

s3 = boto3.client('s3',
    endpoint_url=os.environ['R2_ENDPOINT'],
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    config=Config(signature_version='s3v4'),
    region_name='auto',
)
s3.upload_file(  
    './outputs/sd-ethnic-lora/kanchuki-ethnic-wear-lora.safetensors',
    os.environ['R2_BUCKET_NAME'],
    'training/lora/kanchuki-ethnic-wear-lora.safetensors',
)
print(f'Uploaded to R2: {os.environ[\"R2_PUBLIC_URL\"]}/training/lora/kanchuki-ethnic-wear-lora.safetensors')
"
```

Then on your RunPod endpoint dashboard, set:
- `CATVTON_LORA_PATH` = `https://pub-XXXX.r2.dev/training/lora/kanchuki-ethnic-wear-lora.safetensors`
- `CATVTON_LORA_SCALE` = `0.8` (adjust to control LoRA influence; 0.8 works well)

Redeploy the endpoint — workers will download and load the LoRA on cold start.

## GPU Requirements

| Method | GPU | VRAM | Time (3000 steps) | Quality |
|--------|-----|------|-------------------|---------|
| SD LoRA (rank 32) ⭐ | RTX 3060/4060 | 12GB | ~3 hours | Good |
| SD LoRA (rank 64) | RTX 3090/4090 | 24GB | ~2 hours | Better |
| FLUX LoRA (rank 32) | RTX 3090/4090 | 24GB | ~3 hours | Good (needs FLUX swap) |
| Full fine-tune | 2x H100 80GB | 160GB | ~8 hours | Best |

## Monitoring

```bash
# During training, view TensorBoard:
tensorboard --logdir ./outputs/ethnic-wear-lora
```
