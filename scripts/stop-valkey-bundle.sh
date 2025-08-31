#!/bin/bash

# Script to stop Valkey Bundle containers

set -e

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log "🛑 Stopping Valkey Bundle containers..."

if docker-compose -f docker-compose.valkey-bundle.yml down --remove-orphans; then
    log_success "✅ Valkey Bundle containers stopped successfully"
else
    log_success "✅ No Valkey Bundle containers were running"
fi

# Clean up any orphaned volumes if needed
docker volume ls -q | grep "valkey.*bundle" | xargs -r docker volume rm 2>/dev/null || true

log_success "🧹 Cleanup complete"