import { eq } from 'drizzle-orm'
import { getDb, getSqlite } from './client.js'
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
  // Return latest run per source using raw SQL for simplicity
  const sqlite = getSqlite()
  return sqlite.query(`
    SELECT s.*
    FROM source_runs s
    INNER JOIN (
      SELECT source, MAX(started_at) AS latest
      FROM source_runs
      GROUP BY source
    ) g ON s.source = g.source AND s.started_at = g.latest
    ORDER BY s.source
  `).all()
}
