# ---- Base ----
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create data and upload directories
RUN mkdir -p data uploads public/clips

# Build Next.js in standalone mode
RUN npm run build

# ---- Production ----
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create single persistent directory (Railway volume mounts here)
# Subdirectories: persist/data, persist/uploads, persist/clips
RUN mkdir -p persist/data persist/uploads persist/clips

# Symlink app paths to the persistent volume
RUN ln -s /app/persist/data /app/data \
 && ln -s /app/persist/uploads /app/uploads \
 && ln -s /app/persist/clips /app/public/clips

# Copy drizzle migrations if they exist
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

CMD ["node", "server.js"]
