FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first — Docker caches this layer separately so
# a code-only change (app.js) doesn't trigger a full npm ci on the next build.
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy application code after dependencies to maximize cache reuse
COPY app.js .

EXPOSE 3000

CMD ["node", "app.js"]
