FROM node:20-alpine
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npx tsc
EXPOSE 3000
CMD ["node", "dist/app.js"]
