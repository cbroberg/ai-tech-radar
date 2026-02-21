import { getSqlite, vecLoaded } from './client.js'

export function semanticSearch(queryEmbedding, { limit = 10 } = {}) {
  if (!vecLoaded) throw new Error('Vector search not available (sqlite-vec not loaded)')

  const sqlite = getSqlite()
  // Bun's SQLite requires Uint8Array (not ArrayBuffer) for BLOB bindings
  const queryVec = new Uint8Array(new Float32Array(queryEmbedding).buffer)

  // Find nearest neighbours from vec_articles
  const vecResults = sqlite.query(`
    SELECT article_id, distance
    FROM vec_articles
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(queryVec, limit)

  if (vecResults.length === 0) return []

  // Join with articles to get full data
  const ids = vecResults.map((r) => r.article_id)
  const placeholders = ids.map(() => '?').join(', ')
  const articles = sqlite.query(
    `SELECT * FROM articles WHERE id IN (${placeholders})`
  ).all(...ids)

  // Map distance back onto each article and sort by distance
  const distanceById = Object.fromEntries(vecResults.map((r) => [r.article_id, r.distance]))
  return articles
    .map((a) => ({ ...a, distance: distanceById[a.id] }))
    .sort((a, b) => a.distance - b.distance)
}
