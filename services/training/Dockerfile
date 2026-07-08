# ──────────────────────────────────────────────────────────────
# CatVTON-FLUX Training Environment
# Build:  docker build -t kanchuki-training -f services/training/Dockerfile .
# Run:    docker run --gpus all -v /path/to/dataset:/dataset kanchuki-training
# ──────────────────────────────────────────────────────────────

FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system deps
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3-pip \
    git \
    wget \
    curl \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.11 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

WORKDIR /workspace

# Install PyTorch with CUDA 12.4
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124

# Install training deps
COPY scripts/training/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Dataset Collection deps (for data prep inside container)
COPY scripts/dataset/requirements.txt /tmp/dataset-requirements.txt
RUN pip install --no-cache-dir -r /tmp/dataset-requirements.txt

# Copy training scripts
COPY scripts/training/ /workspace/scripts/training/
COPY scripts/dataset/ /workspace/scripts/dataset/

# Default command: run LoRA training
# Override CMD for different tasks:
#   Dataset collection:  python scripts/dataset/collector.py --since 2026-01-01
#   Dataset preparation: python scripts/dataset/prepare_dataset.py
#   LoRA training:       accelerate launch scripts/training/accelerate_config.yaml \
#                            scripts/training/train_lora.py --dataset-path ...
CMD ["python", "--version"]
