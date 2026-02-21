import { getSqlite, vecLoaded } from './client.js'

export function runMigrations() {
  const sqlite = getSqlite()

  // exec() handles multiple statements in one call — unlike Drizzle's sql.raw()
  sqlite.exec(`
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

    CREATE TABLE IF NOT EXISTS custom_rss_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      feed_url TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Add embedded column to articles if not yet present (idempotent)
  try {
    sqlite.exec('ALTER TABLE articles ADD COLUMN embedded INTEGER DEFAULT 0')
  } catch { /* column already exists */ }

  // Add starred columns (idempotent)
  try { sqlite.exec('ALTER TABLE articles ADD COLUMN starred INTEGER DEFAULT 0') } catch { /* column already exists */ }
  try { sqlite.exec('ALTER TABLE articles ADD COLUMN starred_at TEXT') } catch { /* column already exists */ }

  // Create vec0 virtual table for vector similarity search
  if (vecLoaded) {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_articles USING vec0(
        article_id TEXT PRIMARY KEY,
        embedding FLOAT[512]
      )
    `)
    console.log('[db] vec_articles table ready')
  }

  // Seed keywords if table is empty — use raw sqlite to avoid Drizzle ORM overhead
  const { count } = sqlite.query('SELECT COUNT(*) as count FROM watch_keywords').get()
  if (count === 0) {
    const insert = sqlite.prepare(
      'INSERT INTO watch_keywords (id, keyword, category, priority) VALUES (lower(hex(randomblob(16))), ?, ?, ?)'
    )
    const seedMany = sqlite.transaction((rows) => {
      for (const [keyword, category, priority] of rows) {
        insert.run(keyword, category, priority)
      }
    })
    seedMany([
      // Anthropic models — high priority
      ['Claude Sonnet', 'ai', 10],
      ['Claude Opus', 'ai', 10],
      ['Claude Haiku', 'ai', 10],
      ['Claude 4', 'ai', 10],
      ['Claude 5', 'ai', 10],
      ['Anthropic', 'ai', 9],
      ['claude-sonnet', 'ai', 9],
      ['claude-opus', 'ai', 9],
      // Competing models
      ['GPT-5', 'ai', 9],
      ['GPT-4o', 'ai', 8],
      ['Gemini', 'ai', 8],
      ['Llama', 'ai', 7],
      ['Mistral', 'ai', 7],
      ['multimodal', 'ai', 7],
      ['visual agent', 'ai', 9],
      ['context window', 'ai', 7],
      // Agents & infra
      ['autonomous agent', 'ai', 10],
      ['agentic', 'ai', 10],
      ['MCP server', 'ai', 9],
      ['Model Context Protocol', 'ai', 9],
      ['AI orchestration', 'ai', 9],
      ['Claude API', 'ai', 8],
      ['LLM', 'ai', 7],
      ['RAG', 'ai', 7],
      // Stack
      ['Next.js', 'stack', 8],
      ['React Server Components', 'stack', 8],
      ['Supabase', 'stack', 7],
      ['PostgreSQL', 'stack', 7],
      ['Fly.io', 'stack', 8],
      ['Docker', 'stack', 6],
      ['BullMQ', 'stack', 7],
      ['Cloudflare Workers', 'stack', 7],
      ['Bun runtime', 'stack', 7],
      ['Vercel', 'stack', 6],
      // DevOps
      ['DevOps automation', 'devops', 8],
      ['CI/CD', 'devops', 6],
      ['container orchestration', 'devops', 7],
      ['platform engineering', 'devops', 7],
      ['SDLC automation', 'devops', 8],
      // Trends
      ['developer tools', 'trend', 6],
      ['AI coding', 'trend', 8],
      ['vibe coding', 'trend', 7],
      ['agentic commerce', 'trend', 9],
      ['AI SaaS', 'trend', 7],
    ])
    console.log('[db] Seeded watch_keywords')
  }

  console.log('[db] Migrations complete')
}
