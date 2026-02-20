import * as cheerio from 'cheerio'
import { BaseScraper, sleep } from './base-scraper.js'

export class IndieHackersScraper extends BaseScraper {
  constructor() {
    super('indie-hackers', { retries: 1, delayMs: 3000 })
  }

  async fetch() {
    const res = await this.fetchWithTimeout('https://www.indiehackers.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Tech-Radar/1.0)' },
    })
    const html = await res.text()
    const $ = cheerio.load(html)
    const items = []

    $('a[href*="/post/"]').each((_, el) => {
      const href = $(el).attr('href')
      const title = $(el).text().trim()
      if (!href || !title || title.length < 10) return

      items.push({
        sourceUrl: href.startsWith('http') ? href : `https://www.indiehackers.com${href}`,
        title,
        contentSnippet: null,
        author: null,
        publishedAt: null,
      })
    })

    // Respectful delay after scraping
    await sleep(2000)

    // Deduplicate
    const seen = new Set()
    return items.filter(({ sourceUrl }) => {
      if (seen.has(sourceUrl)) return false
      seen.add(sourceUrl)
      return true
    })
  }
}

export default new IndieHackersScraper()
