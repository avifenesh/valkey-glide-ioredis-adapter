#!/bin/bash

# Valkey Server Management - Start/stop different Valkey configurations
# Usage: ./scripts/valkey.sh {start|stop} {standalone|cluster|bundle}

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

show_usage() {
    echo "Usage: $0 {start|stop} {standalone|cluster|bundle}"
    echo ""
    echo "Commands:"
    echo "  start standalone  - Start single Valkey instance on port 6383"
    echo "  start cluster     - Start 3-node cluster on ports 17000-17002"
    echo "  start bundle      - Start Valkey with JSON module on port 6380"
    echo "  stop standalone   - Stop standalone instance"
    echo "  stop cluster      - Stop cluster nodes"
    echo "  stop bundle       - Stop bundle instance"
    echo "  stop all          - Stop all Valkey instances"
}

start_standalone() {
    echo -e "${YELLOW}Starting standalone Valkey on port 6383...${NC}"
    docker run -d \
        --name valkey-standalone \
        -p 6383:6379 \
        valkey/valkey:latest \
        >/dev/null

    # Wait for readiness
    for i in {1..30}; do
        if docker exec valkey-standalone valkey-cli ping 2>/dev/null | grep -q PONG; then
            echo -e "${GREEN}✓ Standalone Valkey ready on port 6383${NC}"
            return
        fi
        sleep 1
    done
    echo -e "${RED}✗ Timeout waiting for standalone Valkey${NC}"
    exit 1
}

start_cluster() {
    echo -e "${YELLOW}Starting Valkey cluster on ports 17000-17002...${NC}"

    # Start cluster nodes
    for port in 17000 17001 17002; do
        docker run -d \
            --name valkey-node-$port \
            --network host \
            valkey/valkey:latest \
            valkey-server \
            --port $port \
            --cluster-enabled yes \
            --cluster-config-file nodes-$port.conf \
            --cluster-node-timeout 5000 \
            --appendonly no \
            --save "" \
            >/dev/null
    done

    # Wait for nodes
    for port in 17000 17001 17002; do
        for i in {1..30}; do
            if nc -z localhost $port 2>/dev/null; then
                break
            fi
            sleep 1
        done
    done

    # Create cluster
    docker exec valkey-node-17000 valkey-cli \
        --cluster create \
        127.0.0.1:17000 127.0.0.1:17001 127.0.0.1:17002 \
        --cluster-replicas 0 \
        --cluster-yes \
        >/dev/null 2>&1

    sleep 2
    echo -e "${GREEN}✓ Cluster ready on ports 17000-17002${NC}"
}

start_bundle() {
    echo -e "${YELLOW}Starting Valkey bundle with JSON module on port 6380...${NC}"
    docker run -d \
        --name valkey-bundle \
        -p 6380:6379 \
        valkey/valkey-bundle:latest \
        >/dev/null

    # Wait for readiness
    for i in {1..30}; do
        if docker exec valkey-bundle valkey-cli ping 2>/dev/null | grep -q PONG; then
            echo -e "${GREEN}✓ Valkey bundle ready on port 6380${NC}"
            return
        fi
        sleep 1
    done
    echo -e "${RED}✗ Timeout waiting for Valkey bundle${NC}"
    exit 1
}

stop_standalone() {
    echo -e "${YELLOW}Stopping standalone Valkey...${NC}"
    docker stop valkey-standalone >/dev/null 2>&1 || true
    docker rm valkey-standalone >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ Standalone stopped${NC}"
}

stop_cluster() {
    echo -e "${YELLOW}Stopping cluster nodes...${NC}"
    for port in 17000 17001 17002; do
        docker stop valkey-node-$port >/dev/null 2>&1 || true
        docker rm valkey-node-$port >/dev/null 2>&1 || true
    done
    echo -e "${GREEN}✓ Cluster stopped${NC}"
}

stop_bundle() {
    echo -e "${YELLOW}Stopping Valkey bundle...${NC}"
    docker stop valkey-bundle >/dev/null 2>&1 || true
    docker rm valkey-bundle >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ Bundle stopped${NC}"
}

stop_all() {
    stop_standalone
    stop_cluster
    stop_bundle
}

# Main logic
case "$1" in
    start)
        case "$2" in
            standalone) start_standalone ;;
            cluster) start_cluster ;;
            bundle) start_bundle ;;
            *) show_usage; exit 1 ;;
        esac
        ;;
    stop)
        case "$2" in
            standalone) stop_standalone ;;
            cluster) stop_cluster ;;
            bundle) stop_bundle ;;
            all) stop_all ;;
            *) show_usage; exit 1 ;;
        esac
        ;;
    *)
        show_usage
        exit 1
        ;;
esac