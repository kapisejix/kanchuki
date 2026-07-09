# ──────────────────────────────────────────────────────────────
# CatVTON Virtual Try-On Service
# Build:  docker build -t kanchuki-tryon -f services/tryon/Dockerfile .
# Run:    docker run --gpus all -p 8000:8000 kanchuki-tryon
# ──────────────────────────────────────────────────────────────

FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Install system deps
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3-pip \
    wget \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.11 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

WORKDIR /app

# Download CatVTON source pinned at specific commit for reproducible builds
# Repo: Zheng-Chong/CatVTON (case-sensitive!)
# Commit: 999bdbe81e6008a3f5749af7c1e0b0fa3d21b48e — 2025-02-02: "chore: Update preprocess_agnostic_mask.py"
# To update: get latest SHA from https://github.com/Zheng-Chong/CatVTON/commits/main/
ADD https://github.com/Zheng-Chong/CatVTON/archive/999bdbe81e6008a3f5749af7c1e0b0fa3d21b48e.tar.gz /tmp/catvton.tar.gz
RUN mkdir -p /app/CatVTON && tar xzf /tmp/catvton.tar.gz \
    --strip-components=1 -C /app/CatVTON && rm /tmp/catvton.tar.gz

# Install CatVTON deps
RUN pip install --no-cache-dir -r /app/CatVTON/requirements.txt

# Install our service deps
COPY services/tryon/requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt

# CUDA PyTorch
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124

# Copy our service app (sits inside CatVTON dir to access model.pipeline)
COPY services/tryon/app.py /app/CatVTON/server.py

WORKDIR /app/CatVTON

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=60s --timeout=30s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:${PORT}/health').raise_for_status()"

# Run
CMD ["sh", "-c", "python server.py"]
