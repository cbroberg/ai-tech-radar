import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import { getArticlesByScore } from '../db/articles.js'

const client = new Anthropic({ apiKey: config.anthropic.apiKey })

const CATEGORY_META = {
  ai:     { label: 'AI & Agents',        emoji: '🤖' },
  stack:  { label: 'Stack Updates',      emoji: '🛠️' },
  devops: { label: 'DevOps & Platform',  emoji: '📦' },
  trend:  { label: 'Trending',           emoji: '🔥' },
}

export async function buildDailyDigest(scrapeStats) {
  // Pull today's scored articles from DB
  const articles = await getArticlesByScore({ minScore: 0.4, limit: 100 })

  if (articles.length === 0) {
    return null
  }

  // Group by primary category
  const grouped = { ai: [], stack: [], devops: [], trend: [], other: [] }
  for (const article of articles) {
    const cats = article.categories ?? []
    const primary = cats.find((c) => grouped[c]) ?? 'other'
    grouped[primary].push(article)
  }

  // Sort each group by score desc, cap at 10 per category
  for (const key of Object.keys(grouped)) {
    grouped[key] = grouped[key]
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, 10)
  }

  const topStory = articles[0] ?? null

  // Generate a one-line intro via Claude (short prompt, cheap)
  const intro = await generateIntro(articles.length, scrapeStats)

  return {
    date: new Date().toISOString().slice(0, 10),
    scrapeStats,
    totalRelevant: articles.length,
    topStory,
    grouped,
    intro,
  }
}

async function generateIntro(relevantCount, scrapeStats) {
  try {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content:
          `Write a single punchy sentence (max 120 chars) introducing today's AI tech digest. ` +
          `${scrapeStats.totalFound} sources scanned, ${relevantCount} relevant items found. ` +
          `Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}. ` +
          `Be specific and energetic. No emojis.`,
      }],
    })
    return response.content[0].text.trim()
  } catch {
    return `${relevantCount} relevant items from ${scrapeStats.totalFound} scraped today.`
  }
}
