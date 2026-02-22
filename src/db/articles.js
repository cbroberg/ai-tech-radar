import { eq, desc, gte, isNull, and, inArray, like } from 'drizzle-orm'
import { getDb, getSqlite } from './client.js'
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

export function getArticlesByScore({ minScore = 0.4, limit = 50, category = null } = {}) {
  const db = getDb()
  const conditions = [gte(articles.relevanceScore, minScore)]
  if (category) conditions.push(like(articles.categories, `%"${category}"%`))
  return db
    .select()
    .from(articles)
    .where(and(...conditions))
    .orderBy(desc(articles.relevanceScore))
    .limit(limit)
    .all()
}

export function getArticleById(id) {
  const db = getDb()
  return db.select().from(articles).where(eq(articles.id, id)).get()
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

export function toggleStar(id) {
  const db = getDb()
  const article = db.select({ starred: articles.starred }).from(articles).where(eq(articles.id, id)).get()
  if (!article) return null
  const newStarred = !article.starred
  db.update(articles)
    .set({ starred: newStarred, starredAt: newStarred ? new Date().toISOString() : null })
    .where(eq(articles.id, id))
    .run()
  return newStarred
}

export function setStarByUrl(sourceUrl, starred) {
  const db = getDb()
  const article = db.select({ id: articles.id }).from(articles).where(eq(articles.sourceUrl, sourceUrl)).get()
  if (!article) return null
  db.update(articles)
    .set({ starred, starredAt: starred ? new Date().toISOString() : null })
    .where(eq(articles.id, article.id))
    .run()
  return starred
}

export function getStarredArticles() {
  const db = getDb()
  return db
    .select()
    .from(articles)
    .where(eq(articles.starred, true))
    .orderBy(desc(articles.starredAt))
    .all()
}

export function browseArticles({ page = 1, pageSize = 20, minScore = 0, category = null, sort = 'relevance' } = {}) {
  const db = getDb()

  const conditions = []
  if (minScore > 0) conditions.push(gte(articles.relevanceScore, minScore))
  if (category) conditions.push(like(articles.categories, `%"${category}"%`))

  const where = conditions.length ? and(...conditions) : undefined

  const orderMap = {
    relevance: desc(articles.relevanceScore),
    date: desc(articles.scrapedAt),
    score: desc(articles.relevanceScore),
  }
  const orderBy = orderMap[sort] ?? orderMap.relevance

  const total = db.select({ count: articles.id }).from(articles).where(where).all().length
  const totalPages = Math.ceil(total / pageSize)
  const offset = (page - 1) * pageSize

  const items = db
    .select()
    .from(articles)
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset)
    .all()

  return { items, total, page, pageSize, totalPages }
}

export function deleteOldArticles() {
  const sqlite = getSqlite()
  const now = new Date()
  const d90 = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()
  const d180 = new Date(now - 180 * 24 * 60 * 60 * 1000).toISOString()

  const countBefore = sqlite.query('SELECT COUNT(*) as n FROM articles').get().n

  // 90–180 days: delete low-score unstarred articles
  sqlite.prepare(
    `DELETE FROM articles WHERE scraped_at < ? AND scraped_at >= ? AND (relevance_score IS NULL OR relevance_score < 0.5) AND starred = 0`
  ).run(d90, d180)

  // >180 days: delete all unstarred articles
  sqlite.prepare(
    `DELETE FROM articles WHERE scraped_at < ? AND starred = 0`
  ).run(d180)

  const countAfter = sqlite.query('SELECT COUNT(*) as n FROM articles').get().n
  const deleted = countBefore - countAfter

  // Clean orphaned vec_articles entries
  try {
    sqlite.exec(`DELETE FROM vec_articles WHERE article_id NOT IN (SELECT id FROM articles)`)
  } catch { /* vec table may not exist */ }

  return deleted
}
