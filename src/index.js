import express from 'express'
import { config, validateConfig } from './config.js'
import { startScheduler, getSchedulerStatus } from './scheduler.js'

// --- Validate env vars before starting ---
try {
  validateConfig()
} catch (err) {
  console.error(`[startup] ${err.message}`)
  process.exit(1)
}

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

  // Run async, respond immediately
  res.json({ status: 'triggered', startedAt: new Date().toISOString() })

  runDailyScan().catch((err) =>
    console.error('[trigger] Manual scan failed:', err.message)
  )
})

// --- Stub endpoints — implemented in later phases ---
app.get('/api/digest/today', (_req, res) => {
  res.json({ status: 'not_implemented', phase: 4 })
})

app.get('/api/digest/latest', (_req, res) => {
  res.json({ status: 'not_implemented', phase: 4 })
})

app.get('/api/articles', (_req, res) => {
  res.json({ status: 'not_implemented', phase: 4 })
})

app.get('/api/sources/status', (_req, res) => {
  res.json({ status: 'not_implemented', phase: 2 })
})

// --- Scan pipeline (phases 2-4 will fill this in) ---
async function runDailyScan() {
  console.log('[scan] Starting daily scan...')
  // Phase 2: orchestrator.run()
  // Phase 3: processors
  // Phase 4: digest + delivery
  console.log('[scan] Daily scan complete (stub)')
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
