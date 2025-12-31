FROM node:18-alpine

WORKDIR /app

# Copy shared modules first (for caching)
COPY packages/shared/package.json ./packages/shared/
COPY services/strategy/package.json ./services/strategy/

# Install dependencies
WORKDIR /app/packages/shared
RUN npm install
WORKDIR /app/services/strategy
RUN npm install --omit=dev && npm install -g typescript && npm install --save-dev @types/node

# Copy source code
COPY packages/shared /app/packages/shared
COPY services/strategy /app/services/strategy

# Build
WORKDIR /app/services/strategy
RUN npm run build

EXPOSE 3005

# Output will be in dist/services/strategy/src/index.js due to rootDir adjustment
CMD ["node", "dist/services/strategy/src/index.js"]
