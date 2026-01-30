#!/bin/bash
set -e

#######################################
# Local Deploy Script
#
# Usage:
#   ./deploy.sh <user@ip> <domain> [options]
#
# Options:
#   --name "Server Name"     Server display name (default: domain)
#   --location "City, CC"    Server location (default: Unknown)
#   --reality-port 443       Reality port (default: 443)
#   --reality-dest "x:443"   Reality destination (default: www.cloudflare.com:443)
#   --reality-sni "x.com"    Reality SNI (default: cloudflare.com)
#   --direct                 Use Let's Encrypt instead of Cloudflare proxy
#   --step 5                 Run only step 5
#   --step 3,5,6             Run steps 3, 5, and 6
#   --from 5                 Run from step 5 to the end
#   --to 3                   Run from step 1 to step 3
#   --list-steps             Show available steps
#
# Examples:
#   ./deploy.sh root@167.99.123.45 do-sf1.example.com --direct
#   ./deploy.sh root@1.2.3.4 de-fsn1.example.com --name "Frankfurt 1" --location "Frankfurt, DE"
#   ./deploy.sh root@1.2.3.4 de-fsn1.example.com --step 5      # Only create inbound
#   ./deploy.sh root@1.2.3.4 de-fsn1.example.com --from 6      # From nginx onwards
#######################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy.conf"
SETUP_SCRIPT="${SCRIPT_DIR}/setup-server.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Show usage
show_usage() {
  echo "Usage: $0 <user@ip> <domain> [options]"
  echo ""
  echo "Options:"
  echo "  --name \"Server Name\"     Server display name (default: domain)"
  echo "  --location \"City, CC\"    Server location (default: Unknown)"
  echo "  --reality-port 443       Reality port (default: 443)"
  echo "  --reality-dest \"x:443\"   Reality destination (default: www.cloudflare.com:443)"
  echo "  --reality-sni \"x.com\"    Reality SNI (default: cloudflare.com)"
  echo "  --direct                 Use Let's Encrypt instead of Cloudflare proxy"
  echo "  --step 5                 Run only step 5"
  echo "  --step 3,5,6             Run steps 3, 5, and 6"
  echo "  --from 5                 Run from step 5 to the end"
  echo "  --to 3                   Run from step 1 to step 3"
  echo "  --list-steps             Show available steps"
  echo ""
  echo "Examples:"
  echo "  $0 root@167.99.123.45 do-sf1.example.com --direct"
  echo "  $0 root@1.2.3.4 de-fsn1.example.com --name \"Frankfurt 1\" --location \"Frankfurt, DE\""
  exit 1
}

# Show steps
show_steps() {
  echo "Available steps:"
  echo "  1  - System Update (apt update, install packages)"
  echo "  2  - Configure Cloudflare DNS (create/update A record)"
  echo "  3  - Generate SSL Certificate"
  echo "  4  - Install 3x-ui panel"
  echo "  5  - Create VLESS+Reality Inbound"
  echo "  6  - Configure Nginx (landing page + panel)"
  echo "  7  - Configure Firewall (ufw)"
  echo "  8  - Enable Cloudflare Proxy (skipped in direct mode)"
  echo "  9  - Register with API (optional)"
  echo "  10 - Print Summary"
  exit 0
}

# Check minimum arguments
[[ $# -lt 2 ]] && show_usage

# Parse positional arguments first
SSH_TARGET="$1"
DOMAIN="$2"
shift 2

# Default values
SERVER_NAME="$DOMAIN"
SERVER_LOCATION="Unknown"
STEP_ONLY=""
STEP_FROM=""
STEP_TO=""
REALITY_PORT=""
REALITY_DEST=""
REALITY_SNI=""
PANEL_PATH=""
DIRECT_MODE=""
CLEAN_INBOUNDS=""

# Parse optional arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --name) SERVER_NAME="$2"; shift 2 ;;
    --location) SERVER_LOCATION="$2"; shift 2 ;;
    --step) STEP_ONLY="$2"; shift 2 ;;
    --from) STEP_FROM="$2"; shift 2 ;;
    --to) STEP_TO="$2"; shift 2 ;;
    --reality-port) REALITY_PORT="$2"; shift 2 ;;
    --reality-dest) REALITY_DEST="$2"; shift 2 ;;
    --reality-sni) REALITY_SNI="$2"; shift 2 ;;
    --panel-path) PANEL_PATH="$2"; shift 2 ;;
    --direct) DIRECT_MODE="true"; shift ;;
    --clean-inbounds) CLEAN_INBOUNDS="true"; shift ;;
    --list-steps) show_steps ;;
    *) log_error "Unknown option: $1" ;;
  esac
done

# Load config
if [[ ! -f "$CONFIG_FILE" ]]; then
  log_error "Config file not found: $CONFIG_FILE"
fi
source "$CONFIG_FILE"

# Validate config (CF credentials not required for direct mode)
if [[ -z "$DIRECT_MODE" ]]; then
  [[ -z "$CF_TOKEN" || "$CF_TOKEN" == "your-cloudflare-api-token" ]] && log_error "Set CF_TOKEN in $CONFIG_FILE (or use --direct)"
  [[ -z "$CF_ZONE_ID" || "$CF_ZONE_ID" == "your-zone-id" ]] && log_error "Set CF_ZONE_ID in $CONFIG_FILE (or use --direct)"
fi

# Check setup script exists
[[ ! -f "$SETUP_SCRIPT" ]] && log_error "Setup script not found: $SETUP_SCRIPT"

# Generate random panel path if not provided
[[ -z "$PANEL_PATH" ]] && PANEL_PATH="/panel-$(openssl rand -hex 8)"

# Generate password if default
if [[ "$XUI_PASS" == "changeme123" ]]; then
  XUI_PASS=$(openssl rand -base64 12 | tr -d '/+=')
  log_warn "Generated random password: $XUI_PASS"
fi

log_info "Deploying to $SSH_TARGET"
log_info "Domain: $DOMAIN"
log_info "Server Name: $SERVER_NAME"
log_info "Location: $SERVER_LOCATION"
log_info "Protocol: VLESS+Reality"
echo ""

# Test SSH connection
log_info "Testing SSH connection..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_TARGET" "echo 'SSH OK'" 2>/dev/null; then
  log_error "Cannot connect to $SSH_TARGET. Check SSH key/access."
fi

# Upload setup script and landing page
log_info "Uploading files..."
scp "$SETUP_SCRIPT" "${SSH_TARGET}:/tmp/setup-server.sh"
scp "${SCRIPT_DIR}/../index.html" "${SSH_TARGET}:/tmp/landing-page.html" 2>/dev/null || true

log_info "Running setup script on remote server..."
ssh -t "$SSH_TARGET" bash /tmp/setup-server.sh \
  --domain "$DOMAIN" \
  --cf-token "$CF_TOKEN" \
  --cf-zone-id "$CF_ZONE_ID" \
  --xui-user "$XUI_USER" \
  --xui-pass "$XUI_PASS" \
  --server-name "$SERVER_NAME" \
  --server-location "$SERVER_LOCATION" \
  ${REALITY_PORT:+--reality-port "$REALITY_PORT"} \
  ${REALITY_DEST:+--reality-dest "$REALITY_DEST"} \
  ${REALITY_SNI:+--reality-sni "$REALITY_SNI"} \
  ${API_ENDPOINT:+--api-endpoint "$API_ENDPOINT"} \
  ${API_TOKEN:+--api-token "$API_TOKEN"} \
  ${STEP_ONLY:+--step "$STEP_ONLY"} \
  ${STEP_FROM:+--from "$STEP_FROM"} \
  ${STEP_TO:+--to "$STEP_TO"} \
  ${PANEL_PATH:+--panel-path "$PANEL_PATH"} \
  ${DIRECT_MODE:+--direct} \
  ${CLEAN_INBOUNDS:+--clean-inbounds}

# Fetch connection info from server
CLIENT_UUID=$(ssh "$SSH_TARGET" "cat /tmp/client_uuid.txt 2>/dev/null" || echo "")
REALITY_PUBLIC_KEY=$(ssh "$SSH_TARGET" "cat /tmp/reality_public_key.txt 2>/dev/null" || echo "")
REALITY_SHORT_ID=$(ssh "$SSH_TARGET" "cat /tmp/reality_short_id.txt 2>/dev/null" || echo "")
SERVER_IP=$(ssh "$SSH_TARGET" "curl -4 -s ifconfig.me" || echo "")

log_info "====================================="
log_info "   DEPLOYMENT COMPLETE!"
log_info "====================================="
echo ""
echo "Domain:        ${DOMAIN}"
echo "Server IP:     ${SERVER_IP}"
echo "Mode:          $(if [[ -n "$DIRECT_MODE" ]]; then echo "Direct (Let's Encrypt)"; else echo "Cloudflare Proxy"; fi)"
echo ""
echo "3x-ui Panel:   https://${DOMAIN}:2053${PANEL_PATH}/"
echo "3x-ui User:    ${XUI_USER}"
echo "3x-ui Pass:    ${XUI_PASS}"
echo ""
echo "=== VLESS+Reality Connection ==="
echo "Address:       ${DOMAIN}"
echo "Port:          ${REALITY_PORT:-443}"
echo "UUID:          ${CLIENT_UUID}"
echo "Flow:          xtls-rprx-vision"
echo "Security:      Reality"
echo "SNI:           ${REALITY_SNI:-cloudflare.com}"
echo "Public Key:    ${REALITY_PUBLIC_KEY}"
echo "Short ID:      ${REALITY_SHORT_ID}"
echo "Fingerprint:   chrome"
echo ""
