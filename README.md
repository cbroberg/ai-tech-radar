# AI Tech Radar

Autonomous daily AI tech intelligence scanner. Runs every morning at 08:00 DK time, scans 27 curated sources, processes with Claude AI, and delivers a formatted digest to Discord. Weekly HTML summary via email every Monday.

Live: **https://ai-tech-radar.fly.dev**

---

## What It Does

1. **Scans 27 sources** — RSS feeds, REST/GraphQL APIs, web scrapes (~23 seconds)
2. **Deduplicates** — URL uniqueness via DB constraint + Jaccard title similarity
3. **Scores with Claude** — batch prompts, 25 articles/call, ~8 calls/day → relevance 0.0–1.0
4. **Filters** — keeps articles with score ≥ 0.4 (typically ~40–70 of ~200 raw items)
5. **Summarizes** — top 20 articles get a 2–3 sentence Claude summary
6. **Posts to Discord** — rich embeds grouped by category (AI, Stack, DevOps, Trending)
7. **Sends email** — weekly HTML digest via Resend every Monday

---

## Sources

| Category | Sources |
|----------|---------|
| Community | Hacker News, Reddit (/r/programming, /r/nextjs, /r/selfhosted), Lobste.rs, Indie Hackers |
| Dev platforms | Dev.to, Hashnode, Product Hunt, GitHub Trending (JS/TS/Python), npm Trending |
| Search | Google Search via Serper.dev (5 daily queries) |
| Stack releases | Next.js, React, Bun, Supabase, Fly.io, Cloudflare, Docker, Vercel, PostgreSQL, BullMQ, Drizzle ORM |
| AI & Industry | Anthropic, OpenAI, The Verge (AI), TechCrunch (AI), TLDR, Changelog, Import AI |

---

## Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Runtime | [Bun](https://bun.sh) | Built-in SQLite, fast startup |
| Web framework | Express.js | Health check + admin API |
| Scheduler | node-cron | In-process, no external dependency |
| Database | SQLite via Bun + Drizzle ORM | Persisted on Fly.io volume |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) | Scoring, summarization, digest intro |
| Search | Serper.dev | Google Search results (2,500 free queries) |
| Hosting | Fly.io — Stockholm region (`arn`) | Always-on, ~$2.40/month |
| Daily digest | Discord webhook | Rich embeds per category |
| Weekly digest | Resend | HTML email, free tier |

---

## Project Structure

```
ai-tech-radar/
├── src/
│   ├── index.js                 # Express server, cron wiring, scan pipeline
│   ├── config.js                # All env vars in one place
│   ├── scheduler.js             # node-cron daily + weekly jobs
│   ├── orchestrator.js          # Runs all scrapers in 3 parallel batches
│   │
│   ├── scrapers/
│   │   ├── base-scraper.js      # Retry logic, timeout, response normalization
│   │   ├── rss-generic.js       # Generic RSS scraper (17 feeds)
│   │   ├── hackernews.js        # HN Firebase API — top 30 stories
│   │   ├── devto.js             # Dev.to REST API — 6 tags × 10 articles
│   │   ├── producthunt.js       # Product Hunt GraphQL — today's top 20
│   │   ├── hashnode.js          # Hashnode GraphQL — trending feed
│   │   ├── github-trending.js   # Cheerio scrape — JS/TS/Python
│   │   ├── github-releases.js   # GitHub Releases API — 6 repos
│   │   ├── google-search.js     # Serper.dev — 5 searches × 10 results
│   │   ├── indie-hackers.js     # Cheerio scrape
│   │   └── npm-trending.js      # npm registry search — 7 keywords
│   │
│   ├── processors/
│   │   ├── dedup.js             # Jaccard title similarity (threshold 0.65)
│   │   ├── relevance-scorer.js  # Claude batch scoring + categorization
│   │   └── summarizer.js        # Claude summaries for top 20 articles
│   │
│   ├── digest/
│   │   ├── builder.js           # Groups by category, sorts by score, Claude intro
│   │   ├── discord.js           # Discord embed formatter + webhook sender
│   │   └── email-weekly.js      # Weekly HTML email builder + Resend sender
│   │
│   └── db/
│       ├── client.js            # Bun SQLite + Drizzle client (WAL mode)
│       ├── migrate.js           # Auto-runs on startup, seeds keywords
│       ├── schema.js            # Drizzle schema definitions
│       ├── articles.js          # Article CRUD
│       ├── digests.js           # Digest CRUD + weekly article query
│       └── source-runs.js       # Per-source run monitoring
│
├── scripts/
│   └── fly-secrets-sync.sh      # Sync .env → Fly.io secrets
│
├── Dockerfile
├── fly.toml
├── package.json
└── .env.example
```

---

## Local Setup

### Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`

### Install

```bash
git clone https://github.com/cbroberg/ai-tech-radar.git
cd ai-tech-radar
bun install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your values
```

**Required:**

| Variable | Where to get it |
|----------|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `DISCORD_WEBHOOK_URL` | Discord channel → Integrations → Webhooks → New Webhook |
| `ADMIN_TOKEN` | Any random string — `openssl rand -hex 32` |

**Optional (gracefully skipped if not set):**

| Variable | Purpose |
|----------|---------|
| `SERPER_API_KEY` | Google Search results via [serper.dev](https://serper.dev) — 2,500 free queries |
| `RESEND_API_KEY` | Weekly email via [resend.com](https://resend.com) — free up to 3,000/month |
| `NOTIFICATION_EMAIL` | Where weekly emails are sent |
| `PRODUCTHUNT_TOKEN` | Product Hunt GraphQL access |
| `DEVTO_API_KEY` | Higher rate limits on Dev.to API |

### Run

```bash
bun run dev        # With file watching
bun run start      # Production mode
```

The app creates `./data/radar.db` automatically on first run.

---

## Fly.io Deployment

### First-time setup

```bash
# 1. Install flyctl
brew install flyctl

# 2. Login — verify you're on the right account
fly auth login
fly auth whoami

# 3. Create app (personal org)
fly apps create ai-tech-radar --org personal

# 4. Create persistent SQLite volume (Stockholm region)
fly volumes create radar_data --app ai-tech-radar --region arn --size 1

# 5. Set secrets from .env in one command
bun run secrets
# (or manually: fly secrets set ANTHROPIC_API_KEY=... --app ai-tech-radar)

# 6. Deploy
fly deploy --app ai-tech-radar

# 7. Verify
curl https://ai-tech-radar.fly.dev/health
fly logs --app ai-tech-radar
```

### Re-deploy after code changes

```bash
git push origin main && fly deploy --app ai-tech-radar
```

### Sync updated secrets

```bash
# Edit .env with new values, then:
bun run secrets
```

---

## API Reference

All `POST` endpoints require `Authorization: Bearer <ADMIN_TOKEN>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | App status, schedule, DB article count, uptime |
| `GET` | `/api/articles` | Scored articles — query params: `?min_score=0.5&limit=20` |
| `GET` | `/api/digest/today` | Today's digest record |
| `GET` | `/api/digest/latest` | Most recent digest record |
| `GET` | `/api/sources/status` | Latest run status per source |
| `POST` | `/api/scan/trigger` | Trigger a full daily scan immediately |
| `POST` | `/api/weekly/trigger` | Trigger weekly email immediately |

### Examples

```bash
# Health check
curl https://ai-tech-radar.fly.dev/health

# Top 10 AI articles today
curl "https://ai-tech-radar.fly.dev/api/articles?min_score=0.7&limit=10"

# Source monitoring
curl https://ai-tech-radar.fly.dev/api/sources/status

# Manual scan
curl -X POST https://ai-tech-radar.fly.dev/api/scan/trigger \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Manual weekly email
curl -X POST https://ai-tech-radar.fly.dev/api/weekly/trigger \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## Daily Pipeline

```
06:00 UTC (08:00 DK) — Daily scan
│
├─ Batch 1: 17 RSS feeds in parallel         (~10s)
├─ Batch 2: 7 API sources in parallel        (~15s)
└─ Batch 3: 2 web scrapes, sequential        (~8s)
   │
   └─ ~200-500 raw articles saved to SQLite
      │
      ├─ Title dedup (Jaccard similarity ≥ 0.65)
      │
      ├─ Claude batch scoring (25 articles/call)
      │   → score 0.0–1.0 + categories + tags per article
      │   → filter: keep score ≥ 0.4 (~40–70 articles)
      │
      ├─ Claude summarization (top 20, parallel)
      │   → 2–3 sentence summaries
      │
      └─ Discord digest (grouped by category, sorted by score)

07:00 UTC Monday — Weekly summary
│
├─ Claude: generate weekly themes from top 60 articles
├─ Build responsive HTML email
├─ Send via Resend → NOTIFICATION_EMAIL
└─ Post summary to Discord
```

---

## Cost

| Service | Plan | Monthly |
|---------|------|---------|
| Fly.io (shared-cpu-1x, 512MB, always-on) | Pay-as-you-go | ~$2.24 |
| Fly.io volume (1GB SQLite) | Pay-as-you-go | ~$0.15 |
| Anthropic API (~25 Claude calls/day) | Pay-as-you-go | ~$3–8 |
| Serper.dev (5 queries/day = ~150/month) | 2,500 free queries | $0 |
| Resend (4 emails/month) | Free tier | $0 |
| Discord webhooks | Free | $0 |
| **Total** | | **~$5–10/month** |

> Serper's 2,500 free queries last ~16 months at 5/day.

---

## License

MIT
