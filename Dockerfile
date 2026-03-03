# ═══════════════════════════════════════
# Bookmosphere — Production Dockerfile
# Supports: Next.js app + BullMQ conversion worker
# ═══════════════════════════════════════

# ─── Stage 1: Node Dependencies ───
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: Build Next.js ───
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Stage 3: Next.js Production Server ───
FROM node:20-alpine AS app
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

# ─── Stage 4: Conversion Worker ───
# Uses full Debian image for Python + Poppler + pdf-craft
FROM node:20-bookworm AS worker
WORKDIR /app

# Install Python, Poppler (required by pdf-craft), and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Create Python venv and install pdf-craft dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir \
    pdf-craft \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Copy Node.js deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Copy pdf-craft-main (local fork or customizations)
COPY pdf-craft-main ./pdf-craft-main

ENV NODE_ENV=production

CMD ["npx", "tsx", "scripts/start-worker.ts"]
