import cron from 'node-cron'
import { config } from './config.js'

let dailyJob = null
let weeklyJob = null
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

  nextRunDaily = computeNextRun(config.schedule.daily)

  console.log(`[scheduler] Daily scan scheduled: ${config.schedule.daily} (${tz})`)
  console.log(`[scheduler] Weekly summary scheduled: ${config.schedule.weekly} (${tz})`)
}

export function stopScheduler() {
  dailyJob?.stop()
  weeklyJob?.stop()
}

export function getSchedulerStatus() {
  return {
    lastRun,
    dailyCron: config.schedule.daily,
    weeklyCron: config.schedule.weekly,
    timezone: config.schedule.timezone,
  }
}
