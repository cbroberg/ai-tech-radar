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

// --- Validate env vars before starting ---
try {
  validateConfig()
} catch (err) {
  console.error(`[startup] ${err.message}`)
  process.exit(1)
}

// --- Run DB migrations ---
runMigrations()

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

// --- Digest ---
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

// --- Source monitoring ---
app.get('/api/sources/status', (_req, res) => {
  res.json(getSourceStatus())
})

// --- Daily scan pipeline ---
async function runDailyScan() {
  console.log('[scan] Starting daily scan...')

  // Phase 2: scrape
  const scrapeStats = await runAllScrapers()

  // Phase 3: dedup + score + summarize
  const unscored = await getUnscoredArticles({ hours: 26 })
  console.log(`[scan] ${unscored.length} unscored articles to process`)
  const deduped = dedupByTitle(unscored)
  const scoredArticles = await scoreArticles(deduped)
  const byId = Object.fromEntries(deduped.map((a) => [a.id, a]))
  await summarizeTopArticles(scoredArticles, byId)

  // Phase 4: build digest + deliver
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

  console.log(
    `[scan] Complete — ${scrapeStats.totalFound} scraped, ` +
    `${deduped.length} unique, ${scoredArticles.length} relevant`
  )
  return { ...scrapeStats, deduped: deduped.length, relevant: scoredArticles.length }
}

// --- Weekly summary pipeline ---
async function runWeeklySummary() {
  console.log('[weekly] Starting weekly summary...')
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
  console.log('[weekly] Done')
}

// --- Start scheduler ---
startScheduler({ onDailyScan: runDailyScan, onWeeklySummary: runWeeklySummary })

// --- Start server ---
const { port } = config.server
app.listen(port, () => {
  console.log(`[server] AI Tech Radar running on port ${port}`)
  console.log(`[server] Health: http://localhost:${port}/health`)
})

process.on('SIGTERM', () => {
  console.log('[server] SIGTERM — shutting down')
  process.exit(0)
})
