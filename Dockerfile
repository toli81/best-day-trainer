# Single-stage build to stay within Railway memory limits
FROM node:20-slim

# Install ffmpeg and build tools for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

# Create persistent volume directory and symlink for SQLite DB
# Videos and clips now stored in Cloudflare R2 (not local filesystem)
RUN mkdir -p persist/data \
 && ln -sf /app/persist/data /app/data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# At runtime, ensure persist subdirectories exist
# (volume mount replaces /app/persist, so build-time dirs are lost)
CMD mkdir -p /app/persist/data && npm run start
