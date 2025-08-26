#!/bin/bash

# Script to stop Valkey test servers

set -e

echo "🛑 Stopping Valkey test servers..."

# Stop and remove containers
sudo docker-compose -f docker-compose.test.yml down -v

# Clean up environment file
if [ -f .env.test ]; then
    rm .env.test
    echo "🗑️  Cleaned up .env.test"
fi

echo "✅ All Valkey test servers stopped and cleaned up!"