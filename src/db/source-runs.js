import { eq, desc } from 'drizzle-orm'
import { getDb } from './client.js'
import { sourceRuns } from './schema.js'

export function startRun(source) {
  const db = getDb()
  const id = crypto.randomUUID()
  db.insert(sourceRuns).values({ id, source, status: 'running' }).run()
  return id
}

export function completeRun(id, { itemsFound, itemsNew }) {
  const db = getDb()
  db.update(sourceRuns)
    .set({
      status: 'success',
      completedAt: new Date().toISOString(),
      itemsFound,
      itemsNew,
    })
    .where(eq(sourceRuns.id, id))
    .run()
}

export function failRun(id, errorMessage) {
  const db = getDb()
  db.update(sourceRuns)
    .set({
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage,
    })
    .where(eq(sourceRuns.id, id))
    .run()
}

export function getSourceStatus() {
  const db = getDb()
  // Latest run per source
  return db
    .select()
    .from(sourceRuns)
    .orderBy(desc(sourceRuns.startedAt))
    .limit(100)
    .all()
}
