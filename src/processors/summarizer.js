import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import { updateScores } from '../db/articles.js'

const client = new Anthropic({ apiKey: config.anthropic.apiKey })

const MAX_TO_SUMMARIZE = 20

const SYSTEM_PROMPT = `You are a concise technical writer for a developer news digest.
Summarize the article in 2-3 sentences in English.
Focus on: what is new or changed, why it matters for a developer, any breaking changes or action items.
Be specific — mention version numbers, API changes, or concrete features when available.
Return ONLY the summary text, no preamble.`

export async function summarizeTopArticles(scoredArticles, allArticlesById) {
  // Sort by score, take top N that have content to summarize
  const toSummarize = [...scoredArticles]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, MAX_TO_SUMMARIZE)
    .filter((s) => {
      const article = allArticlesById[s.id]
      return article?.contentSnippet || article?.title
    })

  if (toSummarize.length === 0) return

  console.log(`[summarizer] Summarizing top ${toSummarize.length} articles`)

  const summaryUpdates = []

  // Run in parallel — each prompt is short, Claude handles concurrency well
  const results = await Promise.allSettled(
    toSummarize.map(async (scored) => {
      const article = allArticlesById[scored.id]
      const prompt = `Title: ${article.title}\nSource: ${article.source}\nSnippet: ${article.contentSnippet ?? '(no content)'}`

      const response = await client.messages.create({
        model: config.anthropic.model,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      })

      return { id: scored.id, summary: response.content[0].text.trim() }
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      summaryUpdates.push(result.value)
    } else {
      console.warn(`[summarizer] One article failed: ${result.reason?.message}`)
    }
  }

  // Persist summaries — only update the summary field, leave scores intact
  await updateScores(
    summaryUpdates.map(({ id, summary }) => ({
      id,
      relevanceScore: undefined, // don't overwrite
      summary,
      categories: undefined,
      tags: undefined,
    }))
  )

  console.log(`[summarizer] Done — ${summaryUpdates.length} summaries written`)
}
