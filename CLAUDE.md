# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI Tech Radar — an autonomous daily AI/tech intelligence scanner. Scrapes ~27 sources (RSS, APIs, web scrapes), deduplicates, scores relevance with Claude, summarizes top articles, generates vector embeddings, posts daily digests to Discord, and sends weekly HTML email summaries. Serves a vanilla-JS web frontend.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Dev server with file watching (bun --watch src/index.js)
bun run start            # Production server
bun run secrets          # Sync .env secrets to Fly.io (scripts/fly-secrets-sync.sh)
fly deploy --app ai-tech-radar  # Deploy to Fly.io
```

There is no test suite and no linter configured.

The dev server is always running locally on port 3000. Do not attempt to start it.

## Architecture

**Runtime:** Bun (ES modules, no build step, no transpilation). Uses Bun's built-in SQLite driver.

**Entry point:** `src/index.js` — Express server + pipeline orchestration. In-process scheduling via node-cron (no external queue).

**Daily pipeline (06:00 UTC):**
1. `src/orchestrator.js` — runs scrapers in 3 parallel batches (RSS → APIs → web scrapes)
2. `src/db/articles.js` — upsert with UNIQUE constraint on `source_url`
3. `src/processors/dedup.js` — Jaccard title similarity (threshold 0.65)
4. `src/processors/relevance-scorer.js` — Claude batch scoring (25/call), scores 0.0–1.0, filters ≥ 0.4
5. `src/processors/summarizer.js` — Claude parallel summarization of top 20
6. `src/processors/embedder.js` — Voyage AI embeddings (voyage-3-lite, 512 dims, batch 64)
7. `src/digest/builder.js` + `src/digest/discord.js` — build and post daily digest

**Weekly pipeline (07:00 UTC Monday):** `src/digest/email-weekly.js` — top 60 articles, Claude theme summary, HTML email via Resend.

**Scrapers** (`src/scrapers/`): All extend `BaseScraper` which provides retry logic, timeout, and `normalize()`. The scraper registry in `orchestrator.js` defines execution order and batching.

**Database:** SQLite at `./data/radar.db` (local) or `/data/radar.db` (Fly.io volume). Schema: `articles`, `digests`, `source_runs`, `watch_keywords`, `custom_rss_sources`, plus `vec_articles` virtual table (sqlite-vec). Migrations are idempotent `CREATE TABLE IF NOT EXISTS` in `src/db/migrate.js`, auto-run on startup.

**ORM:** Drizzle ORM for standard CRUD (`src/db/schema.js`). Raw Bun SQLite for migrations, vector operations, and performance-sensitive paths.

**Frontend** (`public/`): Vanilla JS SPA with client-side History API router. No framework, no build step. Three views: home feed, search, article detail. Admin panel at `/admin` is token-gated in-browser (sessionStorage).

**Config:** All env vars centralized in `src/config.js` with `validateConfig()` on startup. Required: `ANTHROPIC_API_KEY`, `DISCORD_WEBHOOK_URL`, `ADMIN_TOKEN`. Optional features (Serper search, Resend email, Voyage embeddings, Product Hunt, Dev.to) gracefully degrade when their keys are absent.

## Key Patterns

- **Graceful degradation:** Every scraper failure is caught; the pipeline continues. Optional features are skipped if env vars are absent.
- **Idempotent runs:** URL uniqueness constraint prevents duplicate articles. Safe to re-run.
- **Dynamic scoring prompt:** Claude scoring system prompt is built at call time from `watch_keywords` table — keywords added via admin UI take effect on next scan.
- **API auth:** Admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`. Public endpoints have no auth.

## Deployment

Fly.io, Stockholm region (`arn`), `shared-cpu-1x`, 512MB RAM. Volume `radar_data` at `/data` (1GB). Dockerfile uses `oven/bun:1-slim`. Health check at `GET /health`.
