# ── Build stage: compile TypeScript to JavaScript ────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (including devDependencies for the TypeScript compiler).
# Copy manifests first so Docker caches this layer and only reruns it when
# dependencies change, not when app.ts changes.
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci

COPY app.ts .
RUN npm run build

# ── Runtime stage: lean image with only production deps ───────────────────────
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy only the compiled output from the build stage — TypeScript tooling stays behind
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/app.js"]
