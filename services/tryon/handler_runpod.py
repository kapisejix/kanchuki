"""
CatVTON RunPod Serverless Handler
===================================
Deploys the CatVTON model as a RunPod serverless worker.
~$0.005 per try-on on an L4 GPU (~$0.44/hr).

Deployment instructions:
    docker build -t YOUR_DOCKERHUB_USER/kanchuki-tryon:latest \\
        -f services/tryon/Dockerfile.runpod .
    docker push YOUR_DOCKERHUB_USER/kanchuki-tryon:latest
    # Then create a RunPod serverless endpoint with this image

RunPod endpoint config:
    - GPU: L4 (24GB)
    - Container Disk: 50GB
    - Idle Timeout: 60s
    - Max Workers: 2
    - Endpoint Timeout: 120s
"""

import io
import os
import sys
import time
import uuid
import base64
import requests
from PIL import Image as PILImage
import numpy as np

# ─── Configuration ─────────────────────────────────────────────

MODEL_CKPT = os.environ.get("CATVTON_MODEL_CKPT", "zhengchong/CatVTON")
BASE_CKPT = os.environ.get("CATVTON_BASE_CKPT", "stable-diffusion-v1-5/stable-diffusion-inpainting")
DEVICE = os.environ.get("CATVTON_DEVICE", "cuda")
DTYPE = os.environ.get("CATVTON_DTYPE", "float16")
INFERENCE_STEPS = int(os.environ.get("INFERENCE_STEPS", "30"))
GUIDANCE_SCALE = float(os.environ.get("GUIDANCE_SCALE", "2.5"))
IMAGE_HEIGHT = int(os.environ.get("IMAGE_HEIGHT", "512"))
IMAGE_WIDTH = int(os.environ.get("IMAGE_WIDTH", "384"))
DOWNLOAD_TIMEOUT = int(os.environ.get("DOWNLOAD_TIMEOUT", "30"))

# Optional: Path to LoRA weights for fine-tuned CatVTON (SD 1.5-based)
# Expected format: diffusers LoRA safetensors trained on the SD 1.5 inpainting
# model's UNet attention layers (q_proj, k_proj, v_proj, o_proj, etc.).
# Set to a local path or HuggingFace model ID.
LORA_PATH = os.environ.get("CATVTON_LORA_PATH", "")
LORA_SCALE = float(os.environ.get("CATVTON_LORA_SCALE", "1.0"))

# R2 config (optional — falls back to returning result as base64)
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET_NAME", "")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")

# Global pipeline — loaded once at container start
pipe = None
automasker = None  # None = fall back to heuristic mask (see generate_mask)


# ─── Model Loading ────────────────────────────────────────────

def load_model():
    """Load CatVTON pipeline once at startup."""
    global pipe, automasker
    import torch

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "CatVTON"))
    from model.pipeline import CatVTONPipeline  # type: ignore[import-untyped]

    weight_dtype = torch.float16 if DTYPE == "float16" else torch.float32
    device = DEVICE if torch.cuda.is_available() else "cpu"

    print(f"[CatVTON] Loading model: {MODEL_CKPT}")
    print(f"[CatVTON] Base: {BASE_CKPT}")
    print(f"[CatVTON] Device: {device}, dtype: {weight_dtype}")

    pipe = CatVTONPipeline(
        attn_ckpt=MODEL_CKPT,
        base_ckpt=BASE_CKPT,
        device=device,
        weight_dtype=weight_dtype,
    )
    print("[CatVTON] Model loaded successfully")

    # Load LoRA weights if configured (fine-tuned on Indian ethnic wear)
    if LORA_PATH:
        try:
            from diffusers.utils import is_peft_available
            if not is_peft_available():
                raise ImportError("peft not installed — install via pip install peft")

            print(f"[CatVTON] Loading LoRA weights from {LORA_PATH}...")
            # load_attn_procs works on UNet2DConditionModel's standard attention
            # layers (q_proj, k_proj, v_proj, o_proj). The CatVTON pipeline
            # replaces cross-attention with SkipAttnProcessor but keeps
            # self-attention layers intact — LoRA on those is still valid.
            pipe.unet.load_attn_procs(LORA_PATH)

            # Set LoRA scale (weight multiplier)
            if LORA_SCALE != 1.0:
                for module in pipe.unet.modules():
                    if hasattr(module, "set_scale"):
                        module.set_scale(LORA_SCALE)

            print(f"[CatVTON] LoRA weights loaded (scale={LORA_SCALE})")
        except Exception as e:
            print(f"[CatVTON] Failed to load LoRA weights: {e}")
            print(f"[CatVTON] Continuing with base model only")

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
        # degrade to the heuristic mask rather than fail the whole worker.
        print(f"[CatVTON] AutoMasker unavailable ({e}), falling back to heuristic mask")
        automasker = None


# ─── Image Helpers ────────────────────────────────────────────

def download_image(url: str) -> PILImage.Image:
    """Download image from URL with validation."""
    resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()

    # Validate Content-Type — bail early if not an image
    ct = resp.headers.get("Content-Type", "")
    if not ct.startswith("image/"):
        raise ValueError(
            f"URL returned Content-Type '{ct}' instead of an image. "
            f"Check that {url} is a publicly accessible image URL."
        )

    try:
        img = PILImage.open(io.BytesIO(resp.content))
        img.verify()  # Force PIL to actually decode the image
        # Re-open after verify() closes the file
        img = PILImage.open(io.BytesIO(resp.content))
    except Exception as pil_err:
        raise ValueError(
            f"Image download succeeded but content is not a valid image: {pil_err}. "
            f"URL: {url}"
        )

    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def decode_base64_image(value: str) -> PILImage.Image:
    """Decode an inline base64 image (raw or data: URI) into a PIL Image.

    Exists so the wearer's photo does not have to be persisted anywhere public
    just to be handed to this worker: the Kanchuki API sends it inline as
    `person_image_base64` and it lives only in this process's memory. See
    `packages/ai/src/tryon.ts` for the client half and the retention rule.
    """
    # Accept both "<b64>" and "data:image/jpeg;base64,<b64>".
    payload = value.split(",", 1)[1] if value.startswith("data:") else value

    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception as b64_err:
        raise ValueError(f"Not valid base64: {b64_err}")

    try:
        img = PILImage.open(io.BytesIO(raw))
        img.verify()  # Force PIL to actually decode the image
        # Re-open after verify() closes the file
        img = PILImage.open(io.BytesIO(raw))
    except Exception as pil_err:
        raise ValueError(f"Base64 payload is not a valid image: {pil_err}")

    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def generate_mask(person_pil: PILImage.Image, cloth_type: str = "upper") -> PILImage.Image:
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
    person_pil: PILImage.Image,
    garment_pil: PILImage.Image,
    mask_pil: PILImage.Image,
) -> PILImage.Image:
    """Run CatVTON inference."""
    from diffusers.image_processor import VaeImageProcessor
    import torch

    vae_processor = VaeImageProcessor(vae_scale_factor=8)
    mask_processor = VaeImageProcessor(
        vae_scale_factor=8,
        do_normalize=False,
        do_binarize=True,
        do_convert_grayscale=True,
    )

    person_t = vae_processor.preprocess(person_pil, height=IMAGE_HEIGHT, width=IMAGE_WIDTH)
    garment_t = vae_processor.preprocess(garment_pil, height=IMAGE_HEIGHT, width=IMAGE_WIDTH)
    mask_t = mask_processor.preprocess(mask_pil, height=IMAGE_HEIGHT, width=IMAGE_WIDTH)

    device = next(pipe.unet.parameters()).device
    person_t = person_t.to(device)
    garment_t = garment_t.to(device)
    mask_t = mask_t.to(device)

    result = pipe(
        person_t,
        garment_t,
        mask_t,
        num_inference_steps=INFERENCE_STEPS,
        guidance_scale=GUIDANCE_SCALE,
        height=IMAGE_HEIGHT,
        width=IMAGE_WIDTH,
    )
    return result[0]


# ─── Result Upload ────────────────────────────────────────────

def upload_result(result_pil: PILImage.Image, filename: str) -> str:
    """Upload result to R2 or return base64."""
    if all([R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET]):
        try:
            import boto3
            from botocore.config import Config

            buf = io.BytesIO()
            result_pil.save(buf, format="JPEG", quality=85)
            buf.seek(0)

            key = f"tryon-results/{filename}.jpg"
            s3 = boto3.client(
                "s3",
                endpoint_url=R2_ENDPOINT,
                aws_access_key_id=R2_ACCESS_KEY,
                aws_secret_access_key=R2_SECRET_KEY,
                config=Config(signature_version="s3v4"),
                region_name="auto",
            )
            s3.put_object(Bucket=R2_BUCKET, Key=key, Body=buf, ContentType="image/jpeg")
            return f"{R2_PUBLIC_URL}/{key}" if R2_PUBLIC_URL else key
        except Exception as e:
            print(f"[CatVTON] R2 upload failed: {e}")
            # fall through to base64

    buf = io.BytesIO()
    result_pil.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/jpeg;base64,{b64}"


# ─── RunPod Handler ───────────────────────────────────────────

def handler(job):
    """
    RunPod job handler.
    
    Expected input — each image may be supplied either as a URL or inline as
    base64 (`*_base64` wins when both are present):
    {
        "person_image_base64": "data:image/jpeg;base64,...",  # wearer photo, inline
        "person_image_url": "https://...",                    # fallback for the above
        "garment_image_url": "https://...",                   # product/garment photo
        "garment_image_base64": "data:image/jpeg;base64,...", # fallback for the above
        "mask_image_url": "https://..." (optional)
    }

    Inline input is how the API keeps the wearer's photo out of storage: the
    bytes arrive in the job payload and are discarded with the worker process.
    
    Returns:
    {
        "result_url": "https://...",
        "latency_ms": 35000,
        "error": null
    }
    """
    global pipe
    if pipe is None:
        return {"error": "Model not loaded"}

    job_input = job["input"]
    person_b64 = job_input.get("person_image_base64")
    person_url = job_input.get("person_image_url")
    garment_b64 = job_input.get("garment_image_base64")
    garment_url = job_input.get("garment_image_url")
    mask_url = job_input.get("mask_image_url")
    cloth_type = job_input.get("cloth_type", "upper")

    if not (person_b64 or person_url):
        return {"error": "person_image_base64 or person_image_url is required"}
    if not (garment_b64 or garment_url):
        return {"error": "garment_image_base64 or garment_image_url is required"}

    start_time = time.time()

    try:
        person_pil = decode_base64_image(person_b64) if person_b64 else download_image(person_url)
        garment_pil = decode_base64_image(garment_b64) if garment_b64 else download_image(garment_url)

        if mask_url:
            mask_pil = download_image(mask_url)
        else:
            mask_pil = generate_mask(person_pil, cloth_type)

        result_pil = run_inference(person_pil, garment_pil, mask_pil)

        job_id = str(uuid.uuid4())[:8]
        result_url = upload_result(result_pil, f"catvton-{job_id}")

        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "result_url": result_url,
            "latency_ms": latency_ms,
            "status": "completed",
        }

    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "error": str(e),
            "latency_ms": latency_ms,
            "status": "failed",
        }


# ─── Warmup on cold start ─────────────────────────────────────

def warmup():
    """Run a quick dummy inference to warm up the GPU."""
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
        run_inference(dummy_person, dummy_garment, dummy_mask)
        print("[CatVTON] Warmup complete")
    except Exception as e:
        print(f"[CatVTON] Warmup failed: {e}")


# ─── Startup ───────────────────────────────────────────────────

if __name__ == "__main__":
    print("[CatVTON] Loading model...")
    load_model()
    print("[CatVTON] Warming up GPU...")
    warmup()
    print("[CatVTON] Starting RunPod worker...")

    import runpod
    runpod.serverless.start({"handler": handler})
