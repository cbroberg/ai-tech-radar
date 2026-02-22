import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const articles = sqliteTable(
  'articles',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    source: text('source').notNull(),
    sourceUrl: text('source_url').notNull().unique(),
    title: text('title').notNull(),
    summary: text('summary'),
    contentSnippet: text('content_snippet'),
    relevanceScore: real('relevance_score'),
    categories: text('categories', { mode: 'json' }).$type(),
    tags: text('tags', { mode: 'json' }).$type(),
    author: text('author'),
    publishedAt: text('published_at'),
    scrapedAt: text('scraped_at').default(sql`(datetime('now'))`),
    digestIncluded: integer('digest_included', { mode: 'boolean' }).default(false),
    starred: integer('starred', { mode: 'boolean' }).default(false),
    starredAt: text('starred_at'),
    imageUrl: text('image_url'),
  },
  (t) => [
    index('idx_articles_source').on(t.source),
    index('idx_articles_relevance').on(t.relevanceScore),
    index('idx_articles_scraped').on(t.scrapedAt),
  ]
)

export const digests = sqliteTable('digests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  digestType: text('digest_type').default('daily'),
  articleCount: integer('article_count'),
  topStoryId: text('top_story_id').references(() => articles.id),
  summaryMarkdown: text('summary_markdown'),
  discordMessageId: text('discord_message_id'),
  emailSentAt: text('email_sent_at'),
})

export const sourceRuns = sqliteTable(
  'source_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    source: text('source').notNull(),
    startedAt: text('started_at').default(sql`(datetime('now'))`),
    completedAt: text('completed_at'),
    status: text('status').default('running'),
    itemsFound: integer('items_found').default(0),
    itemsNew: integer('items_new').default(0),
    errorMessage: text('error_message'),
  },
  (t) => [
    index('idx_source_runs_source').on(t.source),
    index('idx_source_runs_started').on(t.startedAt),
  ]
)

export const watchKeywords = sqliteTable('watch_keywords', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  keyword: text('keyword').notNull(),
  category: text('category'),
  priority: integer('priority').default(5),
  active: integer('active', { mode: 'boolean' }).default(true),
})
