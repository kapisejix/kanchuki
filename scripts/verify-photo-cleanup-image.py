"""Verify the photo-cleanup runtime inside the kanchuki-py-test Docker image."""
import os

import onnxruntime
import PIL
import rembg

print("onnxruntime:", onnxruntime.__version__)
print("rembg:", rembg.__version__)
print("pillow:", PIL.__version__)
print("u2net.onnx bytes:", os.path.getsize("/root/.u2net/u2net.onnx"))
