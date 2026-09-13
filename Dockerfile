# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: install all dependencies (dev deps are needed for tsc) and
# compile the TypeScript sources to dist/. Build tools are installed so that
# native modules like bcrypt can compile when no prebuilt binary exists.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# Keep only production dependencies in the image. Native modules already
# built in this stage are reused by the runner against the same Debian base.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Runtime stage: only production dependencies are kept. The compiled native
# modules from the builder stage are reused against the same Debian base, so
# nothing is recompiled here.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 5000

# Uses the built-in JS fetch - no curl needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "const p=process.env.PORT||5000;fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]