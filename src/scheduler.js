import cron from 'node-cron'
import { config } from './config.js'
import { deleteOldArticles } from './db/articles.js'

let dailyJob = null
let weeklyJob = null
let cleanupJob = null
let lastRun = null
let nextRunDaily = null

function computeNextRun(cronExpression) {
  // node-cron doesn't expose next run time directly, so we calculate it roughly
  // by checking the cron expression. For now we return a human-readable label.
  return cronExpression
}

export function startScheduler({ onDailyScan, onWeeklySummary }) {
  const tz = config.schedule.timezone

  dailyJob = cron.schedule(
    config.schedule.daily,
    async () => {
      console.log(`[scheduler] Daily scan triggered at ${new Date().toISOString()}`)
      lastRun = new Date().toISOString()
      try {
        await onDailyScan()
      } catch (err) {
        console.error('[scheduler] Daily scan failed:', err.message)
      }
    },
    { timezone: tz }
  )

  weeklyJob = cron.schedule(
    config.schedule.weekly,
    async () => {
      console.log(`[scheduler] Weekly summary triggered at ${new Date().toISOString()}`)
      try {
        await onWeeklySummary()
      } catch (err) {
        console.error('[scheduler] Weekly summary failed:', err.message)
      }
    },
    { timezone: tz }
  )

  // Monthly cleanup: 1st of each month at 04:00
  cleanupJob = cron.schedule(
    '0 4 1 * *',
    () => {
      console.log(`[scheduler] Monthly cleanup triggered at ${new Date().toISOString()}`)
      try {
        const deleted = deleteOldArticles()
        console.log(`[cleanup] Monthly cleanup: ${deleted} articles deleted`)
      } catch (err) {
        console.error('[scheduler] Monthly cleanup failed:', err.message)
      }
    },
    { timezone: tz }
  )

  nextRunDaily = computeNextRun(config.schedule.daily)

  console.log(`[scheduler] Daily scan scheduled: ${config.schedule.daily} (${tz})`)
  console.log(`[scheduler] Weekly summary scheduled: ${config.schedule.weekly} (${tz})`)
  console.log(`[scheduler] Monthly cleanup scheduled: 0 4 1 * * (${tz})`)
}

export function stopScheduler() {
  dailyJob?.stop()
  weeklyJob?.stop()
  cleanupJob?.stop()
}

export function getSchedulerStatus() {
  return {
    lastRun,
    dailyCron: config.schedule.daily,
    weeklyCron: config.schedule.weekly,
    timezone: config.schedule.timezone,
  }
}
