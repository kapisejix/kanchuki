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

# Copy requirements first for Docker layer caching
COPY services/fashion-vtone/requirements.txt /app/requirements.txt

# Install Python deps including fashn-vton from GitHub
# Then swap onnxruntime-gpu → onnxruntime for CPU-only Railway tier
# --force-reinstall --no-deps replaces onnxruntime files in-place without
# leaving fashn-vton's dependency metadata in a broken state
RUN pip install --no-cache-dir -r /app/requirements.txt && \
    pip install --no-cache-dir --force-reinstall --no-deps onnxruntime && \
    rm -rf /root/.cache/pip

# Copy service app
COPY services/fashion-vtone/app.py /app/app.py

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=120s --retries=6 --start-period=300s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health').read()"

CMD python app.py
