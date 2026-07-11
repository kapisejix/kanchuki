"""
Virtual Try-On API — CatVTON Self-Hosted Server
================================================
FastAPI server that loads the CatVTON model and provides a try-on endpoint.
~$0.005 per try-on on an L4 GPU (~$0.44/hr).

Usage:
    pip install -r requirements.txt
    python app.py                    # Start server on port 8000
    curl http://localhost:8000/health

API:
    POST /try-on
        {
            "person_image_url": "https://...",
            "garment_image_url": "https://...",
            "mask_image_url": "https://..." (optional — auto-generated if missing)
        }
        -> { "status": "completed", "result_url": "https://...", "latency_ms": 35000 }
"""

import io
import json
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Configuration ─────────────────────────────────────────────

# Model config
MODEL_CKPT = os.environ.get("CATVTON_MODEL_CKPT", "zhengchong/CatVTON")
BASE_CKPT = os.environ.get("CATVTON_BASE_CKPT", "runwayml/stable-diffusion-inpainting")
DEVICE = os.environ.get("CATVTON_DEVICE", "cuda")
DTYPE = os.environ.get("CATVTON_DTYPE", "float16")

# Inference config
INFERENCE_STEPS = int(os.environ.get("INFERENCE_STEPS", "30"))
GUIDANCE_SCALE = float(os.environ.get("GUIDANCE_SCALE", "2.5"))
IMAGE_HEIGHT = int(os.environ.get("IMAGE_HEIGHT", "512"))
IMAGE_WIDTH = int(os.environ.get("IMAGE_WIDTH", "384"))

# Download timeout
DOWNLOAD_TIMEOUT = int(os.environ.get("DOWNLOAD_TIMEOUT", "30"))

# Global pipeline reference
pipe = None
automasker = None  # None = fall back to heuristic mask (see generate_mask)

# ─── Request/Response Models ──────────────────────────────────

class TryOnRequest(BaseModel):
    person_image_url: str
    garment_image_url: str
    mask_image_url: Optional[str] = None  # Auto-generated if not provided
    cloth_type: str = "upper"  # upper / lower / overall — used by heuristic mask

class TryOnResponse(BaseModel):
    status: str
    result_url: str
    latency_ms: int
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    gpu_available: bool

# ─── Model Loading ────────────────────────────────────────────

def load_model():
    """Load CatVTON pipeline. Called once at startup."""
    global pipe, automasker
    try:
        import torch
        import sys
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from model.pipeline import CatVTONPipeline  # type: ignore[import-untyped]

        weight_dtype = torch.float16 if DTYPE == "float16" else torch.float32
        device = DEVICE if torch.cuda.is_available() else "cpu"

        print(f"[CatVTON] Loading model: {MODEL_CKPT}")
        print(f"[CatVTON] Device: {device}, dtype: {weight_dtype}")

        pipe = CatVTONPipeline(
            attn_ckpt=MODEL_CKPT,
            base_ckpt=BASE_CKPT,
            device=device,
            weight_dtype=weight_dtype,
        )
        print("[CatVTON] Model loaded successfully")
    except Exception as e:
        print(f"[CatVTON] Failed to load model: {e}")
        pipe = None
        raise

    try:
        from huggingface_hub import snapshot_download
        from model.cloth_masker import AutoMasker  # type: ignore[import-untyped]

        repo_path = snapshot_download(MODEL_CKPT)
        automasker = AutoMasker(
            densepose_ckpt=os.path.join(repo_path, "DensePose"),
            schp_ckpt=os.path.join(repo_path, "SCHP"),
            device=device,
        )
        print("[CatVTON] AutoMasker loaded successfully")
    except Exception as e:
        # detectron2/densepose build is finicky (source-compiled CUDA ops) —
        # degrade to the heuristic mask rather than fail the whole server.
        print(f"[CatVTON] AutoMasker unavailable ({e}), falling back to heuristic mask")
        automasker = None

# ─── Image Download ───────────────────────────────────────────

def download_image(url: str) -> "PIL.Image.Image":
    """Download image from URL and return PIL Image."""
    from PIL import Image as PILImage

    try:
        resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
        resp.raise_for_status()

        # Validate content type — bail early if not an image
        ct = resp.headers.get("Content-Type", "")
        if not ct.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"URL returned Content-Type '{ct}' instead of an image. "
                    f"Check that {url} is a publicly accessible image URL "
                    f"(the R2 bucket must have public access enabled)."
                ),
            )

        try:
            img = PILImage.open(io.BytesIO(resp.content))
            img.verify()  # Force PIL to actually decode — lazy open won't catch all corrupt files
            # Re-open after verify() closes the file
            img = PILImage.open(io.BytesIO(resp.content))
        except Exception as pil_err:
            # Content-Type said image, but PIL can't parse the bytes
            content_preview = resp.content[:200]
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Image download succeeded but content is not a valid image: {pil_err}. "
                    f"URL: {url}. "
                    f"First 200 bytes: {content_preview!r}"
                ),
            )

        # Convert to RGB if necessary
        if img.mode != "RGB":
            img = img.convert("RGB")
        return img
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to download image from {url}: {str(e)}",
        )

# ─── Mask Generation ──────────────────────────────────────────

def generate_mask(person_pil: "PIL.Image.Image", cloth_type: str = "upper") -> "PIL.Image.Image":
    """AutoMasker (DensePose+SCHP) if loaded, else the heuristic rectangle-over-silhouette mask."""
    if automasker is not None:
        try:
            return automasker(person_pil, mask_type=cloth_type)["mask"]
        except Exception as e:
            print(f"[CatVTON] AutoMasker inference failed ({e}), falling back to heuristic mask")

    from mask_utils import generate_heuristic_mask
    return generate_heuristic_mask(person_pil, cloth_type)

# ─── Inference ────────────────────────────────────────────────

def run_inference(
    person_pil: "PIL.Image.Image",
    garment_pil: "PIL.Image.Image",
    mask_pil: "PIL.Image.Image",
) -> "PIL.Image.Image":
    """Run CatVTON inference on the given images."""
    from diffusers.image_processor import VaeImageProcessor

    vae_processor = VaeImageProcessor(vae_scale_factor=8)
    mask_processor = VaeImageProcessor(
        vae_scale_factor=8,
        do_normalize=False,
        do_binarize=True,
        do_convert_grayscale=True,
    )

    # Preprocess images to model's expected resolution
    person_t = vae_processor.preprocess(
        person_pil, height=IMAGE_HEIGHT, width=IMAGE_WIDTH
    )
    garment_t = vae_processor.preprocess(
        garment_pil, height=IMAGE_HEIGHT, width=IMAGE_WIDTH
    )
    mask_t = mask_processor.preprocess(
        mask_pil, height=IMAGE_HEIGHT, width=IMAGE_WIDTH
    )

    # Move tensors to the same device as the model
    device = next(pipe.unet.parameters()).device
    person_t = person_t.to(device)
    garment_t = garment_t.to(device)
    mask_t = mask_t.to(device)

    # Inference
    result = pipe(
        person_t,
        garment_t,
        mask_t,
        num_inference_steps=INFERENCE_STEPS,
        guidance_scale=GUIDANCE_SCALE,
        height=IMAGE_HEIGHT,
        width=IMAGE_WIDTH,
    )

    return result[0]  # PIL Image

# ─── Result Upload ────────────────────────────────────────────

def upload_result_to_r2(result_pil: "PIL.Image.Image", filename: str) -> str:
    """
    Upload result to R2 and return public URL.
    Falls back to returning a data URL if R2 is not configured.
    """
    import base64

    # Try R2 upload if configured
    r2_endpoint = os.environ.get("R2_ENDPOINT")
    r2_access_key = os.environ.get("R2_ACCESS_KEY_ID")
    r2_secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    r2_bucket = os.environ.get("R2_BUCKET_NAME")
    r2_public_url = os.environ.get("R2_PUBLIC_URL")

    if all([r2_endpoint, r2_access_key, r2_secret_key, r2_bucket]):
        try:
            import boto3
            from botocore.config import Config

            buf = io.BytesIO()
            result_pil.save(buf, format="JPEG", quality=85)
            buf.seek(0)

            key = f"tryon-results/{filename}.jpg"

            s3 = boto3.client(
                "s3",
                endpoint_url=r2_endpoint,
                aws_access_key_id=r2_access_key,
                aws_secret_access_key=r2_secret_key,
                config=Config(signature_version="s3v4"),
                region_name="auto",
            )
            s3.put_object(
                Bucket=r2_bucket,
                Key=key,
                Body=buf,
                ContentType="image/jpeg",
            )

            if r2_public_url:
                return f"{r2_public_url}/{key}"
            # Return presigned URL as fallback
            return s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": r2_bucket, "Key": key},
                ExpiresIn=86400,  # 24 hours
            )
        except Exception as e:
            print(f"[CatVTON] R2 upload failed: {e}")
            # Fall through to base64 fallback

    # Fallback: return base64 data URL
    buf = io.BytesIO()
    result_pil.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/jpeg;base64,{b64}"

# ─── FastAPI App ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    load_model()
    yield
    # Cleanup on shutdown
    global pipe
    pipe = None

app = FastAPI(
    title="CatVTON Try-On API",
    description="Self-hosted virtual try-on using CatVTON",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Endpoints ────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    import torch
    return HealthResponse(
        status="ok" if pipe is not None else "error",
        model_loaded=pipe is not None,
        device=DEVICE,
        gpu_available=torch.cuda.is_available(),
    )

@app.post("/try-on", response_model=TryOnResponse)
async def try_on(request: TryOnRequest):
    """Run virtual try-on with CatVTON."""
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start_time = time.time()
    from PIL import Image as PILImage

    try:
        # Download images
        person_pil = download_image(request.person_image_url)
        garment_pil = download_image(request.garment_image_url)

        # Get or generate mask
        if request.mask_image_url:
            mask_pil = download_image(request.mask_image_url)
        else:
            mask_pil = generate_mask(person_pil, request.cloth_type)

        # Run inference
        result_pil = run_inference(person_pil, garment_pil, mask_pil)

        # Upload result
        job_id = str(uuid.uuid4())[:8]
        result_url = upload_result_to_r2(result_pil, f"catvton-{job_id}")

        latency_ms = int((time.time() - start_time) * 1000)

        return TryOnResponse(
            status="completed",
            result_url=result_url,
            latency_ms=latency_ms,
        )

    except HTTPException:
        raise
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return TryOnResponse(
            status="failed",
            result_url="",
            latency_ms=latency_ms,
            error=str(e),
        )

@app.post("/warmup")
async def warmup():
    """Run a quick dummy inference to warm up the model (GPU warmup).
    Call this once after deployment to avoid cold-start latency for first real request."""
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    from PIL import Image as PILImage
    import numpy as np

    # Create dummy images at model resolution
    dummy_person = PILImage.fromarray(
        np.random.randint(0, 255, (IMAGE_HEIGHT, IMAGE_WIDTH, 3), dtype=np.uint8)
    )
    dummy_garment = PILImage.fromarray(
        np.random.randint(0, 255, (IMAGE_HEIGHT, IMAGE_WIDTH, 3), dtype=np.uint8)
    )
    dummy_mask = PILImage.fromarray(
        np.ones((IMAGE_HEIGHT, IMAGE_WIDTH), dtype=np.uint8) * 255
    )

    try:
        _ = run_inference(dummy_person, dummy_garment, dummy_mask)
        return {"status": "warmed_up"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
