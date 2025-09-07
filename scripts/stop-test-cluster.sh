#!/bin/bash

# Simple script to stop the local Valkey cluster

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping Valkey cluster...${NC}"

# Stop the Valkey instances using their PID files
for port in 17000 17001 17002; do
    if [ -f /tmp/valkey-cluster/${port}.pid ]; then
        PID=$(cat /tmp/valkey-cluster/${port}.pid)
        if kill -0 $PID 2>/dev/null; then
            echo -e "${YELLOW}Stopping Valkey on port ${port} (PID: $PID)${NC}"
            kill $PID
        fi
    fi
done

# Clean up any remaining processes
pkill -f "valkey-server.*17000" 2>/dev/null || true
pkill -f "valkey-server.*17001" 2>/dev/null || true
pkill -f "valkey-server.*17002" 2>/dev/null || true

# Clean up directories
echo -e "${YELLOW}Cleaning up cluster data...${NC}"
rm -rf /tmp/valkey-cluster

echo -e "${GREEN}✓ Cluster stopped and cleaned up${NC}"