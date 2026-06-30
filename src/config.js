export const config = {
  server: {
    port: parseInt(process.env.PORT || '3002'),
    adminToken: process.env.ADMIN_TOKEN,
  },

  db: {
    // Fly volume in production, local file in dev
    path: process.env.DB_PATH || './data/radar.db',
  },

  ai: {
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
  },

  serper: {
    apiKey: process.env.SERPER_API_KEY,
  },

  voyage: {
    apiKey: process.env.VOYAGE_API_KEY,
    model: 'voyage-3-lite',
    dimensions: 512,
  },

  sources: {
    productHuntToken: process.env.PRODUCTHUNT_TOKEN,
    devtoApiKey: process.env.DEVTO_API_KEY,
  },

  notifications: {
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    resendApiKey: process.env.RESEND_API_KEY,
    notificationEmail: process.env.NOTIFICATION_EMAIL,
  },

  schedule: {
    daily: process.env.CRON_DAILY || '0 6 * * 1',
    weekly: process.env.CRON_WEEKLY || '0 7 * * 1',
    timezone: process.env.TIMEZONE || 'Europe/Copenhagen',
  },
}

export function validateConfig() {
  const required = [
    ['OPENROUTER_API_KEY', config.ai.openrouterApiKey],
    ['DISCORD_WEBHOOK_URL', config.notifications.discordWebhookUrl],
  ]

  const missing = required
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
