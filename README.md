# AI Tech Radar

Autonomous daily AI tech intelligence scanner. Runs every morning at 08:00 DK time, scans 27 curated sources, processes results with Claude AI, and delivers a digest to Discord. Weekly summary via email every Monday.

## What It Does

- Scans **27 sources** daily: RSS feeds, REST/GraphQL APIs, web scrapes
- Processes ~200 raw items → ~40 relevant via Claude AI scoring
- Delivers formatted digest to **Discord** (daily) and **email** (weekly)
- Archives everything in **Supabase** for historical search

## Sources

| Category | Sources |
|----------|---------|
| Community | Hacker News, Product Hunt, Dev.to, Hashnode, Indie Hackers, Reddit, Lobste.rs |
| Search | Google Search (via Serper.dev), GitHub Trending, npm Trending |
| Stack releases | Next.js, React, Supabase, Fly.io, Cloudflare, Docker, Bun, Vercel, PostgreSQL, BullMQ |
| AI & Industry | Anthropic, OpenAI, The Verge, TechCrunch, TLDR, Changelog, Import AI |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Bun |
| Framework | Express.js |
| Scheduler | node-cron |
| Database | Supabase (PostgreSQL) |
| AI | Anthropic Claude API |
| Search | Serper.dev |
| Hosting | Fly.io (Stockholm, `arn`) |
| Notifications | Discord webhook + Resend email |

## Project Structure

```
src/
├── index.js              # Express server + cron setup
├── config.js             # Env vars, source config
├── scheduler.js          # node-cron job definitions
├── orchestrator.js       # Runs all scrapers in parallel batches
├── scrapers/             # One file per source type
├── processors/           # Claude AI: scoring, summarizing, categorizing, dedup
├── digest/               # Digest builder, Discord + email formatters
└── db/                   # Supabase client + CRUD + migrations
```

## Setup

### 1. Clone and install

```bash
git clone https://github.com/cbroberg/ai-tech-radar.git
cd ai-tech-radar
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in all values in .env
```

Required keys:
- `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com)
- `DISCORD_WEBHOOK_URL` — Discord channel → Integrations → Webhooks → New Webhook

Optional:
- `SERPER_API_KEY` — [serper.dev](https://serper.dev) (2,500 free queries)
- `PRODUCTHUNT_TOKEN` — [api.producthunt.com](https://api.producthunt.com)
- `DEVTO_API_KEY` — dev.to settings
- `RESEND_API_KEY` + `NOTIFICATION_EMAIL` — [resend.com](https://resend.com) (weekly email)

Database is SQLite — created automatically on first run. No setup needed.

### 3. Run locally

```bash
bun run src/index.js
```

## Deploy to Fly.io (personal account)

```bash
# 1. Install flyctl
brew install flyctl

# 2. Login — make sure you're on your personal account, not an org
fly auth login
fly auth whoami   # verify

# 3. Create app on personal account
fly apps create ai-tech-radar --org personal

# 4. Create persistent volume for SQLite (1 GB, Stockholm region)
fly volumes create radar_data --app ai-tech-radar --region arn --size 1

# 5. Set secrets
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  ADMIN_TOKEN=$(openssl rand -hex 32) \
  --app ai-tech-radar

# Optional secrets (skip if you don't have them yet)
fly secrets set \
  SERPER_API_KEY=... \
  RESEND_API_KEY=re_... \
  NOTIFICATION_EMAIL=you@example.com \
  PRODUCTHUNT_TOKEN=... \
  DEVTO_API_KEY=... \
  --app ai-tech-radar

# 6. Deploy
fly deploy --app ai-tech-radar

# 7. Verify
fly logs --app ai-tech-radar
curl https://ai-tech-radar.fly.dev/health

# 8. Trigger a manual scan to test (use the ADMIN_TOKEN you set above)
curl -X POST https://ai-tech-radar.fly.dev/api/scan/trigger \
  -H "Authorization: Bearer <your-admin-token>"
```

## API Endpoints

```
GET  /health              → { status, lastRun, nextRun }
GET  /api/digest/today    → Today's digest
GET  /api/digest/latest   → Most recent digest
POST /api/scan/trigger    → Manual scan trigger (auth required)
GET  /api/articles        → Articles (?category=ai&min_score=0.7)
GET  /api/sources/status  → All source run statuses
```

## Daily Schedule

```
06:00 UTC  Daily scan starts (08:00 DK)
           ↓ Scan 27 sources (~60-90s)
           ↓ Dedup (~200 → ~120 unique)
           ↓ Claude scoring (~120 → ~40 relevant)
           ↓ Summarize top 20 articles
           ↓ Build digest
06:30 UTC  Post to Discord (08:30 DK)

Monday 07:00 UTC  Weekly email via Resend
```

## Estimated Cost

| Service | Cost/month |
|---------|-----------|
| Fly.io (shared-cpu-1x, 512MB) | ~$3-5 |
| Anthropic API | ~$5-15 |
| Supabase | $0 (free tier) |
| Serper.dev | $0 (2,500 free queries ≈ 16 months) |
| Resend | $0 (free tier) |
| **Total** | **~$8-20** |

## Implementation Status

- [ ] Phase 1: Foundation (Express, cron, Dockerfile, Fly.io deploy)
- [ ] Phase 2: Scrapers (all 27 sources)
- [ ] Phase 3: AI Processing (Claude scoring, summarizing, categorizing)
- [ ] Phase 4: Digest & Delivery (Discord, email)
- [ ] Phase 5: Polish & Production deploy

## License

MIT
