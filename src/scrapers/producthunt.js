import { BaseScraper } from './base-scraper.js'
import { config } from '../config.js'

const GQL = 'https://api.producthunt.com/v2/api/graphql'

const QUERY = `
  query {
    posts(order: VOTES, first: 20, postedAfter: "${new Date(Date.now() - 86400000).toISOString()}") {
      edges {
        node {
          id
          name
          tagline
          url
          votesCount
          createdAt
          topics { edges { node { name } } }
        }
      }
    }
  }
`

export class ProductHuntScraper extends BaseScraper {
  constructor() {
    super('producthunt', { retries: 2, delayMs: 1000 })
  }

  async fetch() {
    if (!config.sources.productHuntToken) {
      console.warn('[producthunt] No token — skipping')
      return []
    }

    const res = await this.fetchWithTimeout(GQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.sources.productHuntToken}`,
      },
      body: JSON.stringify({ query: QUERY }),
    })

    const { data } = await res.json()
    return (data?.posts?.edges ?? []).map(({ node }) => ({
      sourceUrl: node.url,
      title: `${node.name} — ${node.tagline}`,
      contentSnippet: `${node.votesCount} votes. Topics: ${node.topics.edges.map((e) => e.node.name).join(', ')}`,
      author: null,
      publishedAt: node.createdAt,
    }))
  }
}

export default new ProductHuntScraper()
