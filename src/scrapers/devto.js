import { BaseScraper } from './base-scraper.js'
import { config } from '../config.js'

const TAGS = ['ai', 'nextjs', 'react', 'devops', 'docker', 'webdev']
const PER_TAG = 10

export class DevToScraper extends BaseScraper {
  constructor() {
    super('devto', { retries: 2, delayMs: 500 })
  }

  async fetch() {
    const headers = config.sources.devtoApiKey
      ? { 'api-key': config.sources.devtoApiKey }
      : {}

    const results = await Promise.allSettled(
      TAGS.map((tag) =>
        this.fetchWithTimeout(
          `https://dev.to/api/articles?tag=${tag}&per_page=${PER_TAG}&top=1`,
          { headers }
        ).then((r) => r.json())
      )
    )

    const articles = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)

    // Deduplicate by URL within this scraper
    const seen = new Set()
    return articles
      .filter((a) => {
        if (seen.has(a.url)) return false
        seen.add(a.url)
        return true
      })
      .map((a) => ({
        sourceUrl: a.url,
        title: a.title,
        contentSnippet: a.description?.slice(0, 500) ?? null,
        author: a.user?.username ?? null,
        publishedAt: a.published_at,
        imageUrl: a.cover_image || a.social_image || null,
      }))
  }
}

export default new DevToScraper()
