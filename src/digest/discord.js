import { config } from '../config.js'
import { SITE_URL } from '../constants.js'

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
}

export async function sendDailyDigest(digest) {
  if (!digest) {
    console.warn('[discord] No digest to send')
    return null
  }

  const { totalRelevant, topStory } = digest
  const topTitle = topStory?.title?.slice(0, 80) ?? 'No top story'

  const payload = {
    content:
      `AI Tech Radar — Daily Digest\n` +
      `${totalRelevant} relevant articles · Top: "${topTitle}"\n` +
      SITE_URL,
  }

  await postToWebhook(payload)
  console.log(`[discord] Daily digest posted — ${totalRelevant} articles`)
  return payload
}

export async function sendWeeklyDiscordSummary(summaryText, stats) {
  const payload = {
    content:
      `AI Tech Radar — Weekly Summary\n` +
      `${stats.date_range}\n` +
      SITE_URL,
  }
  await postToWebhook(payload)
  console.log('[discord] Weekly summary posted')
}
