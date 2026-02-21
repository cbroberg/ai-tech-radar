import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import { updateScores } from '../db/articles.js'
import { getSqlite } from '../db/client.js'

const client = new Anthropic({ apiKey: config.anthropic.apiKey })

const BATCH_SIZE = 25
const MIN_SCORE_TO_KEEP = 0.4

function buildSystemPrompt() {
  const keywords = getSqlite().query(
    'SELECT keyword, category FROM watch_keywords WHERE active = 1 ORDER BY priority DESC'
  ).all()

  const byCategory = {}
  for (const k of keywords) {
    if (!byCategory[k.category]) byCategory[k.category] = []
    byCategory[k.category].push(k.keyword)
  }

  const topicLines = Object.entries(byCategory)
    .map(([cat, kws]) => `  ${cat}: ${kws.join(', ')}`)
    .join('\n')

  return `You are a relevance filter for a Danish developer's daily tech news digest.
Score these topic areas highly:
${topicLines}

Score each article 0.0–1.0 for relevance. Also assign categories and tags.

Categories (pick 1-2): ai, stack, devops, trend
Tags: 2-5 specific technology or topic keywords

Return ONLY a valid JSON array, no explanation:
[{ "index": 0, "score": 0.8, "categories": ["ai"], "tags": ["MCP", "agent"] }, ...]`
}

function buildBatchPrompt(articles) {
  const items = articles.map((a, i) => ({
    index: i,
    title: a.title,
    source: a.source,
    snippet: a.contentSnippet?.slice(0, 200) ?? '',
  }))
  return `Score these ${articles.length} articles:\n${JSON.stringify(items, null, 2)}`
}

function parseBatchResponse(text, articles) {
  // Extract JSON array from response (handle potential markdown fences)
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array found in response')
  const scores = JSON.parse(match[0])

  return scores
    .filter((s) => typeof s.index === 'number' && typeof s.score === 'number')
    .map((s) => ({
      id: articles[s.index]?.id,
      relevanceScore: Math.max(0, Math.min(1, s.score)),
      categories: s.categories ?? [],
      tags: s.tags ?? [],
      summary: null, // filled by summarizer
    }))
    .filter((s) => s.id)
}

export async function scoreArticles(articles) {
  if (articles.length === 0) return []

  console.log(`[scorer] Scoring ${articles.length} articles in batches of ${BATCH_SIZE}`)
  const allScores = []

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE)

    try {
      const response = await client.messages.create({
        model: config.anthropic.model,
        max_tokens: 2048,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildBatchPrompt(batch) }],
      })

      const text = response.content[0].text
      const scores = parseBatchResponse(text, batch)
      allScores.push(...scores)
      console.log(`[scorer] Batch ${batchNum}/${totalBatches}: scored ${scores.length} articles`)
    } catch (err) {
      console.error(`[scorer] Batch ${batchNum}/${totalBatches} failed: ${err.message}`)
      // Push zero scores so articles aren't blocked from future runs
      batch.forEach((a) => allScores.push({ id: a.id, relevanceScore: 0, categories: [], tags: [], summary: null }))
    }
  }

  // Persist scores to DB
  await updateScores(allScores)

  const relevant = allScores.filter((s) => s.relevanceScore >= MIN_SCORE_TO_KEEP)
  console.log(
    `[scorer] Done — ${relevant.length}/${allScores.length} articles above threshold (${MIN_SCORE_TO_KEEP})`
  )

  return relevant
}

export { MIN_SCORE_TO_KEEP }
