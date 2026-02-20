# AI Tech Radar — Daily Tech Intelligence Scanner

## Purpose

Autonomous service running daily, scanning curated sources for news, trends, and techniques in AI programming, autonomous orchestration, and developer tooling. Results delivered as a daily digest via Discord and a weekly summary via email, archived in Supabase for historical search.

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Bun (ES modules) | Fast execution, modern JS runtime |
| Framework | Express.js (minimal) | Health check endpoint + manual trigger |
| Scheduler | node-cron | In-process scheduling, no external dependency |
| Database | Supabase (PostgreSQL) | Article archive, dedup, search, vector embeddings |
| AI/LLM | Anthropic Claude API (claude-sonnet-4-5) | Summarization, relevance scoring, categorization |
| Search API | Serper.dev | Google Search results, 2,500 free queries then pay-as-you-go |
| Hosting | Fly.io (Stockholm region, `arn`) | Co-located with Supabase, autonomous operation |
| DNS/Proxy | Cloudflare | DNS management for API endpoint |
| Notifications | Discord webhook (daily) + Resend email (weekly) | Real-time + digest delivery |
| Secrets | dotenv (local) / `fly secrets` (production) | Standard secrets management |

### Why No BullMQ / Redis in v1

BullMQ requires Redis and adds infrastructure complexity for minimal benefit here. Our workload is a single daily batch job scanning ~27 sources — running scrapers with `Promise.allSettled()` in parallel batches completes in 2-3 minutes. Adding queues, retry logic, and a Redis dependency is overkill for v1.

**Revisit in v2 if:** we add real-time scanning, webhook-triggered jobs, or the source count exceeds 50+.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Fly.io (arn)                     │
│                                                   │
│  ┌──────────┐    ┌───────────┐                   │
│  │ Express  │    │ node-cron │                   │
│  │ (health) │    │ (06:00)   │                   │
│  └──────────┘    └─────┬─────┘                   │
│                        │                          │
│                        ▼                          │
│              ┌──────────────────┐                 │
│              │ Scan Orchestrator│                  │
│              │(Promise.allSettled)                │
│              └────────┬─────────┘                 │
│                       │                           │
│         ┌─────────────┼─────────────┐            │
│         ▼             ▼             ▼            │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│   │RSS Batch │ │API Scrape│ │Web Scrape│        │
│   │(~15 src) │ │(~8 src)  │ │(~4 src)  │        │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│        └─────────────┼─────────────┘              │
│                      ▼                            │
│              ┌──────────────┐                     │
│              │  Dedup +     │                     │
│              │  Claude AI   │                     │
│              │  Processing  │                     │
│              └──────┬───────┘                     │
│                     │                             │
└─────────────────────┼─────────────────────────────┘
                      ▼
          ┌───────────────────────┐
          │      Supabase (arn)   │
          │   articles / digests  │
          └───────────┬───────────┘
                      │
            ┌─────────┴─────────┐
            ▼                   ▼
      ┌──────────┐       ┌──────────┐
      │ Discord  │       │  Resend  │
      │ (daily)  │       │ (weekly) │
      └──────────┘       └──────────┘
```

---

## Sources & Scraping Strategies

### Community & News Sources

| # | Source | Method | Data | Auth |
|---|--------|--------|------|------|
| 1 | **Hacker News** | REST API (`/v0/topstories`) | Top 30 stories, keyword filtered | None |
| 2 | **Product Hunt** | GraphQL API | Daily top posts in "Developer Tools" + "AI" | OAuth token |
| 3 | **Dev.to** | REST API (`/api/articles`) | Articles tagged: ai, nextjs, react, devops | API key |
| 4 | **Hashnode** | GraphQL API | Trending posts in relevant tags | None |
| 5 | **Indie Hackers** | Web scrape (Cheerio) | Front page posts, filtered | Respectful scraping |
| 6 | **GitHub Trending** | Web scrape | Top 25 repos in JS/TS/Python | None |
| 7 | **Google Search** | Serper.dev API | 5 daily searches × 10 results | API key |
| 8 | **npm Trending** | API | Top 20 packages/week | None |
| 9 | **Lobste.rs** | RSS feed | Quality tech discussions | None |
| 10 | **Reddit** | RSS (`/r/programming`, `/r/nextjs`, `/r/selfhosted`) | Top daily posts | None |

> **LinkedIn & Instagram:** Both platforms aggressively block scraping. Instead, we monitor their official engineering blogs via RSS (included below). For real-time tech discourse, Reddit and Hacker News provide better signal anyway.

### Official Release Sources (Stack Technologies)

| # | Source | Method | What We Track |
|---|--------|--------|---------------|
| 11 | **Supabase Blog** | RSS (`supabase.com/blog/rss.xml`) | New features, database updates |
| 12 | **PostgreSQL News** | RSS (`postgresql.org/news.rdf`) | Releases, security patches |
| 13 | **Cloudflare Blog** | RSS (`blog.cloudflare.com/rss`) | Workers updates, new products |
| 14 | **Fly.io Blog** | RSS (`fly.io/blog/feed.xml`) | Platform updates, new regions |
| 15 | **Next.js** | GitHub Releases API (`vercel/next.js`) | Framework releases, breaking changes |
| 16 | **React Blog** | RSS (`react.dev/blog`) | Core updates, RFCs |
| 17 | **Docker Blog** | RSS (`docker.com/blog/feed`) | Engine releases, Compose updates |
| 18 | **BullMQ** | GitHub Releases API (`taskforcesh/bullmq`) | New versions |
| 19 | **Vercel Blog** | RSS (`vercel.com/blog/rss.xml`) | Platform + AI SDK updates |
| 20 | **Bun** | GitHub Releases API (`oven-sh/bun`) | Runtime updates |

### AI & Industry Sources

| # | Source | Method | Rationale |
|---|--------|--------|-----------|
| 21 | **Anthropic Blog** | RSS | Claude API updates, new models |
| 22 | **OpenAI Blog** | RSS | GPT updates, API changes |
| 23 | **The Verge** | RSS (AI section) | Broad AI industry trends |
| 24 | **TechCrunch** | RSS (AI section) | Startup + AI funding news |
| 25 | **TLDR Newsletter** | RSS/scrape | Curated daily tech news |
| 26 | **Changelog** | RSS (`changelog.com/feed`) | Developer-focused news |
| 27 | **Import AI (Jack Clark)** | RSS | Weekly AI industry overview |

**Total: 27 sources** — ~15 via RSS (batch), ~8 via REST/GraphQL API, ~4 via web scrape

---

## Supabase Database Schema

```sql
-- Articles/items from all sources
CREATE TABLE articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  source_url TEXT UNIQUE NOT NULL,       -- Dedup key
  title TEXT NOT NULL,
  summary TEXT,                          -- AI-generated summary (2-3 sentences)
  content_snippet TEXT,                  -- First 500 chars of original content
  relevance_score FLOAT,                -- 0.0-1.0 Claude-assessed relevance
  categories TEXT[],                     -- ['ai', 'nextjs', 'devops', 'orchestration']
  tags TEXT[],
  author VARCHAR(255),
  published_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  digest_included BOOLEAN DEFAULT FALSE,
  embedding VECTOR(1536)                -- For semantic search (pgvector, phase 2)
);

CREATE INDEX idx_articles_source ON articles(source);
CREATE INDEX idx_articles_relevance ON articles(relevance_score DESC);
CREATE INDEX idx_articles_scraped ON articles(scraped_at DESC);
CREATE INDEX idx_articles_categories ON articles USING GIN(categories);

-- Daily digests
CREATE TABLE digests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  digest_type VARCHAR(10) DEFAULT 'daily', -- 'daily' or 'weekly'
  article_count INTEGER,
  top_story_id UUID REFERENCES articles(id),
  summary_markdown TEXT,
  discord_message_id VARCHAR(100),
  email_sent_at TIMESTAMPTZ
);

-- Source run monitoring
CREATE TABLE source_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running',  -- running, success, failed
  items_found INTEGER DEFAULT 0,
  items_new INTEGER DEFAULT 0,
  error_message TEXT
);

-- Watch keywords (what we scan for)
CREATE TABLE watch_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  category VARCHAR(50),
  priority INTEGER DEFAULT 5,            -- 1-10, higher = more important
  active BOOLEAN DEFAULT TRUE
);

-- Seed default keywords
INSERT INTO watch_keywords (keyword, category, priority) VALUES
  ('autonomous agent', 'ai', 10),
  ('agentic', 'ai', 10),
  ('MCP server', 'ai', 9),
  ('Model Context Protocol', 'ai', 9),
  ('AI orchestration', 'ai', 9),
  ('Claude API', 'ai', 8),
  ('LLM', 'ai', 7),
  ('RAG', 'ai', 7),
  ('Next.js', 'stack', 8),
  ('React Server Components', 'stack', 8),
  ('Supabase', 'stack', 9),
  ('PostgreSQL', 'stack', 7),
  ('Fly.io', 'stack', 8),
  ('Docker', 'stack', 6),
  ('BullMQ', 'stack', 7),
  ('Cloudflare Workers', 'stack', 7),
  ('Bun runtime', 'stack', 7),
  ('Vercel', 'stack', 6),
  ('DevOps automation', 'devops', 8),
  ('CI/CD', 'devops', 6),
  ('container orchestration', 'devops', 7),
  ('platform engineering', 'devops', 7),
  ('SDLC automation', 'devops', 8),
  ('developer tools', 'trend', 6),
  ('AI coding', 'trend', 8),
  ('vibe coding', 'trend', 7),
  ('agentic commerce', 'trend', 9),
  ('AI SaaS', 'trend', 7);
```

---

## Project Structure

```
ai-tech-radar/
├── src/
│   ├── index.js                 # Express server + cron setup
│   ├── config.js                # Env vars, source config
│   ├── scheduler.js             # node-cron job definitions
│   │
│   ├── scrapers/
│   │   ├── base-scraper.js      # Abstract base class with retry + rate limiting
│   │   ├── rss-generic.js       # Generic RSS scraper (covers ~15 sources)
│   │   ├── hackernews.js        # HN API scraper
│   │   ├── devto.js             # Dev.to API scraper
│   │   ├── producthunt.js       # Product Hunt GraphQL
│   │   ├── hashnode.js          # Hashnode GraphQL
│   │   ├── github-trending.js   # GitHub trending page scrape
│   │   ├── github-releases.js   # GitHub Releases API (stack tech versions)
│   │   ├── google-search.js     # Serper.dev API
│   │   ├── indie-hackers.js     # Cheerio scrape
│   │   └── npm-trending.js      # npm registry API
│   │
│   ├── orchestrator.js          # Runs all scrapers in parallel batches
│   │
│   ├── processors/
│   │   ├── relevance-scorer.js  # Claude API: scores articles 0-1
│   │   ├── summarizer.js        # Claude API: generates summaries
│   │   ├── categorizer.js       # Claude API: tags and categorizes
│   │   └── dedup.js             # URL + title similarity dedup
│   │
│   ├── digest/
│   │   ├── builder.js           # Assembles daily/weekly digest
│   │   ├── discord.js           # Discord webhook formatter (embeds)
│   │   ├── email-weekly.js      # Weekly email template + Resend sender
│   │   └── templates/
│   │       └── weekly.html      # Email template (handlebars)
│   │
│   └── db/
│       ├── client.js            # Supabase client init
│       ├── articles.js          # Article CRUD
│       ├── digests.js           # Digest CRUD
│       └── migrations/
│           └── 001_initial.sql
│
├── Dockerfile
├── fly.toml
├── package.json
├── .env.example
├── .env
└── README.md
```

---

## Daily Flow (Pipeline)

```
06:00 UTC (08:00 DK time) — DAILY SCAN
│
├─ 1. SCAN PHASE (Promise.allSettled, 3 parallel batches)
│  │
│  │  Batch 1: RSS feeds (all at once)
│  │  ├─ Supabase, PostgreSQL, Cloudflare, Fly.io, Vercel
│  │  ├─ React, Docker, Anthropic, OpenAI
│  │  ├─ The Verge, TechCrunch, TLDR, Changelog
│  │  ├─ Import AI, Lobste.rs, Reddit
│  │  └─ ~15 feeds in ~10 seconds
│  │
│  │  Batch 2: API sources (parallel with delays)
│  │  ├─ Hacker News API → top 30 stories
│  │  ├─ Dev.to API → latest 50 articles
│  │  ├─ Product Hunt GraphQL → today's top 20
│  │  ├─ Hashnode GraphQL → trending 20
│  │  ├─ GitHub Releases API → version checks for 6 repos
│  │  ├─ Serper.dev → 5 searches × 10 results
│  │  └─ npm trending → top 20 packages
│  │
│  │  Batch 3: Web scrapes (sequential, respectful)
│  │  ├─ GitHub Trending → top 25 repos
│  │  └─ Indie Hackers → front page
│  │
│  └─ Total: ~200 raw items in ~60-90 seconds
│
├─ 2. DEDUP PHASE
│  └─ Remove duplicates via URL + title similarity
│     Typical: ~200 raw → ~120 unique
│
├─ 3. AI PROCESSING PHASE (sequential Claude calls)
│  ├─ Relevance scoring (batch prompt, all 120 items)
│  │   → Score each 0.0-1.0 for relevance
│  ├─ Filter: keep only score >= 0.4
│  │   Typical: ~120 → ~40 relevant
│  ├─ Summarize top 20 articles (2-3 sentences each)
│  └─ Categorize + tag all relevant articles
│
├─ 4. DIGEST BUILD PHASE
│  ├─ Group by category (AI, Stack, DevOps, Trends)
│  ├─ Sort by relevance_score
│  ├─ Generate digest intro (Claude)
│  └─ Format as Discord embeds
│
└─ 5. DELIVERY (~06:30 UTC / 08:30 DK)
   ├─ Post to Discord channel (daily)
   └─ Save digest to Supabase

──────────────────────────────────────────

Every Monday 07:00 UTC — WEEKLY SUMMARY
│
├─ Query top articles from past 7 days
├─ Generate weekly summary (Claude)
├─ Build HTML email from template
├─ Send via Resend
└─ Post weekly summary to Discord
```

---

## Discord Integration

### Webhook Message Format

Each daily digest posts as a rich embed to a designated Discord channel:

```
🔔 AI Tech Radar — Feb 20, 2025

📊 Scanned 27 sources | 142 items found | 38 relevant

🤖 AI & Agents (12 items)
━━━━━━━━━━━━━━━━━━━━━
⭐ [9.2] Anthropic launches MCP server marketplace
   New hosted MCP servers with one-click deploy...
   → https://anthropic.com/blog/...

⭐ [8.7] OpenAI releases Agents SDK v2
   Major rewrite with built-in tool orchestration...
   → https://openai.com/blog/...

🔧 [7.1] LangChain adds autonomous retry logic
   ...

🛠️ Stack Updates (8 items)
━━━━━━━━━━━━━━━━━━━━━
🆕 Next.js 15.3 released — new caching API
🆕 Supabase Edge Functions now support Bun
🆕 Bun v1.2.4 — 30% faster module resolution

📦 DevOps & Platform (6 items)
━━━━━━━━━━━━━━━━━━━━━
...

🔥 Trending (5 items)
━━━━━━━━━━━━━━━━━━━━━
...
```

### Discord Setup

1. Create a channel `#tech-radar` in your Discord server
2. Channel Settings → Integrations → Webhooks → New Webhook
3. Copy webhook URL → add to `DISCORD_WEBHOOK_URL` env var

---

## Configuration & Environment Variables

```bash
# .env.example

# --- Fly.io ---
FLY_APP_NAME=ai-tech-radar
FLY_REGION=arn

# --- Supabase ---
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# --- AI ---
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-5-20250929

# --- Search ---
SERPER_API_KEY=...                  # serper.dev — 2,500 free queries

# --- Source API Keys ---
PRODUCTHUNT_TOKEN=...               # developer.producthunt.com
DEVTO_API_KEY=...                   # dev.to/settings/extensions

# --- Notifications ---
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
RESEND_API_KEY=re_...               # resend.com (weekly email)
NOTIFICATION_EMAIL=christian@...

# --- Schedule ---
CRON_DAILY=0 6 * * *               # 06:00 UTC daily
CRON_WEEKLY=0 7 * * 1              # 07:00 UTC every Monday
TIMEZONE=Europe/Copenhagen
```

---

## Fly.io Deployment

### fly.toml

```toml
app = "ai-tech-radar"
primary_region = "arn"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  TZ = "Europe/Copenhagen"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false        # IMPORTANT: must run 24/7 for cron
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  grace_period = "30s"
  interval = "60s"
  method = "GET"
  path = "/health"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

### Dockerfile

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production

COPY src/ ./src/

EXPOSE 3000

CMD ["bun", "run", "src/index.js"]
```

### Deploy Commands

```bash
# Set secrets (one time)
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_KEY=eyJ... \
  SERPER_API_KEY=... \
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  RESEND_API_KEY=re_... \
  --app ai-tech-radar

# Deploy
fly deploy --app ai-tech-radar

# Check logs
fly logs --app ai-tech-radar

# Manual trigger (for testing)
curl https://ai-tech-radar.fly.dev/api/scan/trigger \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## API Endpoints (Express)

```
GET  /health              → { status: "ok", lastRun: "...", nextRun: "..." }
GET  /api/digest/today    → Today's digest as JSON
GET  /api/digest/latest   → Most recent digest
POST /api/scan/trigger    → Manual trigger of full scan (auth required)
GET  /api/articles        → List articles with filtering (?category=ai&min_score=0.7)
GET  /api/sources/status  → Status of all sources (last run info)
```

---

## Estimated Monthly Cost

| Service | Plan | Cost |
|---------|------|------|
| Fly.io (shared-cpu-1x, 512MB, always-on) | — | ~$3-5 |
| Supabase | Free tier | $0 |
| Anthropic API (~1500 calls/day × 30) | Pay-as-you-go | ~$5-15 |
| Serper.dev (5 queries/day = ~150/month) | 2,500 free then $1/1K | $0 (for months) |
| Resend (4 emails/month) | Free tier | $0 |
| Discord webhooks | Free | $0 |
| **Total** | | **~$8-20/month** |

> The 2,500 free Serper queries last ~16 months at 5 queries/day. After that, $50 buys another 50K queries (~27 years at current rate).

---

## Implementation Plan (Phases)

### Phase 1: Foundation (Day 1-2)
- [ ] Init project with `package.json`, ES modules, Bun
- [ ] Supabase project + run migrations (Stockholm region)
- [ ] Express server with `/health` endpoint
- [ ] node-cron skeleton with daily + weekly schedules
- [ ] Dockerfile + fly.toml + first deploy
- [ ] Discord webhook test message

### Phase 2: Scrapers (Day 3-5)
- [ ] Implement `base-scraper.js` with shared interface, retry, rate limiting
- [ ] RSS generic scraper (covers ~15 sources in one module)
- [ ] Hacker News API scraper
- [ ] Dev.to API scraper
- [ ] Product Hunt GraphQL scraper
- [ ] Hashnode GraphQL scraper
- [ ] GitHub Trending + Releases scrapers
- [ ] Google Search via Serper.dev
- [ ] npm trending scraper
- [ ] `orchestrator.js` — runs all scrapers in parallel batches

### Phase 3: AI Processing (Day 6-7)
- [ ] Relevance scoring with Claude (batch prompt)
- [ ] Summarization pipeline (top articles)
- [ ] Categorization + tagging
- [ ] Dedup logic (URL uniqueness + title similarity)

### Phase 4: Digest & Delivery (Day 8-9)
- [ ] Digest builder (grouping, sorting by category + score)
- [ ] Discord embed formatter + webhook sender
- [ ] Weekly email template (HTML)
- [ ] Resend integration for Monday emails
- [ ] Save digests to Supabase

### Phase 5: Polish & Deploy (Day 10)
- [ ] Error handling + graceful degradation per source
- [ ] Source monitoring via `/api/sources/status`
- [ ] Fly.io production deploy
- [ ] Full pipeline smoke test
- [ ] README documentation

### Phase 6: Future Enhancements
- [ ] Web dashboard (Next.js) to browse articles and configure keywords
- [ ] Semantic search via pgvector embeddings
- [ ] Weekly trend report with visual charts
- [ ] Add/remove sources dynamically via admin API
- [ ] RSS feed output (others can subscribe to your radar)
- [ ] Telegram or Slack bot integration
- [ ] BullMQ + Redis if workload grows beyond simple batches

---

## Claude Prompts (AI Processing)

### Relevance Scoring Prompt

```
You are an AI assistant helping a Danish DevOps developer find relevant tech news.
The developer primarily works with:
- AI programming and autonomous agents (MCP servers, agentic commerce)
- Next.js, React, Supabase, PostgreSQL
- Docker, Fly.io, Cloudflare, Bun
- DevOps automation and platform engineering
- SDLC orchestration and developer tooling

Score the following article from 0.0 to 1.0 based on relevance.
Return ONLY a JSON object: { "score": 0.X, "reason": "brief reason" }

Title: {title}
Source: {source}
Snippet: {snippet}
```

### Summarizer Prompt

```
Summarize this article in 2-3 sentences in English.
Focus on: what's new, why it's relevant for a developer,
and any breaking changes or action items.

Title: {title}
Content: {content}
```

### Batch Scoring Prompt (Cost Optimization)

```
Score each article 0.0-1.0 for relevance to a DevOps developer working with
AI agents, Next.js, Supabase, Docker, Fly.io, and platform engineering.

Return a JSON array: [{ "index": 0, "score": 0.X }, ...]

Articles:
{articles_json}
```

> Using batch prompts reduces API calls from ~120 to ~5-6 per daily run.

---

## Notes

- **Rate limiting:** All scrapers have configurable delays (default 1-2s between requests)
- **Graceful degradation:** If one source fails, the rest continue. Failures logged to `source_runs`
- **Idempotent:** Can run multiple times daily without duplicates (URL-based dedup)
- **Cost control:** Claude API calls are batched. Relevance scoring uses short prompts. Summaries only for top items.
- **Monitoring:** All source runs logged with timing, item counts, and error messages
- **Language:** All digests and summaries in English
