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
# (apps/api/src/jobs/extract-spin-frames.ts)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@kanchuki/api

EXPOSE 3001
# --max-old-space-size caps V8's heap below the Railway container memory
# limit (2GB after the 2026-08-05 OOM bump) so a real leak throws a
# catchable "JS heap out of memory" crash with a heap summary in the logs,
# instead of the cgroup silently SIGKILLing the process with no trace.
CMD ["node", "--max-old-space-size=1536", "apps/api/dist/index.js"]
