# One image, three roles (choose with the command):
#   node dist/main.js                          HTTP API
#   node dist/worker.js                        BullMQ worker
#   node node_modules/@gbam/db/dist/migrate.js one-off migrations (run before the others)
#
# Build from the repo root:  docker build -f apps/api/Dockerfile -t gbam-api .

FROM node:22-alpine AS base
RUN npm install -g pnpm@10.32.1 turbo@2.11.6
WORKDIR /app

# --- 1. Prune the monorepo down to @gbam/api and the packages it depends on.
FROM base AS prepare
COPY . .
RUN turbo prune @gbam/api --docker

# --- 2. Install (cached until a dependency changes), then build.
FROM base AS builder
COPY --from=prepare /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
RUN turbo run build --filter=@gbam/api...
# Self-contained folder with only production deps (workspace packages copied as built dist).
RUN pnpm deploy --filter=@gbam/api --prod --legacy /prod/api

# --- 3. Small runtime image, non-root.
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 gbam && adduser --system --uid 1001 --ingroup gbam gbam
COPY --from=builder --chown=gbam:gbam /prod/api .
USER gbam
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/main.js"]
