# Kanchuki API — pnpm/turbo monorepo, explicit Docker build.
#
# Nixpacks auto-detect was silently failing to put pnpm on PATH before the
# build step (multiple failed attempts fixing nixpacks.toml — see git log
# on that file, now removed). This Dockerfile mirrors the CI-proven install
# sequence (pnpm/action-setup equivalent: corepack) and uses `turbo build`
# (not the bare `pnpm build --filter`) so workspace deps — @kanchuki/db,
# @kanchuki/shared, @kanchuki/ai — actually get compiled before @kanchuki/api,
# per turbo.json's "build": { "dependsOn": ["^build"] }.
#
# Build:  docker build -f apps/api/Dockerfile .   (repo root context)
# Deployed via apps/api/railway.json, Railway builder: DOCKERFILE, root dir: .

# node:22 (not 20) — @supabase/supabase-js's realtime-js requires native
# WebSocket support, which Node 20 doesn't have (crashes at startup).
FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ffmpeg/ffprobe for the spin-frame-extraction job
# (apps/api/src/jobs/extract-spin-frames.ts) + python3/pip for the admin
# photo-cleanup test tool (apps/api/src/routes/admin/admin-photo-cleanup.ts
# shells out to scripts/batch-clean-photos.py).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# rembg (bg removal) + pillow (compositing) power the photo-cleanup route.
# rembg[cpu] (not bare rembg) pulls the onnxruntime CPU backend — without it
# rembg raises "No onnxruntime backend found". Bookworm's Python is PEP-668
# externally-managed, so --break-system-packages is required for pip installs.
RUN python3 -m pip install --no-cache-dir --break-system-packages "rembg[cpu]" pillow

# Pre-bake the u2net ONNX model (~170MB) into the image at build time. rembg
# would otherwise download it to ~/.u2net on first use — at request time that
# would burn the route's 60s exec budget on a GitHub download (and fail on a
# slow egress). Baked here, the model loads straight from disk per run.
# HOME=/root in this image, which is where rembg looks for ~/.u2net/u2net.onnx.
RUN mkdir -p /root/.u2net \
    && python3 -c "import urllib.request; urllib.request.urlretrieve('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx', '/root/.u2net/u2net.onnx')"

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@kanchuki/api

EXPOSE 3001
# --max-old-space-size caps V8's heap below the Railway container memory
# limit (2GB after the 2026-08-05 OOM bump) so a real leak throws a
# catchable "JS heap out of memory" crash with a heap summary in the logs,
# instead of the cgroup silently SIGKILLing the process with no trace.
#
# The photo-cleanup Python child (u2net inference peaks ~1GB RSS) is
# serialized by a mutex in the route so at most one cleanup process exists
# at a time — the API's steady-state RSS is far below the heap cap, so one
# transient cleanup fits alongside it in the 2GB container.
CMD ["node", "--max-old-space-size=1536", "apps/api/dist/index.js"]
