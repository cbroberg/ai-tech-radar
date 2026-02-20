import { BaseScraper } from './base-scraper.js'

const REPOS = [
  { owner: 'vercel', repo: 'next.js', name: 'Next.js' },
  { owner: 'oven-sh', repo: 'bun', name: 'Bun' },
  { owner: 'taskforcesh', repo: 'bullmq', name: 'BullMQ' },
  { owner: 'supabase', repo: 'supabase', name: 'Supabase' },
  { owner: 'drizzle-team', repo: 'drizzle-orm', name: 'Drizzle ORM' },
  { owner: 'anthropics', repo: 'anthropic-sdk-python', name: 'Anthropic SDK' },
]

export class GitHubReleasesScraper extends BaseScraper {
  constructor() {
    super('github-releases', { retries: 2, delayMs: 1000 })
  }

  async fetch() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const results = await Promise.allSettled(
      REPOS.map(({ owner, repo, name }) =>
        this.fetchWithTimeout(
          `https://api.github.com/repos/${owner}/${repo}/releases?per_page=3`,
          { headers: { 'User-Agent': 'AI-Tech-Radar/1.0', Accept: 'application/vnd.github+json' } }
        )
          .then((r) => r.json())
          .then((releases) =>
            releases
              .filter((r) => !r.prerelease && r.published_at > cutoff)
              .map((r) => ({
                sourceUrl: r.html_url,
                title: `${name} ${r.tag_name} released`,
                contentSnippet: r.body?.slice(0, 500) ?? null,
                author: r.author?.login ?? null,
                publishedAt: r.published_at,
              }))
          )
      )
    )

    return results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)
  }
}

export default new GitHubReleasesScraper()
