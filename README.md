# VPN Telegram Bot

A production-ready VPN service manager with a Telegram bot interface and admin dashboard. Users subscribe to VPN plans, pay via Telegram Stars or TON, and get VLESS Reality connections across multiple server locations.

Built for regions with active VPN blocking (China, Iran, Russia) using VLESS Reality protocol with TLS fingerprint camouflage.

## Tech Stack

- **Runtime:** Node.js on Vercel (serverless)
- **Language:** TypeScript (ES Modules)
- **Database:** Neon PostgreSQL + Drizzle ORM
- **Bot Framework:** grammy
- **Admin Dashboard:** React + Tailwind CSS + Vite
- **VPN Panel:** 3x-ui (VLESS Reality protocol)
- **DNS:** Cloudflare

## Features

### Telegram Bot
- `/start` — Onboarding with automatic 7-day free trial
- `/subscribe` — Browse and purchase VPN plans
- `/account` — View subscription status and traffic usage
- `/servers` — List available server locations
- `/connect` — Get VLESS connection config for a server

### Admin Dashboard
- Real-time stats (users, subscriptions, revenue, servers)
- User management (search, ban)
- Subscription and plan management
- Server CRUD with encrypted credentials
- Payment history and revenue tracking

### Payments
- **Telegram Stars** — Native Telegram payments
- **TON** — Telegram Open Network blockchain

### Automated Jobs
- **Traffic sync** — Daily sync of traffic usage from all 3x-ui servers (12 PM UTC)
- **Subscription cleanup** — Expire subscriptions, remove 3x-ui clients, notify users (12 AM UTC)

### Security
- Telegram OAuth authentication
- JWT tokens (24h expiry) for admin API
- CSRF protection (double-submit cookie)
- AES-256 encryption for stored credentials
- Structured JSON logging

## Project Structure

```
src/
├── admin/          # React admin dashboard (pages, components, API client)
├── bot/            # Telegram bot (commands, callbacks, middleware)
├── services/       # Business logic (traffic sync, subscriptions, 3x-ui client)
├── db/             # Drizzle schema, connection, migrations
└── lib/            # JWT, crypto, logging, validators
api/                # Vercel serverless functions
├── webhook.ts      # Telegram webhook handler
├── admin/          # Admin API routes (auth, users, plans, servers, etc.)
├── servers/        # Server registration endpoint
└── cron/           # Scheduled jobs (traffic sync, cleanup)
tests/              # Vitest test suite
drizzle/            # Migration files
```

## Setup

### Prerequisites

- Node.js 18+
- Neon PostgreSQL database
- Telegram bot token (via [@BotFather](https://t.me/BotFather))
- One or more servers running [3x-ui](https://github.com/MHSanaei/3x-ui)

### Environment Variables

```env
# Telegram
BOT_TOKEN=
TEST_BOT_TOKEN=              # optional
TELEGRAM_TEST_ENV=false

# Database
DATABASE_URL=postgresql://user:pass@db.neon.tech/dbname

# Security
ENCRYPTION_KEY=              # 32-char AES key
JWT_SECRET=                  # 32-char secret
CRON_SECRET=                 # secret for cron job auth

# Cloudflare
CF_API_TOKEN=
CF_ZONE_ID=

# 3x-ui defaults
XUI_USER=
XUI_PASS=

# Server registration
API_ENDPOINT=https://your-app.vercel.app/api/servers/register
API_TOKEN=
```

### Install & Run

```bash
npm install

# Database
npm run db:generate    # Generate migrations
npm run db:migrate     # Apply migrations
npm run db:studio      # Open Drizzle Studio

# Development
npm run admin:dev      # Admin dashboard dev server

# Tests
npm run test           # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

### Deploy

Deployed on Vercel. The build step runs migrations and builds the admin dashboard:

```bash
npm install && npm run db:migrate && npm run admin:build
```

Cron jobs are configured in `vercel.json` for daily traffic sync and subscription cleanup.

## VPN Server Setup

Deploy and register VPN servers using the automated deployment scripts. See [scripts/README.md](scripts/README.md) for quick start and usage, and [scripts/SETUP-SCRIPT.md](scripts/SETUP-SCRIPT.md) for a detailed technical reference of each setup step.

```bash
# Quick deploy
cp scripts/deploy.conf.example scripts/deploy.conf
# Edit deploy.conf with your credentials
./scripts/deploy.sh root@YOUR_SERVER_IP your-domain.com
```

## Database

7 tables managed by Drizzle ORM:

| Table | Purpose |
|-------|---------|
| `users` | Telegram users (admin flag, ban status, trial tracking) |
| `plans` | Subscription tiers (price, duration, traffic limit, max devices) |
| `subscriptions` | Active subscriptions (status, dates, traffic used) |
| `payments` | Transaction history (Stars/TON, status) |
| `servers` | VPN servers (host, 3x-ui credentials, Reality config) |
| `userConnections` | Maps subscriptions to servers with per-connection traffic |

## License

Private.
