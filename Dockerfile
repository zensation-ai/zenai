# ZenAI Backend - Railway Deployment (pnpm monorepo)
# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Install pnpm via corepack (Node.js built-in package manager manager)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace config and lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./

# Copy package.json files for all workspace packages
COPY backend/package.json backend/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy shared package source and build it first
COPY packages/shared/ packages/shared/
RUN pnpm --filter @zenai/shared run build

# Copy backend source and build
COPY backend/ backend/
RUN pnpm --filter zenai-backend run build

# Production stage
FROM node:25-alpine AS production

WORKDIR /app

# Upgrade all system packages first to pick up security patches (e.g. musl CVEs)
RUN apk upgrade --no-cache

# Install dumb-init for proper signal handling + curl for health checks
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY backend/package.json backend/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built shared package
COPY --from=builder /app/packages/shared/dist packages/shared/dist

# Copy built backend
COPY --from=builder /app/backend/dist backend/dist

# Copy SQL migrations (needed for db:init)
COPY --from=builder /app/backend/sql backend/sql
COPY --from=builder /app/backend/src/migrations backend/src/migrations

# Create uploads directory
RUN mkdir -p backend/uploads && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

WORKDIR /app/backend

# Expose port
EXPOSE 3000

# Container health check (used by Docker/Kubernetes/ECS/Railway)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
