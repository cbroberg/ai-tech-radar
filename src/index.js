import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { config, validateConfig } from './config.js'
import { startScheduler, getSchedulerStatus } from './scheduler.js'
import { runMigrations } from './db/migrate.js'
import { runAllScrapers, getAllScraperNames, runScraperByName } from './orchestrator.js'
import { getSourceStatus } from './db/source-runs.js'
import { getArticlesByScore, getUnscoredArticles, getArticleById } from './db/articles.js'
import { getTodayDigest, getLatestDigest } from './db/digests.js'
import { dedupByTitle } from './processors/dedup.js'
import { scoreArticles } from './processors/relevance-scorer.js'
import { summarizeTopArticles } from './processors/summarizer.js'
import { buildDailyDigest } from './digest/builder.js'
import { sendDailyDigest, sendWeeklyDiscordSummary } from './digest/discord.js'
import { buildAndSendWeeklyEmail } from './digest/email-weekly.js'
import { saveDigest } from './db/digests.js'
import { getSqlite, vecLoaded } from './db/client.js'
import { embedNewArticles, embedQuery } from './processors/embedder.js'
import { semanticSearch } from './db/vector-search.js'
import { getCustomSources, addCustomSource, deleteCustomSource } from './db/custom-sources.js'
import { getKeywords, addKeyword, deleteKeyword } from './db/keywords.js'

// --- Validate env vars before starting ---
try {
  validateConfig()
} catch (err) {
  console.error(`[startup] ${err.message}`)
  process.exit(1)
}

// --- Run DB migrations ---
runMigrations()

// --- Log active features ---
console.log('[startup] Active features:')
console.log(`  AI model   : ${config.anthropic.model}`)
console.log(`  Serper     : ${config.serper.apiKey ? 'enabled' : 'disabled (no key)'}`)
console.log(`  Email      : ${config.notifications.resendApiKey ? `enabled → ${config.notifications.notificationEmail}` : 'disabled (no key)'}`)
console.log(`  ProductHunt: ${config.sources.productHuntToken ? 'enabled' : 'disabled (no key)'}`)
console.log(`  Dev.to     : ${config.sources.devtoApiKey ? 'enabled' : 'disabled (no key)'}`)
console.log(`  Vector     : ${vecLoaded ? (config.voyage.apiKey ? 'enabled' : 'loaded (no VOYAGE_API_KEY)') : 'disabled'}`)

const app = express()
app.use(express.json())
app.use(express.static('public'))

// --- Health ---
app.get('/health', (_req, res) => {
  const { lastRun, dailyCron, weeklyCron, timezone } = getSchedulerStatus()
  const sqlite = getSqlite()
  const { articles } = sqlite.query('SELECT COUNT(*) as articles FROM articles').get()
  const { scored } = sqlite.query(
    'SELECT COUNT(*) as scored FROM articles WHERE relevance_score IS NOT NULL'
  ).get()
  res.json({
    status: 'ok',
    lastRun: lastRun ?? 'never',
    schedule: { daily: dailyCron, weekly: weeklyCron, timezone },
    db: { articles, scored },
    uptime: Math.floor(process.uptime()),
  })
})

// --- Auth helper ---
function requireAdmin(req, res) {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!config.server.adminToken || token !== config.server.adminToken) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

// --- Scan trigger ---
app.post('/api/scan/trigger', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json({ status: 'triggered', startedAt: new Date().toISOString() })
  runDailyScan().catch((err) => console.error('[trigger] Scan failed:', err.message))
})

// --- Weekly email trigger ---
app.post('/api/weekly/trigger', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json({ status: 'triggered', startedAt: new Date().toISOString() })
  runWeeklySummary().catch((err) => console.error('[trigger] Weekly failed:', err.message))
})

// --- Articles ---
app.get('/api/articles', (req, res) => {
  const minScore = parseFloat(req.query.min_score ?? '0')
  const limit = Math.min(parseInt(req.query.limit ?? '50'), 200)
  const category = req.query.category?.trim() || null
  const items = getArticlesByScore({ minScore, limit, category })
  res.json(items)
})

app.get('/api/articles/:id', (req, res) => {
  const article = getArticleById(req.params.id)
  if (!article) return res.status(404).json({ error: 'Article not found' })
  res.json(article)
})

// --- Feed (homepage composite) ---
app.get('/api/feed', (req, res) => {
  const allArticles = getArticlesByScore({ minScore: 0.4, limit: 100 })
  const grouped = { ai: [], stack: [], devops: [], trend: [], other: [] }
  for (const article of allArticles) {
    const cats = article.categories ?? []
    const primary = cats.find((c) => grouped[c]) ?? 'other'
    grouped[primary].push(article)
  }
  const counts = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]))
  const digest = getLatestDigest()
  res.json({
    intro: digest?.summaryMarkdown ?? null,
    topStory: allArticles[0] ?? null,
    grouped,
    counts,
    total: allArticles.length,
  })
})

// --- Digests ---
app.get('/api/digest/today', (_req, res) => {
  const digest = getTodayDigest()
  if (!digest) return res.status(404).json({ error: 'No digest yet today' })
  res.json(digest)
})

app.get('/api/digest/latest', (_req, res) => {
  const digest = getLatestDigest()
  if (!digest) return res.status(404).json({ error: 'No digests yet' })
  res.json(digest)
})

// --- Semantic search ---
app.get('/api/search', async (req, res) => {
  const q = req.query.q?.trim()
  if (!q) return res.status(400).json({ error: 'Missing ?q= query parameter' })
  if (!vecLoaded) return res.status(503).json({ error: 'Vector search not available' })
  if (!config.voyage.apiKey) return res.status(503).json({ error: 'VOYAGE_API_KEY not configured' })

  const limit = Math.min(parseInt(req.query.limit ?? '10'), 50)
  try {
    const queryEmbedding = await embedQuery(q)
    const results = semanticSearch(queryEmbedding, { limit })
    res.json({ query: q, count: results.length, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Source monitoring ---
app.get('/api/sources/status', (_req, res) => {
  res.json(getSourceStatus())
})

// --- Admin ---
app.get('/admin', (_req, res) => {
  res.sendFile('admin.html', { root: 'public' })
})

app.get('/api/admin/status', (req, res) => {
  if (!requireAdmin(req, res)) return
  const sqlite = getSqlite()
  const { articles } = sqlite.query('SELECT COUNT(*) as articles FROM articles').get()
  const { scored } = sqlite.query(
    'SELECT COUNT(*) as scored FROM articles WHERE relevance_score IS NOT NULL'
  ).get()
  let embedded = 0
  try {
    embedded = sqlite.query('SELECT COUNT(*) as n FROM vec_articles').get()?.n ?? 0
  } catch { /* vec table may not exist */ }
  const { lastRun } = getSchedulerStatus()
  const builtinNames = getAllScraperNames()
  const customSources = getCustomSources()
  const allSources = [
    ...builtinNames.map((name) => ({ name, custom: false })),
    ...customSources.map((s) => ({ name: s.name, id: s.id, feedUrl: s.feed_url, custom: true })),
  ]
  res.json({
    db: { articles, scored, embedded },
    lastRun: lastRun ?? 'never',
    sources: getSourceStatus(),
    allSources,
    keywords: getKeywords(),
  })
})

app.post('/api/admin/scan/all', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json({ status: 'triggered', startedAt: new Date().toISOString() })
  runDailyScan().catch((err) => console.error('[admin] Full scan failed:', err.message))
})

app.post('/api/admin/scan/:source', (req, res) => {
  if (!requireAdmin(req, res)) return
  const { source } = req.params
  const isBuiltin = getAllScraperNames().includes(source)
  const isCustom = getCustomSources().some((s) => s.name === source)
  if (!isBuiltin && !isCustom) {
    return res.status(404).json({ error: `Unknown source: ${source}` })
  }
  res.json({ status: 'triggered', source, startedAt: new Date().toISOString() })
  runScraperByName(source).catch((err) =>
    console.error(`[admin] Scrape ${source} failed:`, err.message)
  )
})

// --- Custom RSS sources ---
app.get('/api/admin/sources', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json(getCustomSources())
})

app.post('/api/admin/sources', (req, res) => {
  if (!requireAdmin(req, res)) return
  const { name, feedUrl } = req.body
  if (!name || !feedUrl) return res.status(400).json({ error: 'name and feedUrl required' })
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    return res.status(400).json({ error: 'name must be lowercase letters, numbers, hyphens' })
  }
  if (getAllScraperNames().includes(name)) {
    return res.status(409).json({ error: `"${name}" is already a built-in source` })
  }
  try {
    const id = addCustomSource(name, feedUrl)
    res.json({ id, name, feedUrl })
  } catch (err) {
    const status = err.message.includes('UNIQUE') ? 409 : 500
    res.status(status).json({ error: err.message })
  }
})

app.delete('/api/admin/sources/:id', (req, res) => {
  if (!requireAdmin(req, res)) return
  deleteCustomSource(req.params.id)
  res.json({ ok: true })
})

// --- AI source discovery ---
app.post('/api/admin/discover-source', async (req, res) => {
  if (!requireAdmin(req, res)) return
  const { query } = req.body
  if (!query) return res.status(400).json({ error: 'query required' })

  const ai = new Anthropic({ apiKey: config.anthropic.apiKey })
  try {
    const response = await ai.messages.create({
      model: config.anthropic.model,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Find the RSS feed URL for this publication, name, or article URL: "${query}"

Return ONLY a JSON object: {"name": "short-slug", "feedUrl": "https://..."}
- name: lowercase slug with hyphens (e.g. "wsj-tech", "nytimes-ai", "mit-tech-review")
- feedUrl: the most likely RSS feed URL for AI/tech content from this source

Rules:
- If it's a Medium article URL like https://medium.com/@author/..., use https://medium.com/@author/feed as feedUrl and "medium-{author}" as name
- If it's a domain, find their primary RSS feed for tech content
- If it's a publication name, find their RSS feed URL
- Common patterns: /feed, /rss, /feed.xml, /rss.xml, /blog/rss, /atom.xml
- Prefer feeds that are known to work and be maintained

Return only the JSON object, no explanation.`
      }],
    })
    const match = response.content[0].text.match(/\{[\s\S]*?\}/)
    if (!match) throw new Error('No JSON in response')
    res.json(JSON.parse(match[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Keywords ---
app.get('/api/admin/keywords', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json(getKeywords())
})

app.post('/api/admin/keywords', (req, res) => {
  if (!requireAdmin(req, res)) return
  const { keyword, category, priority } = req.body
  if (!keyword || !category) return res.status(400).json({ error: 'keyword and category required' })
  const validCategories = ['ai', 'stack', 'devops', 'trend']
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}` })
  }
  try {
    const id = addKeyword(keyword.trim(), category, parseInt(priority ?? '5'))
    res.json({ id, keyword, category, priority: parseInt(priority ?? '5') })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/admin/keywords/:id', (req, res) => {
  if (!requireAdmin(req, res)) return
  deleteKeyword(req.params.id)
  res.json({ ok: true })
})

// --- Daily scan pipeline ---
async function runDailyScan() {
  console.log('[scan] ── Daily scan starting ──')

  // Phase 2: scrape
  let scrapeStats = { totalFound: 0, totalNew: 0 }
  try {
    scrapeStats = await runAllScrapers()
  } catch (err) {
    console.error('[scan] Scrape phase failed:', err.message)
  }

  // Phase 3: dedup + score + summarize
  let scoredArticles = []
  try {
    const unscored = getUnscoredArticles({ hours: 26 })
    console.log(`[scan] ${unscored.length} unscored articles`)
    if (unscored.length > 0) {
      const deduped = dedupByTitle(unscored)
      scoredArticles = await scoreArticles(deduped)
      const byId = Object.fromEntries(deduped.map((a) => [a.id, a]))
      await summarizeTopArticles(scoredArticles, byId)
    }
  } catch (err) {
    console.error('[scan] Processing phase failed:', err.message)
  }

  // Phase 6: embeddings
  try {
    await embedNewArticles()
  } catch (err) {
    console.error('[scan] Embedding phase failed:', err.message)
  }

  // Phase 4: digest + Discord
  try {
    const digest = await buildDailyDigest(scrapeStats)
    if (digest) {
      await sendDailyDigest(digest)
      saveDigest({
        digestType: 'daily',
        articleCount: digest.totalRelevant,
        topStoryId: digest.topStory?.id ?? null,
        summaryMarkdown: digest.intro,
      })
    }
  } catch (err) {
    console.error('[scan] Digest/delivery phase failed:', err.message)
  }

  console.log(
    `[scan] ── Done — ${scrapeStats.totalFound} scraped, ${scoredArticles.length} relevant ──`
  )
}

// --- Weekly summary pipeline ---
async function runWeeklySummary() {
  console.log('[weekly] ── Weekly summary starting ──')
  try {
    const result = await buildAndSendWeeklyEmail()
    if (result) {
      await sendWeeklyDiscordSummary(result.summaryMarkdown, {
        date_range: `Past 7 days · ${result.articleCount} articles`,
      })
      saveDigest({
        digestType: 'weekly',
        articleCount: result.articleCount,
        summaryMarkdown: result.summaryMarkdown,
        emailSentAt: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[weekly] Failed:', err.message)
  }
  console.log('[weekly] ── Done ──')
}

// --- SPA catch-all (must be last) ---
app.get('*', (_req, res) => {
  res.sendFile('index.html', { root: 'public' })
})

// --- Start ---
startScheduler({ onDailyScan: runDailyScan, onWeeklySummary: runWeeklySummary })

const { port } = config.server
app.listen(port, () => {
  console.log(`[server] Listening on port ${port} — https://ai-tech-radar.fly.dev`)
})

process.on('SIGTERM', () => {
  console.log('[server] SIGTERM — shutting down gracefully')
  process.exit(0)
})
