#!/bin/bash
set -e

#######################################
# VPN Server Auto-Setup Script
#
# Usage:
#   curl -sSL https://gist.githubusercontent.com/YOU/GIST_ID/raw/setup-server.sh | bash -s -- \
#     --domain "de.myvpn.xyz" \
#     --cf-token "your-cloudflare-api-token" \
#     --cf-zone-id "your-zone-id" \
#     --xui-user "admin" \
#     --xui-pass "securepassword" \
#     --ws-path "/ws-abc123" \
#     --grpc-service "grpc-xyz789" \
#     --api-endpoint "https://your-api.vercel.app/api/servers/register" \
#     --api-token "your-api-token" \
#     --server-name "Frankfurt" \
#     --server-location "Frankfurt, DE" \
#     --flag-emoji "🇩🇪"
#
# Step control:
#   --step 5        Run only step 5
#   --step 3,5,6    Run steps 3, 5, and 6
#   --from 5        Run from step 5 to the end
#   --to 3          Run from step 1 to step 3
#   --from 3 --to 6 Run steps 3 through 6
#   --list-steps    Show available steps and exit
#
# Steps:
#   1  - System Update
#   2  - Configure Cloudflare DNS
#   3  - Generate Cloudflare Origin Certificate
#   4  - Install 3x-ui
#   5  - Create Inbounds via API
#   6  - Configure Nginx
#   7  - Configure Firewall
#   8  - Enable Cloudflare Proxy
#   9  - Register with API
#   10 - Print Summary
#
# Note: Uses Cloudflare Origin Certificate (no Let's Encrypt needed)
#######################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Default values
XUI_PORT=2053
REALITY_PORT=443
REALITY_DEST="www.cloudflare.com:443"
REALITY_SNI="cloudflare.com"
PANEL_PATH=""  # Secret path for 3x-ui panel (auto-generated if empty)
DIRECT_MODE=false  # If true, use Let's Encrypt instead of Cloudflare proxy
CLEAN_INBOUNDS=false  # If true, remove all existing inbounds before creating new ones

# Step control
STEP_FROM=1
STEP_TO=10
STEP_ONLY=""

# Function to check if step should run
should_run_step() {
  local step=$1
  if [[ -n "$STEP_ONLY" ]]; then
    # Check if step is in comma-separated list
    echo ",$STEP_ONLY," | grep -q ",$step,"
    return $?
  fi
  [[ $step -ge $STEP_FROM && $step -le $STEP_TO ]]
}

# Show available steps
show_steps() {
  echo "Available steps:"
  echo "  1  - System Update (apt update, install packages)"
  echo "  2  - Configure Cloudflare DNS (create/update A record)"
  echo "  3  - Generate Cloudflare Origin Certificate"
  echo "  4  - Install 3x-ui panel"
  echo "  5  - Create Inbounds via API (WS + gRPC)"
  echo "  6  - Configure Nginx (reverse proxy)"
  echo "  7  - Configure Firewall (ufw)"
  echo "  8  - Enable Cloudflare Proxy (orange cloud)"
  echo "  9  - Register with API (optional)"
  echo "  10 - Print Summary"
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --cf-token) CF_TOKEN="$2"; shift 2 ;;
    --cf-zone-id) CF_ZONE_ID="$2"; shift 2 ;;
    --xui-user) XUI_USER="$2"; shift 2 ;;
    --xui-pass) XUI_PASS="$2"; shift 2 ;;
    --reality-port) REALITY_PORT="$2"; shift 2 ;;
    --reality-dest) REALITY_DEST="$2"; shift 2 ;;
    --reality-sni) REALITY_SNI="$2"; shift 2 ;;
    --api-endpoint) API_ENDPOINT="$2"; shift 2 ;;
    --api-token) API_TOKEN="$2"; shift 2 ;;
    --server-name) SERVER_NAME="$2"; shift 2 ;;
    --server-location) SERVER_LOCATION="$2"; shift 2 ;;
    --flag-emoji) FLAG_EMOJI="$2"; shift 2 ;;
    --xui-port) XUI_PORT="$2"; shift 2 ;;
    --panel-path) PANEL_PATH="$2"; shift 2 ;;
    --step) STEP_ONLY="$2"; shift 2 ;;
    --from) STEP_FROM="$2"; shift 2 ;;
    --to) STEP_TO="$2"; shift 2 ;;
    --direct) DIRECT_MODE=true; shift ;;
    --clean-inbounds) CLEAN_INBOUNDS=true; shift ;;
    --list-steps) show_steps ;;
    *) log_error "Unknown option: $1" ;;
  esac
done

# Validate required arguments
[[ -z "$DOMAIN" ]] && log_error "Missing --domain"
# CF credentials only required if not in direct mode OR if we want DNS management
if [[ "$DIRECT_MODE" != "true" ]]; then
  [[ -z "$CF_TOKEN" ]] && log_error "Missing --cf-token (use --direct for Let's Encrypt mode)"
fi
[[ -z "$CF_ZONE_ID" ]] && log_error "Missing --cf-zone-id"
[[ -z "$XUI_USER" ]] && log_error "Missing --xui-user"
[[ -z "$XUI_PASS" ]] && log_error "Missing --xui-pass"
[[ -z "$SERVER_NAME" ]] && log_error "Missing --server-name"
[[ -z "$SERVER_LOCATION" ]] && log_error "Missing --server-location"

log_info "Reality Port: $REALITY_PORT"
log_info "Reality Dest: $REALITY_DEST"
log_info "Reality SNI: $REALITY_SNI"

# API registration is optional (can be done later)
if [[ -z "$API_ENDPOINT" ]] || [[ -z "$API_TOKEN" ]]; then
  log_warn "API_ENDPOINT or API_TOKEN not set - skipping server registration"
  SKIP_REGISTRATION=true
fi

# Get server IP
SERVER_IP=$(curl -4 -s ifconfig.me)
log_info "Server IP: $SERVER_IP"

# Generate random panel path if not provided
if [[ -z "$PANEL_PATH" ]]; then
  PANEL_PATH="/panel-$(openssl rand -hex 8)"
fi
log_info "Panel Path: $PANEL_PATH"

#######################################
# Step 1: System Update
#######################################
if should_run_step 1; then
  log_info "[Step 1/10] Updating system packages..."
  apt update && apt upgrade -y
  apt install -y curl wget unzip jq nginx ufw openssl
fi

#######################################
# Step 2: Configure Cloudflare DNS
#######################################
if should_run_step 2; then
  log_info "[Step 2/10] Setting up Cloudflare DNS for $DOMAIN..."

  # Check if DNS record exists
  EXISTING_RECORD=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${DOMAIN}&type=A" \
    -H "Authorization: Bearer ${CF_TOKEN}" \
    -H "Content-Type: application/json" | jq -r '.result[0].id // empty')

  if [[ -n "$EXISTING_RECORD" ]]; then
    # Update existing record
    log_info "Updating existing DNS record..."
    curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${EXISTING_RECORD}" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "{
        \"type\": \"A\",
        \"name\": \"${DOMAIN}\",
        \"content\": \"${SERVER_IP}\",
        \"ttl\": 1,
        \"proxied\": false
      }" | jq .
  else
    # Create new record
    log_info "Creating new DNS record..."
    curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "{
        \"type\": \"A\",
        \"name\": \"${DOMAIN}\",
        \"content\": \"${SERVER_IP}\",
        \"ttl\": 1,
        \"proxied\": false
      }" | jq .
  fi

  # Wait for DNS propagation
  log_info "Waiting for DNS propagation (30 seconds)..."
  sleep 30
fi

#######################################
# Step 3: Generate SSL Certificate
#######################################
if should_run_step 3; then
  if [[ "$DIRECT_MODE" == "true" ]]; then
    log_info "[Step 3/10] Getting Let's Encrypt certificate..."

    # Install certbot
    apt install -y certbot

    # Stop nginx temporarily for standalone verification
    systemctl stop nginx 2>/dev/null || true

    # Temporarily open port 80 for Let's Encrypt verification
    ufw allow 80/tcp 2>/dev/null || true

    # Get certificate
    certbot certonly --standalone --non-interactive --agree-tos \
      --email "admin@${DOMAIN}" \
      -d "${DOMAIN}" \
      --preferred-challenges http

    # Create symlinks to standard location for nginx config compatibility
    mkdir -p /etc/ssl/cloudflare
    ln -sf /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /etc/ssl/cloudflare/${DOMAIN}.crt
    ln -sf /etc/letsencrypt/live/${DOMAIN}/privkey.pem /etc/ssl/cloudflare/${DOMAIN}.key

    log_info "Let's Encrypt certificate obtained successfully"

    # Setup auto-renewal with nginx reload
    cat > /etc/cron.d/certbot-renew <<CRON
0 3 * * * root certbot renew --quiet --post-hook "systemctl reload nginx"
CRON
    log_info "Auto-renewal cron job configured"
  else
    log_info "[Step 3/10] Generating Cloudflare Origin Certificate..."

    # Create SSL directory
    mkdir -p /etc/ssl/cloudflare

    # Generate private key
    openssl genrsa -out /etc/ssl/cloudflare/${DOMAIN}.key 2048

    # Generate CSR
    openssl req -new -key /etc/ssl/cloudflare/${DOMAIN}.key \
      -out /etc/ssl/cloudflare/${DOMAIN}.csr \
      -subj "/CN=${DOMAIN}"

    # Read CSR content
    CSR_CONTENT=$(cat /etc/ssl/cloudflare/${DOMAIN}.csr | awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}')

    # Request Origin Certificate from Cloudflare
    log_info "Requesting Origin Certificate from Cloudflare..."
    CERT_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/certificates" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "{
        \"hostnames\": [\"${DOMAIN}\", \"*.${DOMAIN}\"],
        \"requested_validity\": 5475,
        \"request_type\": \"origin-rsa\",
        \"csr\": \"${CSR_CONTENT}\"
      }")

    # Check if successful
    if echo "$CERT_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
      # Extract and save certificate
      echo "$CERT_RESPONSE" | jq -r '.result.certificate' > /etc/ssl/cloudflare/${DOMAIN}.crt
      log_info "Origin Certificate obtained successfully (valid for 15 years)"
    else
      log_error "Failed to get Origin Certificate: $(echo "$CERT_RESPONSE" | jq -r '.errors')"
    fi

    # Set permissions
    chmod 600 /etc/ssl/cloudflare/${DOMAIN}.key
    chmod 644 /etc/ssl/cloudflare/${DOMAIN}.crt
  fi
fi

#######################################
# Step 4: Install 3x-ui
#######################################
if should_run_step 4; then
  log_info "[Step 4/10] Installing 3x-ui..."

  # Stop any existing nginx to free port 80 temporarily (needed by 3x-ui installer)
  systemctl stop nginx 2>/dev/null || true

  # Download 3x-ui release directly (skip interactive installer)
  XUI_VERSION=$(curl -s "https://api.github.com/repos/MHSanaei/3x-ui/releases/latest" | jq -r '.tag_name')
  log_info "Downloading 3x-ui ${XUI_VERSION}..."

  cd /tmp
  wget -q "https://github.com/MHSanaei/3x-ui/releases/download/${XUI_VERSION}/x-ui-linux-amd64.tar.gz"
  tar -xzf x-ui-linux-amd64.tar.gz
  cd x-ui

  # Stop existing x-ui if running
  systemctl stop x-ui 2>/dev/null || true

  # Install binary and service
  mkdir -p /usr/local/x-ui
  cp x-ui /usr/local/x-ui/
  cp x-ui.sh /usr/bin/x-ui
  chmod +x /usr/local/x-ui/x-ui /usr/bin/x-ui

  # Create data directory
  mkdir -p /etc/x-ui

  # Create geo files directory and copy
  mkdir -p /usr/local/x-ui/bin
  cp bin/* /usr/local/x-ui/bin/ 2>/dev/null || true

  # Install systemd service
  cat > /etc/systemd/system/x-ui.service <<XSERVICE
[Unit]
Description=x-ui Service
After=network.target
Wants=network.target

[Service]
Type=simple
WorkingDirectory=/usr/local/x-ui/
ExecStart=/usr/local/x-ui/x-ui
Restart=on-failure
RestartSec=5s
LimitNOFILE=1048576
LimitNPROC=512

[Install]
WantedBy=multi-user.target
XSERVICE

  systemctl daemon-reload
  systemctl enable x-ui

  # Start x-ui
  systemctl start x-ui
  sleep 5

  # Configure 3x-ui settings using interactive menu
  log_info "Configuring 3x-ui credentials..."

  # Option 6: Reset Username & Password
  # Flow:
  #   1. Select option 6
  #   2. Confirm reset (y)
  #   3. Enter username
  #   4. Enter password
  #   5. Disable 2FA (y)
  #   6. Restart panel (y/enter)
  #   7. Press enter to return
  #   8. Exit menu (0)
  echo -e "6\ny\n${XUI_USER}\n${XUI_PASS}\ny\ny\n\n0\n" | x-ui
  sleep 3

  # Option 9: Change Port
  # Flow:
  #   1. Select option 9
  #   2. Enter new port
  #   3. Restart panel (y/enter)
  #   4. Press enter to return
  #   5. Exit menu (0)
  echo -e "9\n${XUI_PORT}\ny\n\n0\n" | x-ui
  sleep 3

  log_info "3x-ui credentials configured: ${XUI_USER} / ${XUI_PASS} on port ${XUI_PORT}"

  # Clean up
  rm -rf /tmp/x-ui /tmp/x-ui-linux-amd64.tar.gz

  log_info "3x-ui installed and configured"
fi

#######################################
# Step 5: Create VLESS+Reality Inbound
#######################################
if should_run_step 5; then
  log_info "[Step 5/10] Creating VLESS+Reality inbound..."

  # Stop x-ui to safely modify database
  systemctl stop x-ui

  # Install sqlite3 if not present
  which sqlite3 > /dev/null || apt install -y sqlite3

  XUI_DB="/etc/x-ui/x-ui.db"

  # Clean existing inbounds if requested
  if [[ "$CLEAN_INBOUNDS" == "true" ]]; then
    log_warn "Removing all existing inbounds..."
    sqlite3 "$XUI_DB" "DELETE FROM inbounds;"
    sqlite3 "$XUI_DB" "DELETE FROM client_traffics;"
    log_info "All inbounds removed"
  fi

  # Generate UUID for the client
  CLIENT_UUID=$(cat /proc/sys/kernel/random/uuid)

  # Generate x25519 keypair for Reality
  log_info "Generating Reality keys..."
  XRAY_BIN="/usr/local/x-ui/bin/xray-linux-amd64"
  if [[ ! -f "$XRAY_BIN" ]]; then
    XRAY_BIN="/usr/local/x-ui/bin/xray"
  fi

  REALITY_KEYS=$("$XRAY_BIN" x25519)
  # Output format: "PrivateKey: xxx" and "Password: xxx" (Password is the public key)
  REALITY_PRIVATE_KEY=$(echo "$REALITY_KEYS" | grep "PrivateKey:" | awk '{print $2}')
  REALITY_PUBLIC_KEY=$(echo "$REALITY_KEYS" | grep "Password:" | awk '{print $2}')

  # Generate short ID (8 hex chars)
  REALITY_SHORT_ID=$(openssl rand -hex 4)

  log_info "Reality Public Key: $REALITY_PUBLIC_KEY"
  log_info "Reality Short ID: $REALITY_SHORT_ID"

  # Save keys for output
  echo "$REALITY_PUBLIC_KEY" > /tmp/reality_public_key.txt
  echo "$REALITY_SHORT_ID" > /tmp/reality_short_id.txt

  # Prepare JSON for VLESS+Reality settings
  REALITY_SETTINGS="{\"clients\":[{\"id\":\"${CLIENT_UUID}\",\"flow\":\"xtls-rprx-vision\",\"email\":\"default@client\",\"limitIp\":0,\"totalGB\":0,\"expiryTime\":0,\"enable\":true,\"tgId\":\"\",\"subId\":\"reality-sub\",\"reset\":0}],\"decryption\":\"none\",\"fallbacks\":[]}"

  REALITY_STREAM="{\"network\":\"tcp\",\"security\":\"reality\",\"externalProxy\":[{\"forceTls\":\"same\",\"dest\":\"${DOMAIN}\",\"port\":${REALITY_PORT},\"remark\":\"\"}],\"realitySettings\":{\"show\":false,\"xver\":0,\"target\":\"${REALITY_DEST}\",\"serverNames\":[\"${REALITY_SNI}\"],\"privateKey\":\"${REALITY_PRIVATE_KEY}\",\"minClientVer\":\"\",\"maxClientVer\":\"\",\"maxTimediff\":0,\"shortIds\":[\"${REALITY_SHORT_ID}\"],\"settings\":{\"publicKey\":\"${REALITY_PUBLIC_KEY}\",\"fingerprint\":\"chrome\",\"serverName\":\"\",\"spiderX\":\"\"}}}"

  REALITY_SNIFFING="{\"enabled\":true,\"destOverride\":[\"http\",\"tls\",\"quic\",\"fakedns\"],\"metadataOnly\":false,\"routeOnly\":false}"

  # Insert Reality inbound (listens on all interfaces, not just localhost)
  sqlite3 "$XUI_DB" "INSERT INTO inbounds (user_id, up, down, total, remark, enable, expiry_time, listen, port, protocol, settings, stream_settings, tag, sniffing) VALUES (1, 0, 0, 0, 'VLESS-Reality', 1, 0, '', ${REALITY_PORT}, 'vless', '${REALITY_SETTINGS}', '${REALITY_STREAM}', 'inbound-${REALITY_PORT}', '${REALITY_SNIFFING}');"

  if [[ $? -eq 0 ]]; then
    log_info "VLESS+Reality inbound created on port ${REALITY_PORT}"
  else
    log_warn "Failed to create Reality inbound"
  fi

  # Save client UUID for output
  echo "$CLIENT_UUID" > /tmp/client_uuid.txt

  # Configure 3x-ui panel base path to match secret panel path
  log_info "Setting panel base path to ${PANEL_PATH}/"
  sqlite3 "$XUI_DB" "UPDATE settings SET value = '${PANEL_PATH}/' WHERE key = 'webBasePath';"

  # Enable SSL for panel
  if [[ "$DIRECT_MODE" == "true" ]]; then
    # Use Let's Encrypt certs
    CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
    KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
  else
    # Use Cloudflare origin certs
    CERT_FILE="/etc/ssl/cloudflare/${DOMAIN}.crt"
    KEY_FILE="/etc/ssl/cloudflare/${DOMAIN}.key"
  fi

  log_info "Enabling SSL for panel..."
  sqlite3 "$XUI_DB" "UPDATE settings SET value = '${CERT_FILE}' WHERE key = 'webCertFile';"
  sqlite3 "$XUI_DB" "UPDATE settings SET value = '${KEY_FILE}' WHERE key = 'webKeyFile';"

  # Stop nginx if it's using port 443 (Reality needs it)
  if [[ "$REALITY_PORT" == "443" ]]; then
    log_info "Stopping nginx (Reality will use port 443)..."
    systemctl stop nginx 2>/dev/null || true
    systemctl disable nginx 2>/dev/null || true
  fi

  # Restart x-ui to load new config
  systemctl start x-ui
  log_info "3x-ui restarted with new inbound"
fi

#######################################
# Step 6: Configure Nginx (optional - skip if Reality on 443)
#######################################
if should_run_step 6; then
  if [[ "$REALITY_PORT" == "443" ]]; then
    log_info "[Step 6/10] Skipping Nginx (Reality uses port 443, panel accessible on ${XUI_PORT})"
  else
    log_info "[Step 6/10] Configuring Nginx..."

    # Create nginx config (landing page + panel proxy only)
    cat > /etc/nginx/sites-available/${DOMAIN} <<NGINX_CONF
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/ssl/cloudflare/${DOMAIN}.crt;
    ssl_certificate_key /etc/ssl/cloudflare/${DOMAIN}.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Landing page (camouflage)
    location / {
        root /var/www/${DOMAIN};
        index index.html;
    }

    # 3x-ui Panel (secret path only)
    location ${PANEL_PATH}/ {
        proxy_pass http://127.0.0.1:${XUI_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }
}
NGINX_CONF

    # Create landing page directory and copy uploaded page
    mkdir -p /var/www/${DOMAIN}
    if [[ -f /tmp/landing-page.html ]]; then
      cp /tmp/landing-page.html /var/www/${DOMAIN}/index.html
      log_info "Using custom landing page"
    else
      log_warn "No landing page found, creating default"
      echo "<html><body><h1>Welcome</h1></body></html>" > /var/www/${DOMAIN}/index.html
    fi

    # Enable site
    ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    # Test and start nginx
    nginx -t && systemctl restart nginx && systemctl enable nginx
    log_info "Nginx started on port 443"
  fi
fi

#######################################
# Step 7: Configure Firewall
#######################################
if should_run_step 7; then
  log_info "[Step 7/10] Configuring firewall..."
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp                    # SSH
  ufw allow ${REALITY_PORT}/tcp       # VLESS+Reality
  if [[ "$REALITY_PORT" == "443" ]]; then
    ufw allow ${XUI_PORT}/tcp         # Direct panel access (no nginx)
  else
    ufw allow 443/tcp                 # HTTPS for nginx
  fi
  if [[ "$DIRECT_MODE" == "true" ]]; then
    ufw allow 80/tcp                  # HTTP (for Let's Encrypt renewal)
  fi
  ufw --force enable
  log_info "Firewall configured - Reality on port ${REALITY_PORT}"
fi

#######################################
# Step 8: Enable Cloudflare Proxy (skipped for Reality and direct mode)
#######################################
if should_run_step 8; then
  if [[ "$DIRECT_MODE" == "true" ]] || [[ "$REALITY_PORT" == "443" ]]; then
    log_info "[Step 8/10] Skipping Cloudflare proxy (Reality requires direct connection)"
  else
    log_info "[Step 8/10] Enabling Cloudflare proxy (orange cloud)..."

    # Get the DNS record ID
    RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${DOMAIN}&type=A" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" | jq -r '.result[0].id')

    # Enable proxy
    curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${RECORD_ID}" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"proxied": true}' | jq .
  fi
fi

#######################################
# Step 9: Register with API
#######################################
if should_run_step 9; then
  if [[ "$SKIP_REGISTRATION" != "true" ]]; then
    log_info "[Step 9/10] Registering server with API..."

    REGISTER_RESPONSE=$(curl -s -X POST "${API_ENDPOINT}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "{
        \"name\": \"${SERVER_NAME}\",
        \"location\": \"${SERVER_LOCATION}\",
        \"flagEmoji\": \"${FLAG_EMOJI:-🌍}\",
        \"host\": \"${SERVER_IP}\",
        \"domain\": \"${DOMAIN}\",
        \"xuiPort\": ${XUI_PORT},
        \"xuiUsername\": \"${XUI_USER}\",
        \"xuiPassword\": \"${XUI_PASS}\",
        \"realityPort\": ${REALITY_PORT},
        \"realityDest\": \"${REALITY_DEST}\",
        \"realitySni\": \"${REALITY_SNI}\"
      }")

    echo "$REGISTER_RESPONSE" | jq .
  else
    log_warn "Skipping API registration (no endpoint/token provided)"
  fi
fi

#######################################
# Step 10: Print Summary
#######################################
if should_run_step 10; then
  log_info "====================================="
  log_info "   SERVER SETUP COMPLETE!"
  log_info "====================================="
  echo ""
  echo "Domain:        ${DOMAIN}"
  echo "Server IP:     ${SERVER_IP}"
  echo "Mode:          $(if [[ "$DIRECT_MODE" == "true" ]]; then echo "Direct (Let's Encrypt)"; else echo "Cloudflare Proxy"; fi)"
  echo ""
  echo "3x-ui Panel:   https://${DOMAIN}:${XUI_PORT}${PANEL_PATH}/"
  echo "3x-ui User:    ${XUI_USER}"
  echo "3x-ui Pass:    ${XUI_PASS}"
  echo ""
  echo "=== VLESS+Reality Connection ==="
  echo "Protocol:      VLESS"
  echo "Address:       ${DOMAIN}"
  echo "Port:          ${REALITY_PORT}"
  echo "Flow:          xtls-rprx-vision"
  echo "Security:      Reality"
  echo "SNI:           ${REALITY_SNI}"
  echo "Fingerprint:   chrome"
  if [[ -f /tmp/reality_public_key.txt ]]; then
    REALITY_PUBLIC_KEY=$(cat /tmp/reality_public_key.txt)
    echo "Public Key:    ${REALITY_PUBLIC_KEY}"
  fi
  if [[ -f /tmp/reality_short_id.txt ]]; then
    REALITY_SHORT_ID=$(cat /tmp/reality_short_id.txt)
    echo "Short ID:      ${REALITY_SHORT_ID}"
  fi
  echo ""
  if [[ -f /tmp/client_uuid.txt ]]; then
    CLIENT_UUID=$(cat /tmp/client_uuid.txt)
    echo "Client UUID:   ${CLIENT_UUID}"
    echo ""
    log_info "VLESS+Reality inbound created with the above settings"
  fi
  echo ""
  log_info "====================================="
fi
