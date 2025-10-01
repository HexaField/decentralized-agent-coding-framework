# syntax=docker/dockerfile:1.7-labs
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json tsconfig.json ./
RUN npm ci --omit=dev || npm i --omit=dev

FROM base AS runner
USER node
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
RUN npm i --no-audit --no-fund \
 && npm run build
ENV API_PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
