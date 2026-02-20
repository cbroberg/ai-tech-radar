import { getSqlite } from './client.js'

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
  `)

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
      ['autonomous agent', 'ai', 10],
      ['agentic', 'ai', 10],
      ['MCP server', 'ai', 9],
      ['Model Context Protocol', 'ai', 9],
      ['AI orchestration', 'ai', 9],
      ['Claude API', 'ai', 8],
      ['LLM', 'ai', 7],
      ['RAG', 'ai', 7],
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
      ['DevOps automation', 'devops', 8],
      ['CI/CD', 'devops', 6],
      ['container orchestration', 'devops', 7],
      ['platform engineering', 'devops', 7],
      ['SDLC automation', 'devops', 8],
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
