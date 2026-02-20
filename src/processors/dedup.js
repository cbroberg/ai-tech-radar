// Title-similarity dedup — URL uniqueness is already handled by the DB unique constraint.
// Removes near-duplicate articles where the same story appears via multiple sources.

function tokenize(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

function jaccardSimilarity(setA, setB) {
  const intersection = new Set([...setA].filter((t) => setB.has(t)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.size / union.size
}

const SIMILARITY_THRESHOLD = 0.65

export function dedupByTitle(articles) {
  const kept = []
  const tokenized = articles.map((a) => ({ article: a, tokens: tokenize(a.title) }))

  for (const { article, tokens } of tokenized) {
    const isDuplicate = kept.some(({ tokens: keptTokens }) =>
      jaccardSimilarity(tokens, keptTokens) >= SIMILARITY_THRESHOLD
    )
    if (!isDuplicate) {
      kept.push({ article, tokens })
    }
  }

  const result = kept.map((k) => k.article)
  const removed = articles.length - result.length
  if (removed > 0) {
    console.log(`[dedup] Removed ${removed} near-duplicates (${articles.length} → ${result.length})`)
  }
  return result
}
