"""
Kanchuki Photo-Cleanup Service
================================
FastAPI service wrapping scripts/batch-clean-photos.py (rembg background
removal + SAM2 hanger/mannequin removal + LaMa ghost-mannequin fill + tight
crop + composite). Deployed as a sidecar on the same Hetzner CX43 box as
Fashion V-Tone so the heavy Python stack (torch + SAM2 + onnxruntime peaks
~2.2 GB RSS — see scripts/demo/2026-08-08-sam2/memtest.py) never shares the
2 GB Railway API container.

Security model — deliberately minimal:
  * The service NEVER fetches URLs. The API downloads the photo + background
    through its own ssrfSafeFetch/readCappedBuffer guards and POSTs the
    bytes here. Zero SSRF surface on the box, zero egress.
  * Auth is a shared secret: every /clean request must send
    `X-Cleanup-Key: <CLEANUP_SHARED_SECRET>` (same pattern as V-Tone's
    VTONE_SHARED_SECRET — no static Railway IP to firewall-allowlist).
  * One pipeline runs at a time (threading.Lock) — each run spawns a fresh
    python subprocess that transiently peaks ~2.2 GB; serializing keeps the
    worst case bounded and matches the API's serializePhotoCleanup.

Usage:
    pip install -r requirements.txt
    python app.py                           # port 8001 (V-Tone owns 8000)
    curl -X POST http://localhost:8001/clean \
      -H "X-Cleanup-Key: $CLEANUP_SHARED_SECRET" \
      -F photo=@product.jpg -F remove_hardware=true

API:
    POST /clean  (multipart/form-data)
        photo:                    file      (required, JPEG)
        background:               file      (optional — --bg-image backdrop)
        remove_hardware:          "true"|"false"   (SAM2 auto removal)
        tight_crop:               "true"|"false"
        crop:                     "x1,y1,x2,y2"    (optional pixel rect)
        prompt_points:            "x,y;x,y"        (optional normalized 0..1 taps)
        prompt_excludes:          "x,y;x,y"        (optional normalized 0..1 garment protect)
        blur:                     int              (optional — portrait mode)
        ghost_mannequin:          "true"|"false"
        shine:                    "true"|"false"
        -> 200 { "output": "<script stdout>", "image_b64": "<base64 jpeg>" }
        -> 401 { "detail": "..." }  (bad/missing X-Cleanup-Key)
        -> 4xx/5xx { "detail": "..." }
    GET /health -> { "status": "ok", "pipeline_ready": true, "gpu_available": bool }
"""

import base64
import io
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SHARED_SECRET = os.environ.get("CLEANUP_SHARED_SECRET", "")
# Unset = no auth (local dev only). Set on the public Hetzner box.
if not SHARED_SECRET:
    logger.warning("CLEANUP_SHARED_SECRET is empty — /clean is UNAUTHENTICATED. Set it before exposing this on a public host.")

PORT = int(os.environ.get("PORT", "8001"))
SCRIPT = Path(os.environ.get("CLEANUP_SCRIPT", "/app/scripts/batch-clean-photos.py"))
RUN_TIMEOUT = int(os.environ.get("CLEANUP_RUN_TIMEOUT", "600"))  # seconds; SAM2+LaMa cold run can exceed the API's 240s

# Serialize pipeline runs: each one spawns a python child that transiently
# peaks ~2.2 GB (rembg + torch/SAM2 + LaMa loaded together). One at a time
# on the 16 GB box keeps the worst case bounded and predictable.
_clean_lock = threading.Lock()

app = FastAPI(title="Kanchuki Photo-Cleanup Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    pipeline_ready: bool
    gpu_available: bool


def _to_bool(v: str | None) -> bool:
    return (v or "").strip().lower() in {"1", "true", "yes", "on"}


def build_args(opts: dict) -> list[str]:
    """Map the multipart form options onto batch-clean-photos.py CLI args.

    Mirrors the TS buildCleanupScriptArgs in
    apps/api/src/lib/photo-cleanup-runner.ts — keep the two in sync.
    Pure — unit-tested in services/photo-cleanup/test_app.py.
    """
    args: list[str] = []
    blur = opts.get("blur")
    ghost_mannequin = _to_bool(opts.get("ghost_mannequin"))
    # Blur (portrait) mode wins over composite unless ghost-mannequin forces
    # composite — same branching as the script's main().
    if blur is not None and not ghost_mannequin:
        args += ["--blur", str(blur)]
        if _to_bool(opts.get("shine")):
            args.append("--shine")
        crop = opts.get("crop")
        if crop:
            args += ["--crop", crop]
        return args

    if opts.get("bg_image") is not None:
        args += ["--bg-image", str(opts["bg_image"])]
    if _to_bool(opts.get("shine")):
        args.append("--shine")
    if ghost_mannequin:
        args.append("--ghost-mannequin")
    if _to_bool(opts.get("remove_hardware")):
        args.append("--remove-hardware")
    if opts.get("prompt_points"):
        args += ["--prompt-points", opts["prompt_points"]]
    if opts.get("prompt_excludes"):
        args += ["--prompt-excludes", opts["prompt_excludes"]]
    if _to_bool(opts.get("tight_crop")):
        args.append("--tight-crop")
    crop = opts.get("crop")
    if crop:
        args += ["--crop", crop]
    return args


def _require_key(x_cleanup_key: str | None) -> None:
    if SHARED_SECRET and x_cleanup_key != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Missing or invalid X-Cleanup-Key header")


@app.get("/health", response_model=HealthResponse)
async def health():
    import torch

    return HealthResponse(
        status="ok",
        pipeline_ready=True,
        gpu_available=torch.cuda.is_available(),
    )


@app.post("/clean")
def clean(
    photo: UploadFile = File(...),
    background: UploadFile | None = File(default=None),
    remove_hardware: str | None = Form(default=None),
    tight_crop: str | None = Form(default=None),
    crop: str | None = Form(default=None),
    prompt_points: str | None = Form(default=None),
    prompt_excludes: str | None = Form(default=None),
    blur: str | None = Form(default=None),
    ghost_mannequin: str | None = Form(default=None),
    shine: str | None = Form(default=None),
    x_cleanup_key: str | None = Header(default=None),
):
    # Deliberately a SYNC endpoint (not async): the pipeline runs a blocking
    # subprocess for up to RUN_TIMEOUT (600s). FastAPI executes sync endpoints
    # in a threadpool, keeping the uvicorn event loop free so /health (and the
    # Docker healthcheck) stays responsive during long runs.
    _require_key(x_cleanup_key)

    photo_bytes = photo.file.read()
    if not photo_bytes:
        raise HTTPException(status_code=400, detail="photo is empty")

    bg_bytes: bytes | None = None
    if background is not None:
        bg_bytes = background.file.read()
        if not bg_bytes:
            raise HTTPException(status_code=400, detail="background is empty")

    try:
        blur_int = int(blur) if blur is not None else None
    except ValueError:
        raise HTTPException(status_code=400, detail=f"blur must be an integer, got {blur!r}")

    opts: dict = {
        "remove_hardware": remove_hardware,
        "tight_crop": tight_crop,
        "crop": crop,
        "prompt_points": prompt_points,
        "prompt_excludes": prompt_excludes,
        "blur": blur_int,
        "ghost_mannequin": ghost_mannequin,
        "shine": shine,
    }

    start = time.time()
    with tempfile.TemporaryDirectory(prefix="cleanup-") as tmp:
        work = Path(tmp)
        input_dir = work / "input"
        output_dir = work / "out"
        input_dir.mkdir()
        output_dir.mkdir()
        (input_dir / "photo.jpg").write_bytes(photo_bytes)
        if bg_bytes is not None:
            bg_path = work / "background.jpg"
            bg_path.write_bytes(bg_bytes)
            opts["bg_image"] = str(bg_path)
        else:
            opts["bg_image"] = None

        args = build_args(opts)
        command = [sys.executable, str(SCRIPT), str(input_dir), str(output_dir), *args]

        try:
            with _clean_lock:
                logger.info("running pipeline: %s", " ".join(str(a) for a in args))
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=RUN_TIMEOUT,
                )
        except subprocess.TimeoutExpired:
            logger.error("pipeline timed out after %ss", RUN_TIMEOUT)
            raise HTTPException(status_code=504, detail=f"pipeline timed out after {RUN_TIMEOUT}s")
        except Exception as e:  # noqa: BLE001
            logger.error("pipeline spawn failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"pipeline failed to start: {e}")

        output = "\n".join([(result.stdout or "").strip(), (result.stderr or "").strip()]).strip()
        if result.returncode != 0:
            logger.error("pipeline failed rc=%s: %s", result.returncode, output[-1500:])
            raise HTTPException(status_code=500, detail=output[-1500:] or "pipeline failed")

        out_file = output_dir / "photo.jpg"
        if not out_file.exists():
            raise HTTPException(status_code=500, detail="pipeline finished but produced no output file")
        jpeg = out_file.read_bytes()

    latency = int((time.time() - start) * 1000)
    logger.info("clean done in %sms (%s bytes)", latency, len(jpeg))
    return {
        "output": output,
        "image_b64": base64.b64encode(jpeg).decode(),
        "latency_ms": latency,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
