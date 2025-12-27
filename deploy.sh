#!/bin/bash

# CSR Arbitrage Platform Deployment Script
# Tested on Ubuntu 20.04+ with Docker installed

set -e

echo "🚀 Deploying CSR Arbitrage Platform..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create deployment directory
DEPLOY_DIR="/opt/csr-arbitrage"
sudo mkdir -p $DEPLOY_DIR
sudo chown $USER:$USER $DEPLOY_DIR

# Copy files to deployment directory
echo "📦 Copying application files..."
cp -r . $DEPLOY_DIR/
cd $DEPLOY_DIR

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build

echo "🔄 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
echo "🏥 Checking service health..."
echo "LBank Gateway:"
curl -s http://localhost:3001/ready | jq . || echo "❌ LBank Gateway not responding"

echo "LATOKEN Gateway:"
curl -s http://localhost:3006/ready | jq . || echo "❌ LATOKEN Gateway not responding"

echo "Strategy Engine:"
curl -s http://localhost:3003/ready | jq . || echo "❌ Strategy Engine not responding"

echo "Backend API:"
curl -s http://localhost:8001/api/dashboard | jq .system_status || echo "❌ Backend API not responding"

echo "✅ Deployment complete!"
echo "🌐 Frontend: http://$(curl -s ifconfig.me):5173"
echo "📊 API: http://$(curl -s ifconfig.me):8001/api/dashboard"
echo ""
echo "🔍 To check logs: docker-compose logs -f [service-name]"
echo "🛑 To stop: docker-compose down"
