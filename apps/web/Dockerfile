# Next.js standalone server. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t gbam-web .

FROM node:22-alpine AS base
RUN npm install -g pnpm@10.32.1 turbo@2.11.6
WORKDIR /app

FROM base AS prepare
COPY . .
RUN turbo prune @gbam/web --docker

FROM base AS builder
COPY --from=prepare /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
# The site's public address is baked into the build (it's used in the browser too). Railway
# passes service variables to a Docker build only when they are declared with ARG.
# Unset → https://gbam.app.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# Browser error alerts: copied into the browser code at build time (see instrumentation-client.ts).
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN turbo run build --filter=@gbam/web...

# output: "standalone" traces exactly the files `next start` needs into .next/standalone.
FROM node:22-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup --system --gid 1001 gbam && adduser --system --uid 1001 --ingroup gbam gbam
COPY --from=builder --chown=gbam:gbam /app/apps/web/.next/standalone ./
COPY --from=builder --chown=gbam:gbam /app/apps/web/.next/static ./apps/web/.next/static
# Files in public/ (e.g. /images/...) aren't traced into standalone: copy them in next to
# server.js, or they 404 in production.
COPY --from=builder --chown=gbam:gbam /app/apps/web/public ./apps/web/public
USER gbam
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
