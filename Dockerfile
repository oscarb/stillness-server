# Builder stage
FROM node:24-bookworm-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:24-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# Install Playwright browsers and dependencies and instantly clean caches to reduce layer size
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /ms-playwright/firefox* /ms-playwright/webkit*

# Copy compiled source code and public assets
COPY --from=builder /app/dist ./dist
COPY public ./public

EXPOSE 3000

ENV NODE_ENV=production
CMD ["npm", "start"]
