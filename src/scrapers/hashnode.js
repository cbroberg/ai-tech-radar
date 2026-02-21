import { BaseScraper } from './base-scraper.js'

const GQL = 'https://gql.hashnode.com'

const QUERY = `
  query {
    feed(first: 20, filter: { type: FEATURED }) {
      edges {
        node {
          title
          url
          brief
          publishedAt
          author { username }
          tags { name }
        }
      }
    }
  }
`

export class HashnodeScraper extends BaseScraper {
  constructor() {
    super('hashnode', { retries: 2, delayMs: 500 })
  }

  async fetch() {
    const res = await this.fetchWithTimeout(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
    })

    const { data } = await res.json()
    return (data?.feed?.edges ?? []).map(({ node }) => ({
      sourceUrl: node.url,
      title: node.title,
      contentSnippet: node.brief?.slice(0, 500) ?? null,
      author: node.author?.username ?? null,
      publishedAt: node.publishedAt,
    }))
  }
}

export default new HashnodeScraper()
