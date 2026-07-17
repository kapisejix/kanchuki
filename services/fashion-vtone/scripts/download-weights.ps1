# Fashion V-Tone v1.5 — Weight Downloader (PowerShell)
# Pre-downloads model weights so the server doesn't fetch ~2.3 GB on cold start.
#
# Usage:
#   .\scripts\download-weights.ps1                         # default: .\weights
#   .\scripts\download-weights.ps1 -WeightsDir D:\weights
#   $env:VTONE_WEIGHTS_DIR="D:\weights"; .\scripts\download-weights.ps1
#
# Requires: huggingface-hub (pip install huggingface-hub)

param(
    [string]$WeightsDir = $(if ($env:VTONE_WEIGHTS_DIR) { $env:VTONE_WEIGHTS_DIR } else { ".\weights" })
)

$WeightsDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($WeightsDir)

Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Fashion V-Tone v1.5 — Weight Downloader" -ForegroundColor Cyan
Write-Host "  Target: $WeightsDir" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

New-Item -ItemType Directory -Force -Path "$WeightsDir\dwpose" | Out-Null

# ── Download TryOnModel ──────────────────────────────────
Write-Host "Downloading TryOnModel weights (~1.94 GB)..." -ForegroundColor Yellow
if (-not (Test-Path "$WeightsDir\model.safetensors")) {
    huggingface-cli download `
        fashn-ai/fashn-vton-1.5 `
        model.safetensors `
        --local-dir "$WeightsDir" `
        --local-dir-use-symlinks False `
        --resume-download
    Write-Host "  ✓ model.safetensors downloaded" -ForegroundColor Green
}
else {
    Write-Host "  ✓ model.safetensors already exists (skipping)" -ForegroundColor Green
}
Write-Host ""

# ── Download DWPose ONNX models ──────────────────────────
Write-Host "Downloading DWPose/yolox_l.onnx (~217 MB)..." -ForegroundColor Yellow
if (-not (Test-Path "$WeightsDir\dwpose\yolox_l.onnx")) {
    huggingface-cli download `
        fashn-ai/DWPose `
        yolox_l.onnx `
        --local-dir "$WeightsDir\dwpose" `
        --local-dir-use-symlinks False `
        --resume-download
    Write-Host "  ✓ yolox_l.onnx downloaded" -ForegroundColor Green
}
else {
    Write-Host "  ✓ yolox_l.onnx already exists (skipping)" -ForegroundColor Green
}

Write-Host "Downloading DWPose/dw-ll_ucoco_384.onnx (~134 MB)..." -ForegroundColor Yellow
if (-not (Test-Path "$WeightsDir\dwpose\dw-ll_ucoco_384.onnx")) {
    huggingface-cli download `
        fashn-ai/DWPose `
        dw-ll_ucoco_384.onnx `
        --local-dir "$WeightsDir\dwpose" `
        --local-dir-use-symlinks False `
        --resume-download
    Write-Host "  ✓ dw-ll_ucoco_384.onnx downloaded" -ForegroundColor Green
}
else {
    Write-Host "  ✓ dw-ll_ucoco_384.onnx already exists (skipping)" -ForegroundColor Green
}
Write-Host ""

# ── Verify ────────────────────────────────────────────────
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Verifying downloaded weights..." -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$errors = 0
$totalSize = 0

function Check-File($path, $label) {
    if (Test-Path $path) {
        $size = (Get-Item $path).Length / 1MB
        $totalSize += (Get-Item $path).Length
        Write-Host "  ✓ $label ($([math]::Round($size, 0)) MB)" -ForegroundColor Green
    }
    else {
        Write-Host "  ✗ MISSING: $label ($path)" -ForegroundColor Red
        $script:errors++
    }
}

Check-File "$WeightsDir\model.safetensors" "model.safetensors"
Check-File "$WeightsDir\dwpose\yolox_l.onnx" "dwpose/yolox_l.onnx"
Check-File "$WeightsDir\dwpose\dw-ll_ucoco_384.onnx" "dwpose/dw-ll_ucoco_384.onnx"

$totalSizeMB = [math]::Round($totalSize / 1MB, 0)

Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host "  ✓ Download complete! ($totalSizeMB MB)" -ForegroundColor Green
    Write-Host "  Weights directory: $WeightsDir" -ForegroundColor Green
}
else {
    Write-Host "  ✗ $errors file(s) missing — check errors above" -ForegroundColor Red
    exit 1
}
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
