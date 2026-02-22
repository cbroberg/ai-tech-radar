const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = 2
const DEFAULT_DELAY_MS = 1_000

export class BaseScraper {
  constructor(name, { retries = DEFAULT_RETRIES, delayMs = DEFAULT_DELAY_MS } = {}) {
    this.name = name
    this.retries = retries
    this.delayMs = delayMs
  }

  // Subclasses implement this
  async fetch() {
    throw new Error(`${this.name}.fetch() not implemented`)
  }

  async run() {
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      try {
        const items = await this.fetch()
        return items.filter(Boolean).map((item) => this.#normalize(item))
      } catch (err) {
        if (attempt > this.retries) throw err
        console.warn(`[${this.name}] Attempt ${attempt} failed: ${err.message}. Retrying...`)
        await sleep(this.delayMs * attempt)
      }
    }
    return []
  }

  #normalize(item) {
    return {
      source: this.name,
      sourceUrl: item.sourceUrl || item.url || item.link,
      title: item.title?.trim() ?? '(no title)',
      contentSnippet: item.contentSnippet?.slice(0, 500) ?? null,
      author: item.author ?? null,
      publishedAt: item.publishedAt ?? item.pubDate ?? null,
      imageUrl: item.imageUrl ?? null,
    }
  }

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
      return res
    } finally {
      clearTimeout(timer)
    }
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
