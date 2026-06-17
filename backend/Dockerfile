# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache curl tzdata && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001

WORKDIR /app

# Copy deps from base
COPY --from=base /app/node_modules ./node_modules

# Copy source
COPY --chown=nodeapp:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown nodeapp:nodejs logs

USER nodeapp

EXPOSE 3001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "src/server.js"]
