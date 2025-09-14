#!/bin/bash

# Simple script to start a 3-node Valkey cluster on the local machine
# Requires valkey-server to be installed locally

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create directories for each node
mkdir -p /tmp/valkey-cluster/{17000,17001,17002}

echo -e "${YELLOW}Starting Valkey cluster nodes...${NC}"

# Start 3 Valkey instances on different ports
valkey-server --port 17000 --cluster-enabled yes --cluster-config-file /tmp/valkey-cluster/17000/nodes.conf --cluster-node-timeout 5000 --appendonly no --save "" --dir /tmp/valkey-cluster/17000 --daemonize yes --pidfile /tmp/valkey-cluster/17000.pid --logfile /tmp/valkey-cluster/17000.log

valkey-server --port 17001 --cluster-enabled yes --cluster-config-file /tmp/valkey-cluster/17001/nodes.conf --cluster-node-timeout 5000 --appendonly no --save "" --dir /tmp/valkey-cluster/17001 --daemonize yes --pidfile /tmp/valkey-cluster/17001.pid --logfile /tmp/valkey-cluster/17001.log

valkey-server --port 17002 --cluster-enabled yes --cluster-config-file /tmp/valkey-cluster/17002/nodes.conf --cluster-node-timeout 5000 --appendonly no --save "" --dir /tmp/valkey-cluster/17002 --daemonize yes --pidfile /tmp/valkey-cluster/17002.pid --logfile /tmp/valkey-cluster/17002.log

# Wait for nodes to start
sleep 2

# Create the cluster (use timeout to prevent hanging)
echo -e "${YELLOW}Creating cluster...${NC}"
timeout 10 bash -c 'echo "yes" | valkey-cli --cluster create 127.0.0.1:17000 127.0.0.1:17001 127.0.0.1:17002 --cluster-replicas 0' || {
    echo -e "${RED}Cluster creation timed out or failed${NC}"
    echo -e "${YELLOW}Attempting to fix cluster meet...${NC}"
    
    # Manually meet nodes if automatic creation fails
    valkey-cli -p 17000 cluster meet 127.0.0.1 17001
    valkey-cli -p 17000 cluster meet 127.0.0.1 17002
    valkey-cli -p 17001 cluster meet 127.0.0.1 17000
    valkey-cli -p 17001 cluster meet 127.0.0.1 17002
    valkey-cli -p 17002 cluster meet 127.0.0.1 17000
    valkey-cli -p 17002 cluster meet 127.0.0.1 17001
    
    # Assign slots manually if needed
    valkey-cli -p 17000 cluster addslots $(seq 0 5460)
    valkey-cli -p 17001 cluster addslots $(seq 5461 10922)
    valkey-cli -p 17002 cluster addslots $(seq 10923 16383)
    
    sleep 2
}

# Check cluster status
echo -e "${GREEN}Cluster status:${NC}"
valkey-cli -p 17000 cluster info

echo -e "${GREEN}Cluster nodes:${NC}"
valkey-cli -p 17000 cluster nodes

echo -e "${GREEN}✓ Cluster is ready on ports 17000, 17001, 17002${NC}"
echo -e "${YELLOW}To stop the cluster, run: ./scripts/stop-test-cluster.sh${NC}"
