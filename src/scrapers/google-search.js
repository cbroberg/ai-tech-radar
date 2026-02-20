import { BaseScraper } from './base-scraper.js'
import { config } from '../config.js'

const QUERIES = [
  'autonomous AI agent 2025',
  'MCP server Model Context Protocol',
  'Next.js Supabase developer tool',
  'Fly.io Bun deployment',
  'AI coding vibe coding agentic',
]

export class GoogleSearchScraper extends BaseScraper {
  constructor() {
    super('google-search', { retries: 1, delayMs: 1000 })
  }

  async fetch() {
    if (!config.serper.apiKey) {
      console.warn('[google-search] No SERPER_API_KEY — skipping')
      return []
    }

    const results = await Promise.allSettled(
      QUERIES.map((q) =>
        this.fetchWithTimeout('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': config.serper.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q, num: 10, gl: 'us', hl: 'en' }),
        }).then((r) => r.json())
      )
    )

    return results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value.organic ?? [])
      .map((item) => ({
        sourceUrl: item.link,
        title: item.title,
        contentSnippet: item.snippet?.slice(0, 500) ?? null,
        author: null,
        publishedAt: null,
      }))
  }
}

export default new GoogleSearchScraper()
