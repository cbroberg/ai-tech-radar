import { eq, desc, gte, and, inArray } from 'drizzle-orm'
import { getDb } from './client.js'
import { articles } from './schema.js'

export async function upsertArticles(items) {
  const db = getDb()
  let inserted = 0

  for (const item of items) {
    const existing = db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.sourceUrl, item.sourceUrl))
      .get()

    if (!existing) {
      db.insert(articles).values(item).run()
      inserted++
    }
  }

  return inserted
}

export async function getArticlesByScore({ minScore = 0.4, limit = 50 } = {}) {
  const db = getDb()
  return db
    .select()
    .from(articles)
    .where(gte(articles.relevanceScore, minScore))
    .orderBy(desc(articles.relevanceScore))
    .limit(limit)
    .all()
}

export async function getRecentArticles({ hours = 26, limit = 200 } = {}) {
  const db = getDb()
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  return db
    .select()
    .from(articles)
    .where(gte(articles.scrapedAt, since))
    .orderBy(desc(articles.scrapedAt))
    .limit(limit)
    .all()
}

export async function markDigestIncluded(ids) {
  const db = getDb()
  db.update(articles)
    .set({ digestIncluded: true })
    .where(inArray(articles.id, ids))
    .run()
}

export async function updateScores(updates) {
  const db = getDb()
  for (const { id, relevanceScore, summary, categories, tags } of updates) {
    db.update(articles)
      .set({ relevanceScore, summary, categories, tags })
      .where(eq(articles.id, id))
      .run()
  }
}
