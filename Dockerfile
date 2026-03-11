# ZenAI Backend - Railway Deployment (pnpm monorepo)
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
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
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

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

# Start with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
