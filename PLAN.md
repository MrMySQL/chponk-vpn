# VPN Telegram Bot - Production Implementation Plan

## Overview
A production-ready VPN service with Telegram bot interface, supporting VLESS protocol (WebSocket + gRPC transports) via 3x-ui panel, with payments through Telegram Stars and TON.

**Key Architecture Decisions:**
- **Protocol:** VLESS with WebSocket and gRPC (Cloudflare-compatible)
- **Protection:** All traffic proxied through Cloudflare (DDoS protection, hidden server IPs)
- **Camouflage:** Each server hosts a boring enterprise landing page
- **Target users:** Regions with active VPN blocking (China, Iran, Russia)

---

## 1. Project Structure

```
vpn/
├── src/
│   ├── bot/
│   │   ├── index.ts              # Bot entry point
│   │   ├── commands/
│   │   │   ├── start.ts          # /start - onboarding
│   │   │   ├── subscribe.ts      # /subscribe - plans list
│   │   │   ├── account.ts        # /account - user status
│   │   │   ├── servers.ts        # /servers - location list
│   │   │   ├── connect.ts        # /connect - get subscription link
│   │   │   └── support.ts        # /support - help
│   │   ├── admin/
│   │   │   ├── stats.ts          # /stats - analytics
│   │   │   ├── broadcast.ts      # /broadcast - mass message
│   │   │   ├── addserver.ts      # /addserver - register server
│   │   │   └── users.ts          # /users - user management
│   │   ├── callbacks/
│   │   │   ├── payment.ts        # Payment callbacks
│   │   │   ├── server-select.ts  # Server selection
│   │   │   └── plan-select.ts    # Plan selection
│   │   └── middleware/
│   │       ├── auth.ts           # User authentication
│   │       └── admin.ts          # Admin check
│   ├── services/
│   │   ├── xui.ts                # 3x-ui API client
│   │   ├── subscription.ts       # Subscription management
│   │   ├── payment/
│   │   │   ├── stars.ts          # Telegram Stars
│   │   │   └── ton.ts            # TON payments
│   │   └── config-generator.ts   # Generate VLESS WS/gRPC configs
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema
│   │   ├── index.ts              # DB connection
│   │   └── migrations/           # SQL migrations
│   ├── admin-web/
│   │   ├── pages/
│   │   │   ├── index.tsx         # Dashboard
│   │   │   ├── users.tsx         # User management
│   │   │   ├── servers.tsx       # Server management
│   │   │   └── payments.tsx      # Payment history
│   │   └── components/
│   └── lib/
│       ├── crypto.ts             # Encryption utils
│       └── validators.ts         # Input validation
├── api/
│   ├── webhook.ts                # Telegram webhook (Vercel)
│   ├── admin/                    # Admin API routes
│   └── callback/
│       └── ton.ts                # TON payment callback
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## 2. Database Schema (Neon PostgreSQL + Drizzle ORM)

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  language_code VARCHAR(10) DEFAULT 'en',
  is_admin BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscription plans
CREATE TABLE plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  duration_days INTEGER NOT NULL,
  price_stars INTEGER NOT NULL,        -- Telegram Stars price
  price_ton DECIMAL(10,2) NOT NULL,    -- TON price
  traffic_limit_gb INTEGER,            -- NULL = unlimited
  max_devices INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE
);

-- VPN Servers
CREATE TABLE servers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(100) NOT NULL,      -- e.g., "Frankfurt, DE"
  flag_emoji VARCHAR(10),              -- e.g., "🇩🇪"
  host VARCHAR(255) NOT NULL,          -- Server IP (not exposed to users)
  domain VARCHAR(255) NOT NULL,        -- e.g., "de.myvpn.xyz" (CF-proxied)
  xui_port INTEGER DEFAULT 2053,
  xui_username VARCHAR(100),
  xui_password VARCHAR(255),           -- encrypted
  inbound_id_ws INTEGER,               -- 3x-ui WebSocket inbound ID
  inbound_id_grpc INTEGER,             -- 3x-ui gRPC inbound ID
  ws_path VARCHAR(100) NOT NULL,       -- e.g., "/ws-abc123"
  grpc_service VARCHAR(100) NOT NULL,  -- e.g., "grpc-xyz789"
  transport VARCHAR(20) DEFAULT 'ws',  -- 'ws' or 'grpc' (default for users)
  is_active BOOLEAN DEFAULT TRUE,
  current_load INTEGER DEFAULT 0,
  max_capacity INTEGER DEFAULT 100
);

-- User Subscriptions
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  plan_id INTEGER REFERENCES plans(id),
  server_id INTEGER REFERENCES servers(id),
  xui_client_id UUID,                  -- UUID in 3x-ui
  subscription_url TEXT,               -- Generated sub link
  status VARCHAR(20) DEFAULT 'active', -- active, expired, cancelled
  starts_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  traffic_used_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,       -- 'stars' or 'ton'
  status VARCHAR(20) DEFAULT 'pending',
  provider_id VARCHAR(255),            -- Telegram/TON tx ID
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);
CREATE INDEX idx_payments_user_id ON payments(user_id);
```

---

## 3. Core Components Implementation

### 3.1 Telegram Bot (Grammy + Vercel)

**Dependencies:**
```json
{
  "dependencies": {
    "grammy": "^1.21.0",
    "@grammyjs/conversations": "^1.2.0",
    "drizzle-orm": "^0.29.0",
    "@neondatabase/serverless": "^0.7.0",
    "ton": "^13.0.0",
    "@ton/crypto": "^3.0.0"
  }
}
```

**Webhook handler (api/webhook.ts):**
```typescript
import { Bot, webhookCallback } from 'grammy';

const bot = new Bot(process.env.BOT_TOKEN!);

// Register commands and handlers
bot.command('start', startHandler);
bot.command('subscribe', subscribeHandler);
// ... more handlers

export default webhookCallback(bot, 'std/http');
```

### 3.2 3x-ui API Integration

Key endpoints to implement in `src/services/xui.ts`:

1. **Login** - Get session cookie
2. **Add Client** - Create user in inbound
3. **Get Client Traffic** - Monitor usage
4. **Delete Client** - Remove on expiry
5. **Get Inbound Stats** - Server load

```typescript
class XuiClient {
  async login(): Promise<string>;  // Returns session cookie
  async addClient(inboundId: number, email: string, uuid: string): Promise<void>;
  async getClientTraffic(email: string): Promise<TrafficStats>;
  async deleteClient(inboundId: number, uuid: string): Promise<void>;
  async generateSubUrl(uuid: string, serverHost: string): Promise<string>;
}
```

### 3.3 Payment Flows

**Telegram Stars:**
1. User selects plan → Bot sends invoice via `sendInvoice()`
2. Telegram handles payment
3. Bot receives `pre_checkout_query` → validate
4. Bot receives `successful_payment` → activate subscription

**TON Payments:**
1. User selects plan → Generate unique payment comment
2. Show TON wallet address + amount + comment
3. Backend monitors blockchain for payment
4. On confirmation → activate subscription

---

## 4. Bot Commands Structure

### User Commands:
| Command | Description |
|---------|-------------|
| `/start` | Welcome + register user |
| `/subscribe` | Show available plans |
| `/account` | Current subscription status |
| `/servers` | List available locations |
| `/connect` | Get subscription link |
| `/support` | Help and FAQ |

### Admin Commands:
| Command | Description |
|---------|-------------|
| `/stats` | User/revenue analytics |
| `/broadcast <msg>` | Send to all users |
| `/addserver` | Register new VPN server |
| `/ban <user_id>` | Ban user |
| `/gift <user_id> <days>` | Add free days |

---

## 5. Subscription Link Generation

### VLESS + WebSocket Format
```
vless://{uuid}@{domain}:443?encryption=none&type=ws&host={domain}&path={ws_path}&security=tls&sni={domain}#{server_name}
```

### VLESS + gRPC Format
```
vless://{uuid}@{domain}:443?encryption=none&type=grpc&serviceName={grpc_service}&security=tls&sni={domain}#{server_name}
```

### Example (Frankfurt WebSocket)
```
vless://abc123-uuid@de.myvpn.xyz:443?encryption=none&type=ws&host=de.myvpn.xyz&path=/ws-secret&security=tls&sni=de.myvpn.xyz#Frankfurt-DE
```

### Bot Flow
1. Generate unique UUID for user
2. Create client in 3x-ui via API
3. Build subscription URL (WebSocket or gRPC based on server config)
4. Store in database
5. Return to user as:
   - Clickable link
   - QR code image
   - Copy-paste text

---

## 6. Admin Web Dashboard

**Stack:** Next.js pages in same Vercel project

**Routes:**
- `/admin` - Dashboard with stats
- `/admin/users` - User list, search, ban
- `/admin/servers` - Server management
- `/admin/payments` - Payment history
- `/admin/settings` - Bot configuration

**Auth:** Simple password or Telegram Login Widget

---

## 7. Domain & Cloudflare Strategy

All traffic routes through Cloudflare for DDoS protection and IP hiding.

### Architecture
```
User → Cloudflare (orange cloud) → VPN Server
                ↓
        - DDoS protection
        - Server IP hidden
        - Traffic looks like HTTPS to website
```

### Domain Setup
1. Purchase domain (~$10/year): e.g., `myvpn.xyz`
2. Add to Cloudflare (free plan works)
3. Create subdomains per location (all proxied - orange cloud):

| Subdomain | Points to | Cloudflare | Purpose |
|-----------|-----------|------------|---------|
| `de.myvpn.xyz` | Frankfurt server IP | Proxied (orange) | VPN + landing page |
| `us.myvpn.xyz` | New York server IP | Proxied (orange) | VPN + landing page |
| `sg.myvpn.xyz` | Singapore server IP | Proxied (orange) | VPN + landing page |
| `panel-de.myvpn.xyz` | Frankfurt server IP | DNS only (gray) | 3x-ui admin panel |

### Cloudflare Settings
- SSL/TLS: **Full (strict)**
- Always Use HTTPS: **On**
- WebSockets: **Enabled** (Settings → Network)
- gRPC: **Enabled** (Settings → Network)

### Camouflage Landing Page
Each server hosts a boring enterprise site at root path:
```
https://de.myvpn.xyz/           → Landing page (nginx)
https://de.myvpn.xyz/ws-path    → VLESS WebSocket (Xray)
https://de.myvpn.xyz/grpc-path  → VLESS gRPC (Xray)
```

**Landing page content:** Generic enterprise SaaS (details TBD)

*(Schema already includes domain, ws_path, grpc_service fields - see Section 2)*

---

## 8. Server Provisioning

**Recommended providers:** Hetzner, DigitalOcean, Vultr, OVH

### Server Stack
```
┌─────────────────────────────────────────┐
│  Nginx (port 443)                       │
│  ├── /            → Landing page        │
│  ├── /ws-path     → Xray WebSocket      │
│  └── /grpc-path   → Xray gRPC           │
├─────────────────────────────────────────┤
│  Xray-core (via 3x-ui)                  │
│  ├── WebSocket inbound (127.0.0.1:10001)│
│  └── gRPC inbound (127.0.0.1:10002)     │
├─────────────────────────────────────────┤
│  3x-ui Panel (port 2053)                │
└─────────────────────────────────────────┘
```

### Setup Steps

**1. Install 3x-ui:**
```bash
bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)
```

**2. Install Nginx + Certbot:**
```bash
apt install nginx certbot python3-certbot-nginx -y
```

**3. Get SSL certificate (before enabling CF proxy):**
```bash
# Temporarily set Cloudflare to DNS-only (gray cloud)
certbot --nginx -d de.myvpn.xyz
# Then enable Cloudflare proxy (orange cloud)
```

**4. Configure Nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name de.myvpn.xyz;

    ssl_certificate /etc/letsencrypt/live/de.myvpn.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/de.myvpn.xyz/privkey.pem;

    # Landing page (camouflage)
    location / {
        root /var/www/html;
        index index.html;
    }

    # VLESS WebSocket
    location /ws-secretpath {
        proxy_pass http://127.0.0.1:10001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # VLESS gRPC
    location /grpc-secretpath {
        grpc_pass grpc://127.0.0.1:10002;
        grpc_set_header X-Real-IP $remote_addr;
    }
}
```

**5. Configure 3x-ui Inbounds:**

WebSocket inbound:
- Protocol: VLESS
- Listen IP: 127.0.0.1
- Port: 10001
- Transport: WebSocket
- Path: /ws-secretpath

gRPC inbound:
- Protocol: VLESS
- Listen IP: 127.0.0.1
- Port: 10002
- Transport: gRPC
- Service name: grpc-secretpath

**6. Add landing page:**
```bash
# Place your enterprise landing page HTML here
/var/www/html/index.html
```

**7. Firewall (only expose necessary ports):**
```bash
ufw allow 22      # SSH
ufw allow 443     # HTTPS (Nginx)
ufw allow 2053    # 3x-ui panel (consider restricting to your IP)
ufw enable
```

### Server Locations
- Frankfurt, DE (Europe)
- Amsterdam, NL (Europe)
- New York, US (Americas)
- Singapore (Asia)
- Tokyo, JP (Asia)

---

## 9. Security Considerations

1. **Cloudflare Protection:**
   - All VPN domains proxied (orange cloud) - server IPs hidden
   - DDoS protection included
   - WAF rules can block suspicious traffic
   - 3x-ui panel domains NOT proxied (gray cloud) - access via IP or restricted domain

2. **Secrets Management:**
   - Store in Vercel environment variables
   - Encrypt 3x-ui passwords in database
   - Randomize WS/gRPC paths per server (not guessable)

3. **API Protection:**
   - Validate Telegram webhook secret
   - Admin routes require authentication
   - Rate limiting on payment endpoints

4. **Database:**
   - Use Neon connection pooling
   - Prepared statements (Drizzle handles this)

5. **VPN Servers:**
   - Firewall: only expose port 443 (nginx) + 2053 (3x-ui, restrict to admin IP)
   - Fail2ban for SSH protection
   - Regular security updates
   - Nginx handles TLS termination

---

## 10. Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Initialize Vercel + TypeScript project
- [ ] Set up Neon database + Drizzle schema
- [ ] Basic bot with /start, /subscribe, /account
- [ ] Single server integration with 3x-ui
- [ ] Telegram Stars payment

### Phase 2: Full Features
- [ ] Multi-server support with location selection
- [ ] TON payment integration
- [ ] Subscription link generation + QR codes
- [ ] Auto-expiry handling (cron job)

### Phase 3: Admin & Polish
- [ ] Admin bot commands
- [ ] Web admin dashboard
- [ ] Usage statistics and analytics
- [ ] Broadcast messaging

### Phase 4: Production Hardening
- [ ] Error monitoring (Sentry)
- [ ] Logging and alerting
- [ ] Backup strategy
- [ ] Load testing

---

## 11. Verification & Testing

1. **Bot Testing:**
   - Create test Telegram bot
   - Test all commands manually
   - Verify payment flows with Telegram test mode

2. **3x-ui Integration:**
   - Set up test server
   - Verify client creation/deletion
   - Test subscription URL works in v2rayNG

3. **Database:**
   - Run migrations on Neon
   - Test all CRUD operations
   - Verify foreign key constraints

4. **End-to-End:**
   - Complete purchase flow with Telegram Stars
   - Connect to VPN with generated link
   - Verify traffic tracking

---

## 12. Files to Create (in order)

1. `package.json` - Dependencies
2. `tsconfig.json` - TypeScript config
3. `vercel.json` - Vercel deployment config
4. `drizzle.config.ts` - Database config
5. `src/db/schema.ts` - Database schema
6. `src/db/index.ts` - Database connection
7. `src/bot/index.ts` - Bot initialization
8. `api/webhook.ts` - Vercel webhook handler
9. `src/bot/commands/start.ts` - Start command
10. `src/services/xui.ts` - 3x-ui client
11. Continue with remaining files...
