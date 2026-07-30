# Kanchuki Web — pnpm/turbo monorepo, explicit Docker build.
#
# Nixpacks auto-detect was silently failing to put pnpm on PATH before the
# build step (same root cause fixed for the api service in apps/api/Dockerfile
# — see that file's header comment for the full story). This Dockerfile
# mirrors the CI-proven install sequence (pnpm/action-setup == corepack) and
# uses `turbo build` so @kanchuki/shared compiles before @kanchuki/web, per
# turbo.json's "build": { "dependsOn": ["^build"] }.
#
# Standalone Next.js output is intentionally NOT used here — see the
# "Standalone output disabled" comment in next.config.mjs (Next.js 14.2.x +
# pnpm monorepo file-tracing bug). `next start` needs the full node_modules
# tree, which this image already has from `pnpm install`.
#
# Build:  docker build -f apps/web/Dockerfile .   (repo root context)
# Deployed via apps/web/railway.json, Railway builder: DOCKERFILE, root dir: .

FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@kanchuki/web

EXPOSE 3000
CMD ["pnpm", "--filter", "@kanchuki/web", "start"]
