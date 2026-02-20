import express from 'express'
import { config, validateConfig } from './config.js'
import { startScheduler, getSchedulerStatus } from './scheduler.js'
import { runMigrations } from './db/migrate.js'
import { runAllScrapers } from './orchestrator.js'
import { getSourceStatus } from './db/source-runs.js'
import { getArticlesByScore, getUnscoredArticles } from './db/articles.js'
import { dedupByTitle } from './processors/dedup.js'
import { scoreArticles } from './processors/relevance-scorer.js'
import { summarizeTopArticles } from './processors/summarizer.js'

// --- Validate env vars before starting ---
try {
  validateConfig()
} catch (err) {
  console.error(`[startup] ${err.message}`)
  process.exit(1)
}

// --- Run DB migrations ---
await runMigrations()

const app = express()
app.use(express.json())

// --- Health check ---
app.get('/health', (_req, res) => {
  const { lastRun, dailyCron, weeklyCron, timezone } = getSchedulerStatus()
  res.json({
    status: 'ok',
    lastRun: lastRun ?? 'never',
    schedule: { daily: dailyCron, weekly: weeklyCron, timezone },
    uptime: Math.floor(process.uptime()),
  })
})

// --- Manual scan trigger (auth required) ---
app.post('/api/scan/trigger', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!config.server.adminToken || token !== config.server.adminToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  res.json({ status: 'triggered', startedAt: new Date().toISOString() })
  runDailyScan().catch((err) =>
    console.error('[trigger] Manual scan failed:', err.message)
  )
})

// --- Articles ---
app.get('/api/articles', async (req, res) => {
  const minScore = parseFloat(req.query.min_score ?? '0')
  const limit = parseInt(req.query.limit ?? '50')
  const articles = await getArticlesByScore({ minScore, limit })
  res.json(articles)
})

// --- Source monitoring ---
app.get('/api/sources/status', (_req, res) => {
  const runs = getSourceStatus()
  res.json(runs)
})

// --- Stub endpoints — Phase 4 ---
app.get('/api/digest/today', (_req, res) => {
  res.json({ status: 'not_implemented', phase: 4 })
})

app.get('/api/digest/latest', (_req, res) => {
  res.json({ status: 'not_implemented', phase: 4 })
})

// --- Scan pipeline ---
async function runDailyScan() {
  console.log('[scan] Starting daily scan...')

  // Phase 2: scrape all sources
  const scrapeStats = await runAllScrapers()

  // Phase 3: dedup + score + summarize
  const unscored = await getUnscoredArticles({ hours: 26 })
  console.log(`[scan] ${unscored.length} unscored articles to process`)

  const deduped = dedupByTitle(unscored)

  const scoredArticles = await scoreArticles(deduped)

  // Build a lookup map for the summarizer
  const byId = Object.fromEntries(deduped.map((a) => [a.id, a]))
  await summarizeTopArticles(scoredArticles, byId)

  // Phase 4: digest + delivery (next phase)

  console.log(
    `[scan] Complete — ${scrapeStats.totalFound} scraped, ` +
    `${deduped.length} unique, ${scoredArticles.length} relevant`
  )

  return { ...scrapeStats, deduped: deduped.length, relevant: scoredArticles.length }
}

async function runWeeklySummary() {
  console.log('[weekly] Starting weekly summary...')
  // Phase 4: digest/email-weekly.js
  console.log('[weekly] Weekly summary complete (stub)')
}

// --- Start scheduler ---
startScheduler({
  onDailyScan: runDailyScan,
  onWeeklySummary: runWeeklySummary,
})

// --- Start server ---
const { port } = config.server
app.listen(port, () => {
  console.log(`[server] AI Tech Radar running on port ${port}`)
  console.log(`[server] Health: http://localhost:${port}/health`)
})

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down gracefully')
  process.exit(0)
})
