import express from 'express'
import { config, validateConfig } from './config.js'
import { startScheduler, getSchedulerStatus } from './scheduler.js'
import { runMigrations } from './db/migrate.js'
import { runAllScrapers } from './orchestrator.js'
import { getSourceStatus } from './db/source-runs.js'
import { getArticlesByScore } from './db/articles.js'

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
  const stats = await runAllScrapers()
  // Phase 3: processors (scoring, summarizing)
  // Phase 4: digest + delivery
  console.log(`[scan] Done — ${stats.totalFound} found, ${stats.totalNew} new`)
  return stats
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
