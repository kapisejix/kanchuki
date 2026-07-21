"""
Fashion V-Tone v1.5 Virtual Try-On Service
============================================
FastAPI server wrapping the fashn-vton library (Apache 2.0 licensed).
Accepts image URLs, runs TryOnPipeline, returns result URL.

Maskless architecture — no background removal preprocessing needed.
Runs on CPU or GPU. ~10-30s per try-on on GPU, ~30-60s on CPU.

Usage:
    pip install -r requirements.txt
    python app.py                           # Start server on port 8000
    curl http://localhost:8000/health

API:
    POST /try-on
        {
            "person_image_url": "https://...",
            "garment_image_url": "https://...",
            "category": "tops" | "bottoms" | "one-pieces"
        }
        -> { "status": "completed", "result_url": "https://...", "latency_ms": 15000 }
"""

import asyncio
import io
import os
import time
import uuid
import logging
from contextlib import asynccontextmanager
from typing import Literal, Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Configuration ─────────────────────────────────────────────

WEIGHTS_DIR = os.environ.get("VTONE_WEIGHTS_DIR", "./weights")
DEVICE = os.environ.get("VTONE_DEVICE", "")  # empty = auto-detect (GPU if available)
DOWNLOAD_TIMEOUT = int(os.environ.get("DOWNLOAD_TIMEOUT", "30"))

# Model downloads to HF cache on first run (~2.3 GB total).
# Optionally point VTONE_WEIGHTS_DIR at a pre-downloaded directory.

# ─── Request/Response Models ──────────────────────────────────

class TryOnRequest(BaseModel):
    person_image_url: str
    garment_image_url: str
    category: Literal["tops", "bottoms", "one-pieces"] = "tops"

class TryOnResponse(BaseModel):
    status: str
    result_url: str
    latency_ms: int
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    pipeline_loaded: bool
    device: str
    gpu_available: bool

# ─── Global pipeline reference ─────────────────────────────────

pipeline = None
pipeline_loading = False


async def _load_pipeline():
    """Load the V-Tone pipeline in a background task so the health
    endpoint responds immediately and Railway health checks pass.

    The model weights (~2.3 GB) load from disk, which can take
    5-10 minutes on CPU. By running this as a background asyncio
    task, the FastAPI app starts serving requests right away.
    """
    global pipeline, pipeline_loading
    pipeline_loading = True
    try:
        from fashn_vton import TryOnPipeline
        logger.info("Loading Fashion V-Tone v1.5 pipeline in background...")
        pipeline = TryOnPipeline(weights_dir=WEIGHTS_DIR)
        logger.info("Fashion V-Tone pipeline initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize pipeline: {e}")
    finally:
        pipeline_loading = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start pipeline loading in background; don't block startup."""
    asyncio.create_task(_load_pipeline())
    yield
    if pipeline is not None:
        pipeline.unload()
        logger.info("Fashion V-Tone pipeline unloaded")


# Initialize FastAPI app
app = FastAPI(
    title="Fashion V-Tone Try-On API",
    description="Virtual try-on via FASHN VTON v1.5 (Apache 2.0)",
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

# ─── Image Download ───────────────────────────────────────────

def download_image(url: str) -> Image.Image:
    """Download image from URL and return PIL Image in RGB."""
    try:
        resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
        resp.raise_for_status()

        ct = resp.headers.get("Content-Type", "")
        if not ct.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=f"URL returned Content-Type '{ct}' instead of an image. Check that {url} is publicly accessible.",
            )

        try:
            img = Image.open(io.BytesIO(resp.content))
            img.verify()
            img = Image.open(io.BytesIO(resp.content))
        except Exception as pil_err:
            raise HTTPException(
                status_code=400,
                detail=f"Downloaded content is not a valid image: {pil_err}. URL: {url}",
            )

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

# ─── Result Upload ────────────────────────────────────────────

def upload_result(result_pil: Image.Image, filename: str) -> str:
    """Upload result PNG to R2 and return public URL, or return data URL as fallback."""
    import base64

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
            result_pil.save(buf, format="PNG")
            buf.seek(0)

            key = f"tryon-results/{filename}.png"

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
                ContentType="image/png",
            )

            if r2_public_url:
                return f"{r2_public_url}/{key}"
            return s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": r2_bucket, "Key": key},
                ExpiresIn=86400,
            )
        except Exception as e:
            logger.warning(f"R2 upload failed, falling back to data URL: {e}")

    # Fallback: data URL
    buf = io.BytesIO()
    result_pil.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"

# ─── Endpoints ────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "online", "message": "Fashion V-Tone v1.5 API is running"}

@app.get("/health", response_model=HealthResponse)
async def health():
    import torch
    if pipeline is not None:
        status = "ok"
    elif pipeline_loading:
        status = "loading"
    else:
        status = "error"
    return HealthResponse(
        status=status,
        pipeline_loaded=pipeline is not None,
        device=str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
        gpu_available=torch.cuda.is_available(),
    )

@app.post("/try-on")
async def try_on(request: TryOnRequest):
    """
    Run virtual try-on via Fashion V-Tone v1.5.

    Accepts image URLs (not uploaded files) as input.
    The V-Tone model handles raw product photos
    without background removal preprocessing.
    """
    if pipeline is None:
        detail = "Pipeline still loading" if pipeline_loading else "Pipeline not initialized"
        raise HTTPException(status_code=503, detail=detail)

    start_time = time.time()

    try:
        # Download images
        logger.info(f"Downloading person image from {request.person_image_url[:80]}...")
        person_pil = download_image(request.person_image_url)

        logger.info(f"Downloading garment image from {request.garment_image_url[:80]}...")
        garment_pil = download_image(request.garment_image_url)

        logger.info(f"Person size: {person_pil.size}, Garment size: {garment_pil.size}, Category: {request.category}")

        # Run V-Tone inference
        result = pipeline(
            person_image=person_pil,
            garment_image=garment_pil,
            category=request.category,
        )
        result_pil = result.images[0]

        # Upload result
        job_id = str(uuid.uuid4())[:8]
        result_url = upload_result(result_pil, f"vton-{job_id}")

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info(f"Try-on completed in {latency_ms}ms")

        return TryOnResponse(
            status="completed",
            result_url=result_url,
            latency_ms=latency_ms,
        )

    except HTTPException:
        raise
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Try-on failed: {e}", exc_info=True)
        return TryOnResponse(
            status="failed",
            result_url="",
            latency_ms=latency_ms,
            error=str(e),
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
