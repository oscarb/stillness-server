FROM node:24-bookworm-slim

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --only=production

# Install Playwright browsers and dependencies and instantly clean caches to reduce layer size
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /ms-playwright/firefox* /ms-playwright/webkit*

# Copy source code
COPY src ./src

EXPOSE 3000

ENV NODE_ENV=production
CMD ["npm", "start"]
