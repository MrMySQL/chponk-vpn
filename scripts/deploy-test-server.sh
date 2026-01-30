#!/bin/bash
set -e

#######################################
# Deploy to Test Server
#
# Usage:
#   ./scripts/deploy-test-server.sh \
#     --domain "test.myvpn.xyz" \
#     --cf-token "your-cloudflare-token" \
#     --cf-zone-id "your-zone-id" \
#     --xui-user "admin" \
#     --xui-pass "securepass123" \
#     --api-token "your-api-token"
#
# Or with .env file containing all values:
#   ./scripts/deploy-test-server.sh
#######################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env file if exists
if [[ -f "$PROJECT_DIR/.env" ]]; then
  export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
fi

# Default values (can be overridden by args or .env)
DOMAIN="${TEST_DOMAIN:-}"
CF_TOKEN="${CF_API_TOKEN:-}"
CF_ZONE_ID="${CF_ZONE_ID:-}"
XUI_USER="${XUI_USER:-admin}"
XUI_PASS="${XUI_PASS:-}"
WS_PATH="${WS_PATH:-/ws-$(openssl rand -hex 6)}"
GRPC_SERVICE="${GRPC_SERVICE:-grpc-$(openssl rand -hex 6)}"
API_ENDPOINT="${API_ENDPOINT:-}"
API_TOKEN="${API_TOKEN:-}"
SERVER_NAME="${SERVER_NAME:-Test Server}"
SERVER_LOCATION="${SERVER_LOCATION:-Test Location}"
FLAG_EMOJI="${FLAG_EMOJI:-🧪}"
SSH_KEY="${SSH_KEY:-}"
SSH_USER="${SSH_USER:-root}"

# Parse command line arguments (override .env)
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --cf-token) CF_TOKEN="$2"; shift 2 ;;
    --cf-zone-id) CF_ZONE_ID="$2"; shift 2 ;;
    --xui-user) XUI_USER="$2"; shift 2 ;;
    --xui-pass) XUI_PASS="$2"; shift 2 ;;
    --ws-path) WS_PATH="$2"; shift 2 ;;
    --grpc-service) GRPC_SERVICE="$2"; shift 2 ;;
    --api-endpoint) API_ENDPOINT="$2"; shift 2 ;;
    --api-token) API_TOKEN="$2"; shift 2 ;;
    --server-name) SERVER_NAME="$2"; shift 2 ;;
    --server-location) SERVER_LOCATION="$2"; shift 2 ;;
    --flag-emoji) FLAG_EMOJI="$2"; shift 2 ;;
    --ssh-key) SSH_KEY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate required vars
[[ -z "$TEST_DROPLET_IP" ]] && { echo "ERROR: TEST_DROPLET_IP not set"; exit 1; }
[[ -z "$DOMAIN" ]] && { echo "ERROR: --domain or TEST_DOMAIN required"; exit 1; }
[[ -z "$CF_TOKEN" ]] && { echo "ERROR: --cf-token or CF_API_TOKEN required"; exit 1; }
[[ -z "$CF_ZONE_ID" ]] && { echo "ERROR: --cf-zone-id or CF_ZONE_ID required"; exit 1; }
[[ -z "$XUI_PASS" ]] && { echo "ERROR: --xui-pass or XUI_PASS required"; exit 1; }

# Build SSH options
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
[[ -n "$SSH_KEY" ]] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY"

echo "========================================"
echo "  Deploying to Test Server"
echo "========================================"
echo "Server IP:     $TEST_DROPLET_IP"
echo "Domain:        $DOMAIN"
echo "WebSocket:     $WS_PATH"
echo "gRPC:          $GRPC_SERVICE"
echo "========================================"
echo ""

# Copy the setup script to the server
echo "[1/3] Copying setup script to server..."
scp $SSH_OPTS "$SCRIPT_DIR/setup-server.sh" "${SSH_USER}@${TEST_DROPLET_IP}:/tmp/setup-server.sh"

# Make executable and run
echo "[2/3] Running setup script on server..."
ssh $SSH_OPTS "${SSH_USER}@${TEST_DROPLET_IP}" bash /tmp/setup-server.sh \
  --domain "$DOMAIN" \
  --cf-token "$CF_TOKEN" \
  --cf-zone-id "$CF_ZONE_ID" \
  --xui-user "$XUI_USER" \
  --xui-pass "$XUI_PASS" \
  --ws-path "$WS_PATH" \
  --grpc-service "$GRPC_SERVICE" \
  --api-endpoint "${API_ENDPOINT:-http://localhost:3000/api/servers/register}" \
  --api-token "${API_TOKEN:-test-token}" \
  --server-name "$SERVER_NAME" \
  --server-location "$SERVER_LOCATION" \
  --flag-emoji "$FLAG_EMOJI"

echo ""
echo "[3/3] Deployment complete!"
echo ""
echo "Test the setup:"
echo "  curl -I https://${DOMAIN}"
echo "  Open: http://${TEST_DROPLET_IP}:2053"
