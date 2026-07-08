# CatVTON Virtual Try-On Service

Self-hosted AI virtual try-on using [CatVTON](https://huggingface.co/zhengchong/CatVTON).
~$0.005 per try-on (17x cheaper than FASHN API).

## Quick Start

```bash
# Option 1: Docker (recommended with GPU)
docker compose -f services/tryon/docker-compose.yml up

# Option 2: Local Python
cd services/tryon
pip install -r requirements.txt
python app.py
```

## API

### POST /try-on

```bash
curl -X POST http://localhost:8000/try-on \
  -H "Content-Type: application/json" \
  -d '{
    "person_image_url": "https://example.com/customer-photo.jpg",
    "garment_image_url": "https://example.com/garment.jpg"
  }'
```

Response:
```json
{
  "status": "completed",
  "result_url": "https://pub-xxx.r2.dev/tryon-results/abc123.jpg",
  "latency_ms": 35000
}
```

### GET /health

```bash
curl http://localhost:8000/health
```

### POST /warmup

Run once after deployment to avoid cold-start latency on first request.

## GPU Requirements

| GPU | VRAM | Quality | Speed |
|-----|------|---------|-------|
| RTX 3060 | 12GB | Good | ~45s |
| RTX 3090 | 24GB | Better | ~30s |
| A10G / L4 | 24GB | Best | ~25s |
| A100 | 80GB | Best | ~15s |

Cloud GPU options (hourly):
- RunPod: L4 ~$0.44/hr
- Jarvis Labs: RTX 3090 ~$0.29/hr
- Vast.ai: RTX 3060 ~$0.15/hr
- AWS: g5.xlarge (A10G) ~$1.00/hr

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Server port |
| `CATVTON_MODEL_CKPT` | `zhengchong/CatVTON` | HuggingFace model ID |
| `CATVTON_BASE_CKPT` | `runwayml/stable-diffusion-inpainting` | Base SD inpainting model |
| `CATVTON_DEVICE` | `cuda` | Device: cuda / cpu |
| `CATVTON_DTYPE` | `float16` | Model precision |
| `INFERENCE_STEPS` | `30` | More = better quality, slower |
| `GUIDANCE_SCALE` | `2.5` | How closely to follow prompt |
| `IMAGE_HEIGHT` | `512` | Output image height |
| `IMAGE_WIDTH` | `384` | Output image width |
| `DOWNLOAD_TIMEOUT` | `30` | Seconds to wait for image download |
| `R2_ENDPOINT` | — | R2 S3 endpoint (optional) |
| `R2_ACCESS_KEY_ID` | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | — | R2 secret key |
| `R2_BUCKET_NAME` | — | R2 bucket name |
| `R2_PUBLIC_URL` | — | R2 public URL |

## Production Deployment (RunPod)

1. Create a RunPod account
2. Select **Serverless** → **Custom Template**
3. Use the Docker image from this repo
4. Set container disk to 50GB (model is ~10GB)
5. Select L4 or A100 GPU
6. Set endpoint timeout to 120s (CatVTON ~35s per request)
7. Set max concurrency to 2-3 (adjust based on GPU VRAM)

## Cost Breakdown

| 100 try-ons/mo | 500 try-ons/mo | 2000 try-ons/mo |
|----------------|----------------|-----------------|
| $1.50 (L4 ~3.4hr) | $7.30 (L4 ~17hr) | $29 (L4 ~68hr) |

Compare to FASHN: $7.50 / $37.50 / $150.
