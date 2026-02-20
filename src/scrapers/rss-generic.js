import Parser from 'rss-parser'
import { BaseScraper } from './base-scraper.js'

const parser = new Parser({ timeout: 10_000 })

export class RssScraper extends BaseScraper {
  constructor(name, feedUrl) {
    super(name, { retries: 2, delayMs: 500 })
    this.feedUrl = feedUrl
  }

  async fetch() {
    const feed = await parser.parseURL(this.feedUrl)
    return feed.items.slice(0, 30).map((item) => ({
      sourceUrl: item.link,
      title: item.title,
      contentSnippet: item.contentSnippet || item.content?.slice(0, 500),
      author: item.creator || item.author,
      publishedAt: item.pubDate || item.isoDate,
    }))
  }
}

// All RSS sources as named instances
export const RSS_SOURCES = [
  new RssScraper('supabase-blog', 'https://supabase.com/blog/rss.xml'),
  new RssScraper('postgresql-news', 'https://www.postgresql.org/news.rss'),
  new RssScraper('cloudflare-blog', 'https://blog.cloudflare.com/rss/'),
  new RssScraper('fly-blog', 'https://fly.io/blog/feed.xml'),
  new RssScraper('react-blog', 'https://react.dev/blog/rss'),
  new RssScraper('vercel-blog', 'https://vercel.com/blog/rss.xml'),
  new RssScraper('docker-blog', 'https://www.docker.com/blog/feed/'),
  new RssScraper('anthropic-blog', 'https://www.anthropic.com/blog/rss'),
  new RssScraper('openai-blog', 'https://openai.com/blog/rss.xml'),
  new RssScraper('techcrunch-ai', 'https://techcrunch.com/category/artificial-intelligence/feed/'),
  new RssScraper('the-verge-ai', 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml'),
  new RssScraper('changelog', 'https://changelog.com/feed'),
  new RssScraper('import-ai', 'https://importai.substack.com/feed'),
  new RssScraper('lobsters', 'https://lobste.rs/rss'),
  new RssScraper('reddit-programming', 'https://www.reddit.com/r/programming/top/.rss?t=day'),
  new RssScraper('reddit-nextjs', 'https://www.reddit.com/r/nextjs/top/.rss?t=day'),
  new RssScraper('reddit-selfhosted', 'https://www.reddit.com/r/selfhosted/top/.rss?t=day'),
]
