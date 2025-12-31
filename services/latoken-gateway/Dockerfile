FROM node:18-alpine

WORKDIR /app

# Copy shared modules first (for caching)
COPY packages/shared/package.json ./packages/shared/
COPY services/latoken-gateway/package.json ./services/latoken-gateway/

# Install dependencies
WORKDIR /app/packages/shared
RUN npm install
WORKDIR /app/services/latoken-gateway
RUN npm install --omit=dev && npm install -g typescript && npm install --save-dev @types/node

# Copy source code
COPY packages/shared /app/packages/shared
COPY services/latoken-gateway /app/services/latoken-gateway

# Build
WORKDIR /app/services/latoken-gateway
RUN npm run build

EXPOSE 3003 8081

# Output will be in dist/services/latoken-gateway/src/index.js due to rootDir adjustment
CMD ["node", "dist/services/latoken-gateway/src/index.js"]
