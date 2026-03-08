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

# Create persistent volume directory and symlinks
RUN mkdir -p persist/data persist/uploads persist/clips \
 && ln -sf /app/persist/data /app/data \
 && ln -sf /app/persist/uploads /app/uploads \
 && ln -sf /app/persist/clips /app/public/clips

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
