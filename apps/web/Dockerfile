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

# Retry once on failure: onnxruntime-node's postinstall (pulled in via
# @imgly/background-removal-node) downloads a ~330MB binary from GitHub
# releases, and Railway build egress to github.com intermittently times out
# (2026-08-12). pnpm's content-addressable store makes a re-run cheap. The
# binary itself is required at runtime, so we retry instead of skipping it.
RUN pnpm install --frozen-lockfile || pnpm install --frozen-lockfile

# Railway only passes dashboard variables into `docker build` for ARGs
# declared here — without this, every NEXT_PUBLIC_* var silently falls back
# to its hardcoded default at build time regardless of the dashboard value,
# since Next.js inlines these into the client bundle during `next build`.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_R2_PUBLIC_URL
# MSG91 OTP widget (real OTP flow) — client-visible by MSG91's design (they
# only authorize this widget). Unset → billing login falls back to the API OTP.
ARG NEXT_PUBLIC_MSG91_WIDGET_ID
ARG NEXT_PUBLIC_MSG91_TOKEN_AUTH
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_R2_PUBLIC_URL=$NEXT_PUBLIC_R2_PUBLIC_URL
ENV NEXT_PUBLIC_MSG91_WIDGET_ID=$NEXT_PUBLIC_MSG91_WIDGET_ID
ENV NEXT_PUBLIC_MSG91_TOKEN_AUTH=$NEXT_PUBLIC_MSG91_TOKEN_AUTH

RUN pnpm exec turbo build --filter=@kanchuki/web

EXPOSE 3000
CMD ["pnpm", "--filter", "@kanchuki/web", "start"]
