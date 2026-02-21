import { RSS_SOURCES, RssScraper } from './scrapers/rss-generic.js'
import { getCustomSources } from './db/custom-sources.js'
import { getSqlite } from './db/client.js'
import hackerNews from './scrapers/hackernews.js'
import devTo from './scrapers/devto.js'
import productHunt from './scrapers/producthunt.js'
import hashnode from './scrapers/hashnode.js'
import githubReleases from './scrapers/github-releases.js'
import googleSearch from './scrapers/google-search.js'
import npmTrending from './scrapers/npm-trending.js'
import githubTrending from './scrapers/github-trending.js'
import indieHackers from './scrapers/indie-hackers.js'
import { startRun, completeRun, failRun } from './db/source-runs.js'
import { upsertArticles } from './db/articles.js'

async function runScraper(scraper) {
  const runId = startRun(scraper.name)
  try {
    const items = await scraper.run()
    const inserted = await upsertArticles(items)
    completeRun(runId, { itemsFound: items.length, itemsNew: inserted })
    console.log(`[${scraper.name}] ${items.length} found, ${inserted} new`)
    return { scraper: scraper.name, items, inserted }
  } catch (err) {
    failRun(runId, err.message)
    console.error(`[${scraper.name}] Failed: ${err.message}`)
    return { scraper: scraper.name, items: [], inserted: 0, error: err.message }
  }
}

// Registry — allows single-source rescrape from admin UI
const SCRAPER_REGISTRY = new Map([
  ...RSS_SOURCES.map((s) => [s.name, s]),
  ['hackernews', hackerNews],
  ['devto', devTo],
  ['producthunt', productHunt],
  ['hashnode', hashnode],
  ['github-releases', githubReleases],
  ['google-search', googleSearch],
  ['npm-trending', npmTrending],
  ['github-trending', githubTrending],
  ['indie-hackers', indieHackers],
])

export function getAllScraperNames() {
  return [...SCRAPER_REGISTRY.keys()]
}

export async function runScraperByName(name) {
  if (SCRAPER_REGISTRY.has(name)) return runScraper(SCRAPER_REGISTRY.get(name))
  // Check custom sources in DB
  const custom = getSqlite().query(
    'SELECT * FROM custom_rss_sources WHERE name = ? AND active = 1'
  ).get(name)
  if (custom) return runScraper(new RssScraper(custom.name, custom.feed_url))
  throw new Error(`Unknown scraper: ${name}`)
}

export async function runAllScrapers() {
  console.log('[orchestrator] Starting scan...')
  const startedAt = Date.now()

  // Batch 1: RSS feeds — built-in + custom sources from DB, all in parallel
  console.log('[orchestrator] Batch 1: RSS feeds')
  const customRss = getCustomSources().map((s) => new RssScraper(s.name, s.feed_url))
  const rssBatch = await Promise.allSettled([...RSS_SOURCES, ...customRss].map(runScraper))

  // Batch 2: API sources — parallel with natural rate limiting inside each scraper
  console.log('[orchestrator] Batch 2: API sources')
  const apiBatch = await Promise.allSettled([
    runScraper(hackerNews),
    runScraper(devTo),
    runScraper(productHunt),
    runScraper(hashnode),
    runScraper(githubReleases),
    runScraper(googleSearch),
    runScraper(npmTrending),
  ])

  // Batch 3: Web scrapes — sequential, respectful
  console.log('[orchestrator] Batch 3: Web scrapes')
  const scrapeBatch = []
  for (const scraper of [githubTrending, indieHackers]) {
    scrapeBatch.push(await runScraper(scraper))
  }

  const allResults = [
    ...rssBatch.map((r) => (r.status === 'fulfilled' ? r.value : { items: [], inserted: 0 })),
    ...apiBatch.map((r) => (r.status === 'fulfilled' ? r.value : { items: [], inserted: 0 })),
    ...scrapeBatch,
  ]

  const totalFound = allResults.reduce((sum, r) => sum + r.items.length, 0)
  const totalNew = allResults.reduce((sum, r) => sum + (r.inserted ?? 0), 0)
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

  console.log(
    `[orchestrator] Done in ${elapsed}s — ${totalFound} found, ${totalNew} new`
  )

  return { totalFound, totalNew, elapsed, results: allResults }
}
