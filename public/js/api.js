// API client — thin fetch wrappers

export async function fetchFeed() {
  const res = await fetch('/api/feed')
  if (!res.ok) throw new Error(`Feed failed: ${res.status}`)
  return res.json()
}

export async function fetchArticles({ minScore = 0.4, limit = 50, category = null } = {}) {
  const params = new URLSearchParams({ min_score: minScore, limit })
  if (category) params.set('category', category)
  const res = await fetch(`/api/articles?${params}`)
  if (!res.ok) throw new Error(`Articles failed: ${res.status}`)
  return res.json()
}

export async function fetchArticle(id) {
  const res = await fetch(`/api/articles/${id}`)
  if (!res.ok) throw new Error(`Article not found`)
  return res.json()
}

export async function fetchSearch(query, limit = 10) {
  const params = new URLSearchParams({ q: query, limit })
  const res = await fetch(`/api/search?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Search failed: ${res.status}`)
  }
  return res.json()
}
