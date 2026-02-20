// Run once at startup to create tables if they don't exist
import { getDb } from './client.js'
import { sql } from 'drizzle-orm'

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    content_snippet TEXT,
    relevance_score REAL,
    categories TEXT,
    tags TEXT,
    author TEXT,
    published_at TEXT,
    scraped_at TEXT DEFAULT (datetime('now')),
    digest_included INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
  CREATE INDEX IF NOT EXISTS idx_articles_relevance ON articles(relevance_score DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_scraped ON articles(scraped_at DESC);

  CREATE TABLE IF NOT EXISTS digests (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    digest_type TEXT DEFAULT 'daily',
    article_count INTEGER,
    top_story_id TEXT REFERENCES articles(id),
    summary_markdown TEXT,
    discord_message_id TEXT,
    email_sent_at TEXT
  );

  CREATE TABLE IF NOT EXISTS source_runs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT DEFAULT 'running',
    items_found INTEGER DEFAULT 0,
    items_new INTEGER DEFAULT 0,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs(source);
  CREATE INDEX IF NOT EXISTS idx_source_runs_started ON source_runs(started_at DESC);

  CREATE TABLE IF NOT EXISTS watch_keywords (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL,
    category TEXT,
    priority INTEGER DEFAULT 5,
    active INTEGER DEFAULT 1
  );
`

const SEED_KEYWORDS = `
  INSERT OR IGNORE INTO watch_keywords (id, keyword, category, priority) VALUES
    (lower(hex(randomblob(16))), 'autonomous agent', 'ai', 10),
    (lower(hex(randomblob(16))), 'agentic', 'ai', 10),
    (lower(hex(randomblob(16))), 'MCP server', 'ai', 9),
    (lower(hex(randomblob(16))), 'Model Context Protocol', 'ai', 9),
    (lower(hex(randomblob(16))), 'AI orchestration', 'ai', 9),
    (lower(hex(randomblob(16))), 'Claude API', 'ai', 8),
    (lower(hex(randomblob(16))), 'LLM', 'ai', 7),
    (lower(hex(randomblob(16))), 'RAG', 'ai', 7),
    (lower(hex(randomblob(16))), 'Next.js', 'stack', 8),
    (lower(hex(randomblob(16))), 'React Server Components', 'stack', 8),
    (lower(hex(randomblob(16))), 'Supabase', 'stack', 7),
    (lower(hex(randomblob(16))), 'PostgreSQL', 'stack', 7),
    (lower(hex(randomblob(16))), 'Fly.io', 'stack', 8),
    (lower(hex(randomblob(16))), 'Docker', 'stack', 6),
    (lower(hex(randomblob(16))), 'BullMQ', 'stack', 7),
    (lower(hex(randomblob(16))), 'Cloudflare Workers', 'stack', 7),
    (lower(hex(randomblob(16))), 'Bun runtime', 'stack', 7),
    (lower(hex(randomblob(16))), 'Vercel', 'stack', 6),
    (lower(hex(randomblob(16))), 'DevOps automation', 'devops', 8),
    (lower(hex(randomblob(16))), 'CI/CD', 'devops', 6),
    (lower(hex(randomblob(16))), 'container orchestration', 'devops', 7),
    (lower(hex(randomblob(16))), 'platform engineering', 'devops', 7),
    (lower(hex(randomblob(16))), 'SDLC automation', 'devops', 8),
    (lower(hex(randomblob(16))), 'developer tools', 'trend', 6),
    (lower(hex(randomblob(16))), 'AI coding', 'trend', 8),
    (lower(hex(randomblob(16))), 'vibe coding', 'trend', 7),
    (lower(hex(randomblob(16))), 'agentic commerce', 'trend', 9),
    (lower(hex(randomblob(16))), 'AI SaaS', 'trend', 7);
`

export async function runMigrations() {
  const db = getDb()
  db.run(sql.raw(CREATE_TABLES))

  const { count } = db.get(sql`SELECT COUNT(*) as count FROM watch_keywords`)
  if (count === 0) {
    db.run(sql.raw(SEED_KEYWORDS))
    console.log('[db] Seeded watch_keywords')
  }

  console.log('[db] Migrations complete')
}
