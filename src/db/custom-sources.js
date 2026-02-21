import { getSqlite } from './client.js'

export function getCustomSources() {
  return getSqlite().query(
    'SELECT * FROM custom_rss_sources WHERE active = 1 ORDER BY created_at'
  ).all()
}

export function addCustomSource(name, feedUrl) {
  const id = crypto.randomUUID()
  getSqlite().prepare(
    'INSERT INTO custom_rss_sources (id, name, feed_url) VALUES (?, ?, ?)'
  ).run(id, name, feedUrl)
  return id
}

export function deleteCustomSource(id) {
  getSqlite().prepare('DELETE FROM custom_rss_sources WHERE id = ?').run(id)
}
