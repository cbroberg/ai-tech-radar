import { BaseScraper } from './base-scraper.js'

const HN_API = 'https://hacker-news.firebaseio.com/v0'

export class HackerNewsScraper extends BaseScraper {
  constructor() {
    super('hackernews', { retries: 2, delayMs: 200 })
  }

  async fetch() {
    const res = await this.fetchWithTimeout(`${HN_API}/topstories.json`)
    const ids = await res.json()

    // Fetch top 30 stories in parallel
    const stories = await Promise.allSettled(
      ids.slice(0, 30).map((id) =>
        this.fetchWithTimeout(`${HN_API}/item/${id}.json`).then((r) => r.json())
      )
    )

    return stories
      .filter((r) => r.status === 'fulfilled' && r.value?.url)
      .map((r) => r.value)
      .map((story) => ({
        sourceUrl: story.url,
        title: story.title,
        contentSnippet: story.text?.slice(0, 500) ?? null,
        author: story.by,
        publishedAt: new Date(story.time * 1000).toISOString(),
      }))
  }
}

export default new HackerNewsScraper()
