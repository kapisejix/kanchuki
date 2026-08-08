# ──────────────────────────────────────────────────────────────
# Kanchuki Photo-Cleanup Sidecar
# Build:  docker build -t kanchuki-photo-cleanup -f services/photo-cleanup/Dockerfile .
# Run:    docker run -p 8001:8001 kanchuki-photo-cleanup
# Deploy: docker compose -f services/photo-cleanup/docker-compose.yml up -d --build
# ──────────────────────────────────────────────────────────────
# Purpose: host the heavy Python cleanup stack (rembg + torch + SAM2 + LaMa,
# peak ~2.2 GB RSS) OUT of the 2 GB Railway API container. The API POSTs
# photo bytes + options here and gets back the cleaned JPEG — no outbound
# fetches from this service (SSRF stays in the API), auth via shared secret.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=8001

WORKDIR /app

# git for the sam2 pip install (GitHub source, no stable wheel); libgl for
# OpenCV (a simple-lama-inpainting transitive dep, same as V-Tone).
RUN apt-get update && apt-get install -y \
    git \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install CPU torch/torchvision FIRST so requirements.txt's
# simple-lama-inpainting sees the requirement satisfied and pip skips the
# GPU wheel + nvidia-* deps (same trick as services/fashion-vtone/Dockerfile).
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY services/photo-cleanup/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# SAM2 (Meta Segment Anything 2, Apache 2.0) — hanger/mannequin auto removal
# + interactive tap-to-fix point prompts. From GitHub: the repo ships the
# sam2 package + configs (sam2/configs/sam2.1/...) that batch-clean-photos.py
# resolves at runtime.
RUN pip install --no-cache-dir git+https://github.com/facebookresearch/sam2.git

# Bake the model checkpoints at build time — the pipeline otherwise
# downloads them on first request (fails on slow egress / rate limits).
#   rembg isnet-general-use (~170 MB, the default session) -> ~/.u2net/
#   LaMa big-lama.pt (~196 MB, ghost-mannequin + hardware fill) -> torch hub cache
#   SAM2 sam2.1_hiera_tiny.pt (~156 MB, hardware removal) -> /opt/sam2/
RUN mkdir -p /root/.u2net /root/.cache/torch/hub/checkpoints /opt/sam2 && \
    python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx', '/root/.u2net/isnet-general-use.onnx')" && \
    python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt', '/root/.cache/torch/hub/checkpoints/big-lama.pt')" && \
    python -c "import urllib.request; urllib.request.urlretrieve('https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt', '/opt/sam2/sam2.1_hiera_tiny.pt')"

# Tell the cleanup script where SAM2 lives (configs resolve from the
# installed sam2 package automatically; only the checkpoint path is env-set).
ENV SAM2_CHECKPOINT=/opt/sam2/sam2.1_hiera_tiny.pt

# The cleanup script itself (from the repo root — compose build context).
COPY scripts/batch-clean-photos.py /app/scripts/batch-clean-photos.py
COPY services/photo-cleanup/app.py /app/app.py

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=30s --retries=6 --start-period=120s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health').read()"

CMD python app.py
