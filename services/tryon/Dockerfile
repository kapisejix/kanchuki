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

# Download CatVTON source (Docker ADD handles redirects; tar extracts manually)
# Note: ADD only auto-extracts .tar.gz from LOCAL sources, not URLs
# Pinned commit: 999bdbe0825f385c7d23dca9636a0fb3d7890f5c
# Model weights are loaded from HuggingFace at runtime
ADD https://github.com/zhengchong/CatVTON/archive/999bdbe0825f385c7d23dca9636a0fb3d7890f5c.tar.gz /tmp/catvton.tar.gz
RUN tar xzf /tmp/catvton.tar.gz -C /app/ && \
    mv /app/CatVTON-999bdbe0825f385c7d23dca9636a0fb3d7890f5c /app/CatVTON && \
    rm /tmp/catvton.tar.gz

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
