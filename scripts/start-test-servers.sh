#!/bin/bash

# Script to start Valkey test servers with randomized ports
# This prevents conflicts when multiple test instances are running

set -e

# Function to generate a random available port
generate_random_port() {
    local port
    while true; do
        port=$((RANDOM % 10000 + 50000))  # Random port between 50000-59999
        if ! nc -z localhost $port 2>/dev/null; then
            echo $port
            return
        fi
    done
}

# Generate random ports
export VALKEY_STANDALONE_PORT=$(generate_random_port)
export VALKEY_CLUSTER_PORT_1=$(generate_random_port)
export VALKEY_CLUSTER_PORT_2=$(generate_random_port)
export VALKEY_CLUSTER_PORT_3=$(generate_random_port)
export VALKEY_CLUSTER_PORT_4=$(generate_random_port)
export VALKEY_CLUSTER_PORT_5=$(generate_random_port)
export VALKEY_CLUSTER_PORT_6=$(generate_random_port)

echo "🚀 Starting Valkey test servers with randomized ports:"
echo "   Standalone: localhost:$VALKEY_STANDALONE_PORT"
echo "   Cluster nodes: $VALKEY_CLUSTER_PORT_1, $VALKEY_CLUSTER_PORT_2, $VALKEY_CLUSTER_PORT_3, $VALKEY_CLUSTER_PORT_4, $VALKEY_CLUSTER_PORT_5, $VALKEY_CLUSTER_PORT_6"

# Export environment variables to a file for tests to read
cat > .env.test << EOF
VALKEY_STANDALONE_HOST=localhost
VALKEY_STANDALONE_PORT=$VALKEY_STANDALONE_PORT
VALKEY_CLUSTER_PORT_1=$VALKEY_CLUSTER_PORT_1
VALKEY_CLUSTER_PORT_2=$VALKEY_CLUSTER_PORT_2
VALKEY_CLUSTER_PORT_3=$VALKEY_CLUSTER_PORT_3
VALKEY_CLUSTER_PORT_4=$VALKEY_CLUSTER_PORT_4
VALKEY_CLUSTER_PORT_5=$VALKEY_CLUSTER_PORT_5
VALKEY_CLUSTER_PORT_6=$VALKEY_CLUSTER_PORT_6
EOF

# Start the containers
sudo docker-compose -f docker-compose.test.yml --env-file .env.test up -d

# Wait for services to be healthy
echo "⏳ Waiting for Valkey standalone to be ready..."
timeout 30 sh -c "until nc -z localhost $VALKEY_STANDALONE_PORT; do sleep 1; done"

echo "⏳ Waiting for Valkey cluster nodes to be ready..."
for port in $VALKEY_CLUSTER_PORT_1 $VALKEY_CLUSTER_PORT_2 $VALKEY_CLUSTER_PORT_3 $VALKEY_CLUSTER_PORT_4 $VALKEY_CLUSTER_PORT_5 $VALKEY_CLUSTER_PORT_6; do
    timeout 30 sh -c "until nc -z localhost $port; do sleep 1; done"
done

echo "⏳ Waiting for cluster setup to complete..."
sleep 15

echo "✅ All Valkey test servers are ready!"
echo "   Standalone server: localhost:$VALKEY_STANDALONE_PORT"
echo "   Cluster entry points: localhost:$VALKEY_CLUSTER_PORT_1"
echo ""
echo "💡 Environment variables saved to .env.test"
echo "💡 Run tests with: npm test"
echo "💡 Stop servers with: ./scripts/stop-test-servers.sh"