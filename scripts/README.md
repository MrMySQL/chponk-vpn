# VPN Server Deployment Scripts

Automated deployment of VPN servers with VLESS+Reality protocol via 3x-ui panel.

## Features

- **One-command deployment** - Deploy a full VPN server from your local machine
- **VLESS+Reality** - Modern, fast, censorship-resistant protocol
- **Auto-configured inbound** - Reality inbound created automatically with keys
- **Secret panel access** - 3x-ui panel hidden behind random path

## Prerequisites

Before deploying, ensure you have:

- **VPS Server** - Fresh Ubuntu 20.04+ or Debian 11+ with root access
- **Domain** - A domain managed by Cloudflare (for DNS)
- **Cloudflare Account** - With API token (see Configuration below)
- **SSH Access** - Ability to SSH to your server as root
- **Local Tools** - `bash`, `ssh`, `scp` (standard on macOS/Linux)

## Quick Start

```bash
# 1. Configure credentials
cp scripts/deploy.conf.example scripts/deploy.conf
# Edit deploy.conf with your Cloudflare API credentials

# 2. Deploy a server
./scripts/deploy.sh root@YOUR_SERVER_IP your-domain.com --direct
```

## Configuration

Create `scripts/deploy.conf`:

```bash
# Cloudflare (for DNS management)
CF_TOKEN="your-cloudflare-api-token"
CF_ZONE_ID="your-zone-id"

# 3x-ui Panel Defaults
XUI_USER="admin"
XUI_PASS="changeme123"  # Will auto-generate if left as default

# API Registration (optional)
API_ENDPOINT=""
API_TOKEN=""
```

### Cloudflare API Token

Create at: https://dash.cloudflare.com/profile/api-tokens

Required permissions:
- Zone → DNS → Edit
- Zone → Zone → Read

## Usage

```bash
./scripts/deploy.sh <user@ip> <domain> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--direct` | Use Let's Encrypt instead of Cloudflare proxy |
| `--name "Name"` | Server display name (default: domain) |
| `--location "City, CC"` | Server location (default: Unknown) |
| `--reality-port 443` | Reality listen port (default: 443) |
| `--reality-dest "x:443"` | Reality destination (default: www.cloudflare.com:443) |
| `--reality-sni "x.com"` | Reality SNI (default: cloudflare.com) |
| `--panel-path "/path"` | Secret panel path (default: random) |
| `--clean-inbounds` | Remove existing inbounds before creating new ones |
| `--step 5` | Run only step 5 |
| `--from 5` | Run from step 5 to the end |
| `--to 3` | Run from step 1 to step 3 |
| `--list-steps` | Show available steps |

### Available Steps

Use `--list-steps` to see all steps. See [SETUP-SCRIPT.md](./SETUP-SCRIPT.md) for detailed documentation of what each step does.

## Examples

```bash
# Full deployment with Let's Encrypt
./scripts/deploy.sh root@167.99.123.45 de-fsn1.example.com --direct

# With custom name and location
./scripts/deploy.sh root@1.2.3.4 de-fsn1.example.com \
  --direct \
  --name "Frankfurt 1" \
  --location "Frankfurt, DE"

# Custom Reality destination
./scripts/deploy.sh root@1.2.3.4 de-fsn1.example.com \
  --direct \
  --reality-dest "www.google.com:443" \
  --reality-sni "www.google.com"

# Re-run only inbound creation
./scripts/deploy.sh root@1.2.3.4 de-fsn1.example.com --step 5

# Fresh start - clean inbounds and recreate
./scripts/deploy.sh root@1.2.3.4 de-fsn1.example.com --clean-inbounds --step 5
```

## After Deployment

The script outputs connection details:

```
=== VLESS+Reality Connection ===
Address:       1.2.3.4
Port:          443
UUID:          xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Flow:          xtls-rprx-vision
Security:      Reality
SNI:           cloudflare.com
Public Key:    xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Short ID:      xxxxxxxx
Fingerprint:   chrome
```

### Connect with v2rayNG / Shadowrocket

1. Open 3x-ui panel at the URL shown
2. Go to Inbounds → find VLESS-Reality
3. Click the QR code icon to get subscription link
4. Scan with v2rayNG, Shadowrocket, or similar app

Or manually configure using the connection details above.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           VPN Server                │
                    │                                     │
Client ─────────────┼──► Reality (443) ──► Internet      │
                    │                                     │
Browser ────────────┼──► Nginx (8443) ──► Landing Page   │
                    │         │                           │
                    │         └──► 3x-ui Panel (2053)    │
                    └─────────────────────────────────────┘
```

- **Reality on 443**: VPN traffic (VLESS+Reality)
- **Nginx on 8443**: Landing page camouflage + hidden panel access
- **3x-ui on 2053**: Panel backend (only accessible via nginx)

## Files

```
scripts/
├── deploy.sh              # Local wrapper script
├── deploy.conf            # Credentials (gitignored)
├── deploy.conf.example    # Template for deploy.conf
├── setup-server.sh        # Remote setup script
├── nginx.conf.template    # Nginx config template
├── README.md              # This file
└── SETUP-SCRIPT.md        # Technical reference for setup-server.sh

index.html                 # Landing page (camouflage)
```

## Troubleshooting

### Connection Timeout

Check if Reality port is open:
```bash
ssh root@IP "ufw status"
```

### Panel Not Accessible

Panel is on port 8443 (not 443), access via:
```
https://domain:8443/panel-xxxxx/
```

### Certificate Issues

For Let's Encrypt errors, ensure port 80 is open:
```bash
ssh root@IP "ufw allow 80/tcp && ufw reload"
./scripts/deploy.sh root@IP domain.com --step 3
```

### Recreate Inbound

```bash
./scripts/deploy.sh root@IP domain.com --clean-inbounds --step 5
```
