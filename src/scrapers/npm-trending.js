import { BaseScraper } from './base-scraper.js'

const KEYWORDS = ['ai', 'llm', 'agent', 'mcp', 'nextjs', 'drizzle', 'bun']

export class NpmTrendingScraper extends BaseScraper {
  constructor() {
    super('npm-trending', { retries: 2, delayMs: 500 })
  }

  async fetch() {
    const results = await Promise.allSettled(
      KEYWORDS.map((kw) =>
        this.fetchWithTimeout(
          `https://registry.npmjs.org/-/v1/search?text=${kw}&size=5&quality=0.5&popularity=1.0&maintenance=0.5`
        ).then((r) => r.json())
      )
    )

    const seen = new Set()
    return results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value.objects ?? [])
      .filter(({ package: pkg }) => {
        if (seen.has(pkg.name)) return false
        seen.add(pkg.name)
        return true
      })
      .map(({ package: pkg }) => ({
        sourceUrl: `https://www.npmjs.com/package/${pkg.name}`,
        title: `[npm] ${pkg.name} — ${pkg.description?.slice(0, 80) ?? ''}`,
        contentSnippet: pkg.description?.slice(0, 500) ?? null,
        author: pkg.publisher?.username ?? null,
        publishedAt: pkg.date,
      }))
  }
}

export default new NpmTrendingScraper()
