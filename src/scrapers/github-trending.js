import * as cheerio from 'cheerio'
import { BaseScraper } from './base-scraper.js'

const LANGUAGES = ['javascript', 'typescript', 'python']

export class GitHubTrendingScraper extends BaseScraper {
  constructor() {
    super('github-trending', { retries: 2, delayMs: 2000 })
  }

  async fetch() {
    const results = []

    for (const lang of LANGUAGES) {
      try {
        const res = await this.fetchWithTimeout(
          `https://github.com/trending/${lang}?since=daily`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Tech-Radar/1.0)' } }
        )
        const html = await res.text()
        const $ = cheerio.load(html)

        $('article.Box-row').each((_, el) => {
          const repoPath = $(el).find('h2 a').attr('href')
          if (!repoPath) return

          const description = $(el).find('p').text().trim()
          const stars = $(el).find('[aria-label*="star"]').text().trim()

          results.push({
            sourceUrl: `https://github.com${repoPath}`,
            title: `[GitHub Trending] ${repoPath.replace('/', ' / ')}`,
            contentSnippet: `${description}${stars ? ` | ⭐ ${stars}` : ''}`.slice(0, 500),
            author: repoPath.split('/')[1],
            publishedAt: new Date().toISOString(),
          })
        })
      } catch (err) {
        console.warn(`[github-trending] Failed for ${lang}: ${err.message}`)
      }
    }

    return results
  }
}

export default new GitHubTrendingScraper()
