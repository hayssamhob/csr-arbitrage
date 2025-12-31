FROM node:18-alpine

WORKDIR /app

# Copy shared modules first (for caching)
COPY packages/shared/package.json ./packages/shared/
COPY services/lbank-gateway/package.json ./services/lbank-gateway/

# Install dependencies (root level would be better with workspaces, but doing isolated for now)
WORKDIR /app/packages/shared
RUN npm install
WORKDIR /app/services/lbank-gateway
RUN npm install --omit=dev && npm install -g typescript && npm install --save-dev @types/node

# Copy source code
COPY packages/shared /app/packages/shared
COPY services/lbank-gateway /app/services/lbank-gateway

# Build
WORKDIR /app/services/lbank-gateway
RUN npm run build

EXPOSE 3001 8080

# Output will be in dist/services/lbank-gateway/src/index.js due to rootDir adjustment
CMD ["node", "dist/services/lbank-gateway/src/index.js"]
