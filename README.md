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
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — [supabase.com](https://supabase.com)
- `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com)
- `DISCORD_WEBHOOK_URL` — Discord channel → Integrations → Webhooks
- `SERPER_API_KEY` — [serper.dev](https://serper.dev) (2,500 free queries)
- `PRODUCTHUNT_TOKEN` — [api.producthunt.com](https://api.producthunt.com)
- `DEVTO_API_KEY` — dev.to settings
- `RESEND_API_KEY` — [resend.com](https://resend.com)

### 3. Run database migrations

```bash
# Run src/db/migrations/001_initial.sql in Supabase SQL editor
```

### 4. Run locally

```bash
bun run src/index.js
```

## Deploy to Fly.io

```bash
# One-time setup
fly launch --name ai-tech-radar --region arn --no-deploy

# Set secrets
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_KEY=eyJ... \
  SERPER_API_KEY=... \
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  RESEND_API_KEY=re_... \
  PRODUCTHUNT_TOKEN=... \
  DEVTO_API_KEY=... \
  NOTIFICATION_EMAIL=you@example.com

# Deploy
fly deploy
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
