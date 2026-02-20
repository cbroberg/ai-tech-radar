import { config } from '../config.js'

const CATEGORY_META = {
  ai:     { label: 'AI & Agents',       emoji: '🤖', color: 0x7C3AED },
  stack:  { label: 'Stack Updates',     emoji: '🛠️',  color: 0x2563EB },
  devops: { label: 'DevOps & Platform', emoji: '📦', color: 0x059669 },
  trend:  { label: 'Trending',          emoji: '🔥', color: 0xDC2626 },
  other:  { label: 'Other',             emoji: '📌', color: 0x6B7280 },
}

function scoreBar(score) {
  if (score >= 0.85) return '⭐'
  if (score >= 0.65) return '🔧'
  return '·'
}

function formatArticle(article) {
  const score = article.relevanceScore ?? 0
  const prefix = scoreBar(score)
  const scoreLabel = `[${(score * 10).toFixed(1)}]`
  const summary = article.summary
    ? `\n   ${article.summary.slice(0, 120)}${article.summary.length > 120 ? '…' : ''}`
    : ''
  return `${prefix} ${scoreLabel} **[${article.title.slice(0, 80)}](${article.sourceUrl})**${summary}`
}

function buildCategoryEmbed(category, articles) {
  if (articles.length === 0) return null
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other
  const lines = articles.slice(0, 8).map(formatArticle)
  const description = lines.join('\n\n')

  return {
    title: `${meta.emoji} ${meta.label}`,
    description: description.slice(0, 3900), // Discord embed description limit is 4096
    color: meta.color,
    footer: articles.length > 8 ? { text: `+${articles.length - 8} more` } : undefined,
  }
}

async function postToWebhook(payload) {
  const url = config.notifications.discordWebhookUrl
  if (!url) throw new Error('DISCORD_WEBHOOK_URL not set')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord webhook failed: ${res.status} ${text}`)
  }

  // Discord returns message ID when ?wait=true — we use that to store it
  return res.headers.get('x-ratelimit-remaining')
}

export async function sendDailyDigest(digest) {
  if (!digest) {
    console.warn('[discord] No digest to send')
    return null
  }

  const { date, intro, totalRelevant, scrapeStats, grouped } = digest

  // Header message
  const headerContent =
    `🔔 **AI Tech Radar — ${date}**\n` +
    `> ${intro}\n\n` +
    `📊 **${scrapeStats.totalFound}** sources scanned · ` +
    `**${scrapeStats.totalNew ?? '?'}** new · ` +
    `**${totalRelevant}** relevant`

  // Build category embeds — Discord allows max 10 per message
  const embeds = Object.entries(grouped)
    .map(([cat, articles]) => buildCategoryEmbed(cat, articles))
    .filter(Boolean)
    .slice(0, 9)

  const payload = {
    content: headerContent,
    embeds,
  }

  await postToWebhook(payload)
  console.log(`[discord] Daily digest posted — ${totalRelevant} articles, ${embeds.length} categories`)

  return payload
}

export async function sendWeeklyDiscordSummary(summaryText, stats) {
  const payload = {
    content:
      `📅 **AI Tech Radar — Weekly Summary**\n` +
      `> ${stats.date_range}\n\n` +
      summaryText.slice(0, 1800),
  }
  await postToWebhook(payload)
  console.log('[discord] Weekly summary posted')
}
