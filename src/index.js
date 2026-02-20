import express from 'express'
import { config, validateConfig } from './config.js'
import { startScheduler, getSchedulerStatus } from './scheduler.js'
import { runMigrations } from './db/migrate.js'
import { runAllScrapers } from './orchestrator.js'
import { getSourceStatus } from './db/source-runs.js'
import { getArticlesByScore, getUnscoredArticles } from './db/articles.js'
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
  const articles = getArticlesByScore({ minScore, limit })
  res.json(articles)
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
