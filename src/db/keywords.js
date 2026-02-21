import { getSqlite } from './client.js'

export function getKeywords() {
  return getSqlite().query(
    'SELECT * FROM watch_keywords ORDER BY priority DESC, keyword'
  ).all()
}

export function addKeyword(keyword, category, priority = 5) {
  const id = crypto.randomUUID()
  getSqlite().prepare(
    'INSERT INTO watch_keywords (id, keyword, category, priority, active) VALUES (?, ?, ?, ?, 1)'
  ).run(id, keyword, category, priority)
  return id
}

export function deleteKeyword(id) {
  getSqlite().prepare('DELETE FROM watch_keywords WHERE id = ?').run(id)
}
