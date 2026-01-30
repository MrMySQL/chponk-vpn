# Setup Script Technical Reference

Detailed documentation for `setup-server.sh` - the remote script that configures VPN servers.

## Overview

The setup script runs on the target VPS and performs automated installation and configuration of a VLESS+Reality VPN server using 3x-ui panel. It's designed to be executed via SSH from the local `deploy.sh` wrapper.

## Script Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        setup-server.sh                               │
├─────────────────────────────────────────────────────────────────────┤
│  1. Parse arguments and validate required parameters                 │
│  2. Detect server IP via ifconfig.me                                │
│  3. Generate random panel path if not provided                       │
│  4. Execute steps 1-10 based on --step/--from/--to flags            │
└─────────────────────────────────────────────────────────────────────┘
```

## Steps Breakdown

### Step 1: System Update

Updates system packages and installs required dependencies.

```bash
apt update && apt upgrade -y
apt install -y curl wget unzip jq nginx ufw openssl
```

**Installed packages:**
- `curl`, `wget` - HTTP utilities
- `jq` - JSON processing for API responses
- `nginx` - Web server (optional, for landing page)
- `ufw` - Firewall management
- `openssl` - SSL/key generation

### Step 2: Configure Cloudflare DNS

Creates or updates an A record pointing to the server IP.

**API calls:**
1. `GET /zones/{zone_id}/dns_records?name={domain}&type=A` - Check existing record
2. `PUT` or `POST` to create/update the A record with `proxied: false`

**Wait:** 30 seconds for DNS propagation before continuing.

### Step 3: Generate SSL Certificate

Two modes based on `--direct` flag:

**Direct Mode (Let's Encrypt):**
```bash
certbot certonly --standalone -d ${DOMAIN}
```
- Temporarily opens port 80
- Creates symlinks to `/etc/ssl/cloudflare/` for compatibility
- Sets up auto-renewal cron job

**Cloudflare Mode (Origin Certificate):**
1. Generate RSA private key
2. Generate CSR (Certificate Signing Request)
3. Request Origin Certificate via Cloudflare API (15-year validity)
4. Save to `/etc/ssl/cloudflare/${DOMAIN}.crt` and `.key`

### Step 4: Install 3x-ui

Installs 3x-ui panel without interactive prompts.

**Process:**
1. Fetch latest release version from GitHub API
2. Download and extract `x-ui-linux-amd64.tar.gz`
3. Install binary to `/usr/local/x-ui/`
4. Create systemd service at `/etc/systemd/system/x-ui.service`
5. Configure credentials via x-ui CLI menu automation:
   - Option 6: Reset username/password
   - Option 9: Change port

**Files created:**
- `/usr/local/x-ui/x-ui` - Main binary
- `/usr/local/x-ui/bin/` - Xray binary and geo files
- `/etc/x-ui/x-ui.db` - SQLite database
- `/etc/systemd/system/x-ui.service` - Systemd unit

### Step 5: Create VLESS+Reality Inbound

Directly manipulates the 3x-ui SQLite database to create the inbound.

**Key generation:**
```bash
# UUID for client
CLIENT_UUID=$(cat /proc/sys/kernel/random/uuid)

# x25519 keypair for Reality
REALITY_KEYS=$(/usr/local/x-ui/bin/xray-linux-amd64 x25519)

# Short ID (8 hex chars)
REALITY_SHORT_ID=$(openssl rand -hex 4)
```

**Database operations:**
```sql
-- Insert VLESS+Reality inbound
INSERT INTO inbounds (user_id, up, down, total, remark, enable, ...)
VALUES (1, 0, 0, 0, 'VLESS-Reality', 1, ...);

-- Set panel base path
UPDATE settings SET value = '${PANEL_PATH}/' WHERE key = 'webBasePath';

-- Enable SSL
UPDATE settings SET value = '${CERT_FILE}' WHERE key = 'webCertFile';
UPDATE settings SET value = '${KEY_FILE}' WHERE key = 'webKeyFile';
```

**Inbound configuration:**
- Protocol: VLESS
- Security: Reality
- Flow: `xtls-rprx-vision`
- Fingerprint: `chrome`
- Sniffing: enabled (http, tls, quic, fakedns)

### Step 6: Configure Nginx

**Skipped if:** Reality port is 443 (Reality needs direct access to port 443)

**Otherwise:** Creates nginx config with:
- Landing page at `/` (camouflage)
- Panel proxy at `${PANEL_PATH}/`

```nginx
location ${PANEL_PATH}/ {
    proxy_pass http://127.0.0.1:${XUI_PORT};
    ...
}
```

### Step 7: Configure Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp                    # SSH
ufw allow ${REALITY_PORT}/tcp       # VLESS+Reality
ufw allow ${XUI_PORT}/tcp           # Panel (if Reality on 443)
ufw allow 80/tcp                    # HTTP (direct mode only)
```

### Step 8: Enable Cloudflare Proxy

**Skipped if:** Direct mode or Reality on port 443

**Otherwise:** Updates DNS record to `proxied: true` (orange cloud).

### Step 9: Register with API

**Skipped if:** No `API_ENDPOINT` or `API_TOKEN` provided.

**Otherwise:** POSTs server details to the registration API:
```json
{
  "name": "Server Name",
  "location": "City, CC",
  "host": "1.2.3.4",
  "domain": "vpn.example.com",
  "xuiPort": 2053,
  "realityPort": 443,
  ...
}
```

### Step 10: Print Summary

Outputs all connection details including:
- Panel URL and credentials
- Reality public key and short ID
- Client UUID
- Full VLESS connection parameters

## Command-Line Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--domain` | Yes | - | Server domain name |
| `--cf-zone-id` | Yes | - | Cloudflare zone ID |
| `--cf-token` | Conditional | - | Required unless `--direct` |
| `--xui-user` | Yes | - | Panel username |
| `--xui-pass` | Yes | - | Panel password |
| `--server-name` | Yes | - | Display name |
| `--server-location` | Yes | - | Location string |
| `--direct` | No | false | Use Let's Encrypt |
| `--reality-port` | No | 443 | Reality listen port |
| `--reality-dest` | No | www.cloudflare.com:443 | Reality destination |
| `--reality-sni` | No | cloudflare.com | Reality SNI |
| `--panel-path` | No | /panel-{random} | Secret panel path |
| `--clean-inbounds` | No | false | Remove existing inbounds |
| `--step` | No | - | Run specific step(s) |
| `--from` | No | 1 | Start from step |
| `--to` | No | 10 | End at step |

## Step Control

Run specific steps:
```bash
--step 5        # Run only step 5
--step 3,5,6    # Run steps 3, 5, and 6
--from 5        # Run steps 5-10
--to 3          # Run steps 1-3
--from 3 --to 6 # Run steps 3-6
```

## Temporary Files

The script creates temporary files for passing data between steps:

| File | Contents |
|------|----------|
| `/tmp/reality_public_key.txt` | Reality public key |
| `/tmp/reality_short_id.txt` | Reality short ID |
| `/tmp/client_uuid.txt` | Client UUID |
| `/tmp/landing-page.html` | Custom landing page (optional) |

## Error Handling

- Script uses `set -e` to exit on any error
- Colored output: GREEN (info), YELLOW (warn), RED (error)
- `log_error()` exits with code 1 after printing message

## Security Considerations

- Panel accessible only via secret random path
- Reality keys generated fresh for each deployment
- SSL certificates stored with restricted permissions (600/644)
- Firewall denies all incoming except required ports
