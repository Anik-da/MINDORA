# MINDORA Web - Cloud Run Production Containerfile
# Multi-stage lightweight build: compiles TypeScript and packages web runtime

FROM node:22-slim AS builder
WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install all dependencies for build
RUN npm ci

# Copy source trees and scripts needed for compilation
COPY shared/ ./shared/
COPY server/ ./server/
COPY web/ ./web/
COPY electron/ ./electron/
COPY scripts/ ./scripts/
COPY fixtures/ ./fixtures/

# Build TypeScript and copy static web assets
RUN npm run build:web

# ========================================================
# Production Runtime Stage
# ========================================================
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies only (tesseract.js)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript output and static web assets
COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/dist/shared ./dist/shared
COPY --from=builder /app/dist/web ./dist/web
COPY fixtures/ ./fixtures/

# Expose standard Cloud Run port
EXPOSE 8080

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the MINDORA Web HTTP server
CMD ["node", "dist/server/server.js"]
