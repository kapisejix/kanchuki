# ──────────────────────────────────────────────────────────────
# Fashion V-Tone v1.5 Virtual Try-On Service
# Build:  docker build -t kanchuki-vtone -f services/fashion-vtone/Dockerfile .
# Run:    docker run -p 8000:8000 kanchuki-vtone
#
# Deployed on Railway via services/fashion-vtone/railway.json
# Railway builder: DOCKERFILE, root dir: . (repo root)
# ──────────────────────────────────────────────────────────────

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Install system deps (OpenCV needs libgl, git for pip git+ deps)
# libgl1-mesa-glx replaced by libgl1 in Debian Bookworm+
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

ENV VTONE_WEIGHTS_DIR=/app/weights

# Copy requirements first for Docker layer caching
COPY services/fashion-vtone/requirements.txt /app/requirements.txt

# Install Python deps including fashn-vton from GitHub
# fashn-vton pulls a GPU torch wheel + onnxruntime-gpu, both of which drag
# in several GB of nvidia-* CUDA wheels. Railway tier is CPU-only, so:
# install CPU torch/torchvision FIRST (before requirements.txt) so pip sees
# the version requirement already satisfied and skips the GPU wheel + its
# nvidia-* deps entirely, instead of downloading ~1.5GB just to replace it.
# onnxruntime-gpu is still swapped after, since it's a hard pin.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r /app/requirements.txt && \
    pip uninstall -y onnxruntime-gpu $(pip list --format=freeze | grep -oE '^nvidia-[a-z0-9-]+') && \
    pip install --no-cache-dir onnxruntime && \
    rm -rf /root/.cache/pip

# Pre-download model weights so cold start doesn't fetch ~2.3 GB
# Uses the Python API (hf_hub_download) which is more reliable than
# huggingface-cli (deprecated in newer huggingface_hub versions).
# This layer is cached unless scripts/ change.
COPY services/fashion-vtone/scripts/ /app/scripts/
RUN python /app/scripts/download-weights.py --weights-dir /app/weights
# Note: FashnHumanParser weights land in the default HF hub cache (not
# /app/weights), unlike TryOnModel/DWPose which use local_dir=. Do not
# rm -rf that cache here or the parser re-fetches ~244MB on every cold start.

# Copy service app
COPY services/fashion-vtone/app.py /app/app.py

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=120s --retries=6 --start-period=300s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health').read()"

CMD python app.py
