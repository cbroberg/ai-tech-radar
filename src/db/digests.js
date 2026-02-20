import { desc, gte } from 'drizzle-orm'
import { getDb } from './client.js'
import { digests, articles } from './schema.js'

export function saveDigest(data) {
  const db = getDb()
  const id = crypto.randomUUID()
  db.insert(digests).values({ id, ...data }).run()
  return id
}

export function getTodayDigest() {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  return db
    .select()
    .from(digests)
    .where(gte(digests.createdAt, today))
    .orderBy(desc(digests.createdAt))
    .limit(1)
    .get()
}

export function getLatestDigest() {
  const db = getDb()
  return db.select().from(digests).orderBy(desc(digests.createdAt)).limit(1).get()
}

export function getWeeklyArticles() {
  const db = getDb()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  return db
    .select()
    .from(articles)
    .where(gte(articles.scrapedAt, since))
    .orderBy(desc(articles.relevanceScore))
    .limit(60)
    .all()
}
