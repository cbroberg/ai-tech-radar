-- AI Tech Radar — Initial Schema
-- Run this in the Supabase SQL editor (Stockholm region)

-- Enable pgvector for future semantic search (Phase 6)
CREATE EXTENSION IF NOT EXISTS vector;

-- Articles from all sources
CREATE TABLE articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  source_url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content_snippet TEXT,
  relevance_score FLOAT,
  categories TEXT[],
  tags TEXT[],
  author VARCHAR(255),
  published_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  digest_included BOOLEAN DEFAULT FALSE,
  embedding VECTOR(1536)
);

CREATE INDEX idx_articles_source ON articles(source);
CREATE INDEX idx_articles_relevance ON articles(relevance_score DESC);
CREATE INDEX idx_articles_scraped ON articles(scraped_at DESC);
CREATE INDEX idx_articles_categories ON articles USING GIN(categories);

-- Daily and weekly digests
CREATE TABLE digests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  digest_type VARCHAR(10) DEFAULT 'daily',
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
  status VARCHAR(20) DEFAULT 'running',
  items_found INTEGER DEFAULT 0,
  items_new INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE INDEX idx_source_runs_source ON source_runs(source);
CREATE INDEX idx_source_runs_started ON source_runs(started_at DESC);

-- Watch keywords
CREATE TABLE watch_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  category VARCHAR(50),
  priority INTEGER DEFAULT 5,
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
