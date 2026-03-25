### Multi-stage Dockerfile that builds both workspaces and runs them with PM2
# Produces a single container that runs the NestJS API and Next.js app in production

FROM node:20-bullseye-slim AS builder
WORKDIR /app

# npm-Versionshinweise und Deprecation-Notices unterdrücken
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
# Prisma Update-Hinweis unterdrücken
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
# Next.js Telemetrie-Hinweis unterdrücken
ENV NEXT_TELEMETRY_DISABLED=1

# Copy package manifests first for better caching
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY api/package.json api/
COPY api/tsconfig.json api/
COPY web/package.json web/
COPY web/tsconfig.json web/
COPY prisma prisma
COPY scripts scripts

# Build-Args für Next.js: NEXT_PUBLIC_* werden beim Build ins Frontend eingebaut.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy the rest of the source
COPY . .

# Install dependencies (including dev deps needed for building)
RUN npm install --no-audit --no-fund --no-warnings

# Ensure Prisma client is generated for all workspaces before building
RUN npx prisma generate

# Build both workspaces (Next.js nutzt die ENV oben für das Frontend)
RUN npm run build --workspaces

FROM node:20-bullseye-slim AS runner
WORKDIR /app

# npm-Hinweise unterdrücken
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

# Set production env AFTER npm install so devDeps are available during seed
ENV NODE_ENV=production

# Copy built app and ALL node_modules from builder (includes devDeps needed for seeding)
COPY --from=builder /app /app

# Install PM2 to run multiple processes in one container
RUN npm install -g pm2@5 --no-audit --no-fund --no-warnings

# Make startup script executable
RUN chmod +x /app/scripts/startup.sh

# Install postgresql client for database checks
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Expose the ports used by web and api
EXPOSE 3000 3001

# Use the startup script
CMD ["/app/scripts/startup.sh"]
