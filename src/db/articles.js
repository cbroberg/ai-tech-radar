import { eq, desc, gte, isNull, and, inArray } from 'drizzle-orm'
import { getDb } from './client.js'
import { articles } from './schema.js'

export function upsertArticles(items) {
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

export function getArticlesByScore({ minScore = 0.4, limit = 50 } = {}) {
  const db = getDb()
  return db
    .select()
    .from(articles)
    .where(gte(articles.relevanceScore, minScore))
    .orderBy(desc(articles.relevanceScore))
    .limit(limit)
    .all()
}

export function getRecentArticles({ hours = 26, limit = 200 } = {}) {
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

export function getUnscoredArticles({ hours = 26, limit = 200 } = {}) {
  const db = getDb()
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  return db
    .select()
    .from(articles)
    .where(and(gte(articles.scrapedAt, since), isNull(articles.relevanceScore)))
    .orderBy(desc(articles.scrapedAt))
    .limit(limit)
    .all()
}

export function markDigestIncluded(ids) {
  const db = getDb()
  db.update(articles)
    .set({ digestIncluded: true })
    .where(inArray(articles.id, ids))
    .run()
}

export function updateScores(updates) {
  const db = getDb()
  for (const { id, relevanceScore, summary, categories, tags } of updates) {
    // Only set fields that are explicitly provided (not undefined)
    const patch = {}
    if (relevanceScore !== undefined) patch.relevanceScore = relevanceScore
    if (summary !== undefined) patch.summary = summary
    if (categories !== undefined) patch.categories = categories
    if (tags !== undefined) patch.tags = tags
    if (Object.keys(patch).length === 0) continue
    db.update(articles).set(patch).where(eq(articles.id, id)).run()
  }
}
