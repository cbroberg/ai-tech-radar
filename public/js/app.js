import { fetchFeed, fetchArticle, fetchSearch, toggleStar, fetchStarred, fetchArticlesBrowse } from './api.js'
import {
  renderHero, renderArticleGrid, renderCategoryTabs,
  renderDigestBanner, renderSearchResult, renderPagination, scoreBadge, categoryBadge, formatDate, starButton,
} from './components.js'

// ── Theme ────────────────────────────────────────────────────────────────────

const toggleBtn = document.getElementById('theme-toggle')

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙'
}

function initTheme() {
  const saved = localStorage.getItem('theme')
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  applyTheme(saved || preferred)
}

toggleBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  localStorage.setItem('theme', next)
  applyTheme(next)
})

initTheme()

// ── Router ───────────────────────────────────────────────────────────────────

const app = document.getElementById('app')

function setLoading() {
  app.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>'
}

function setError(msg) {
  app.innerHTML = `<div class="error-state"><h2>Something went wrong</h2><p>${msg}</p></div>`
}

async function render(path) {
  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(a => {
    const href = a.getAttribute('href')
    a.classList.toggle('active', href === path || (href === '/' && path === '/'))
  })

  setLoading()
  try {
    if (path === '/articles') {
      await renderArticlesView()
    } else if (path.startsWith('/articles/')) {
      await renderDetailView(path.slice('/articles/'.length))
    } else if (path === '/search' || path.startsWith('/search?')) {
      renderSearchView()
    } else {
      await renderHomeView()
    }
  } catch (err) {
    console.error('[app] render error:', err)
    setError(err.message)
  }
}

function navigate(path) {
  history.pushState(null, '', path)
  render(path)
}

window.addEventListener('popstate', () => render(location.pathname + location.search))

// Intercept clicks on [data-route] links
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-route]')
  if (!a) return
  e.preventDefault()
  navigate(a.getAttribute('href'))
})

// ── Home view ────────────────────────────────────────────────────────────────

async function renderHomeView() {
  const feed = await fetchFeed()
  let starredArticles = []
  try { starredArticles = await fetchStarred() } catch { /* ok */ }

  // Build flat sorted array for "all" tab
  const allArticles = Object.values(feed.grouped)
    .flat()
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))

  // Merge starred state into feed articles
  const starredIds = new Set(starredArticles.map(a => a.id))
  for (const a of allArticles) a.starred = starredIds.has(a.id)
  if (feed.topStory) feed.topStory.starred = starredIds.has(feed.topStory.id)
  for (const list of Object.values(feed.grouped)) {
    for (const a of list) a.starred = starredIds.has(a.id)
  }

  let activeCategory = 'all'

  function getVisibleArticles() {
    if (activeCategory === 'starred') return starredArticles
    if (activeCategory === 'all') return allArticles
    return feed.grouped[activeCategory] ?? []
  }

  function buildHTML() {
    const visible = getVisibleArticles()
    return `
      ${renderDigestBanner(feed.intro)}
      ${feed.topStory ? renderHero(feed.topStory) : ''}
      <div class="section-header">
        <span class="section-title">${feed.total} articles</span>
      </div>
      ${renderCategoryTabs(feed.counts, activeCategory, { starredCount: starredArticles.length })}
      <div id="article-grid-container">
        ${renderArticleGrid(visible)}
      </div>`
  }

  app.innerHTML = buildHTML()
  attachCardHandlers()
  attachStarHandlers()

  // Category tab clicks (re-render grid only)
  app.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab-btn')
    if (!tab) return
    activeCategory = tab.dataset.cat
    // Update tab states
    app.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === activeCategory)
      btn.setAttribute('aria-selected', btn.dataset.cat === activeCategory)
    })
    // Re-render grid
    document.getElementById('article-grid-container').innerHTML = renderArticleGrid(getVisibleArticles())
    attachCardHandlers()
    attachStarHandlers()
  })
}

function attachCardHandlers() {
  app.querySelectorAll('.article-card, .hero-card').forEach(card => {
    const handler = (e) => {
      if (e.target.closest('.star-btn')) return
      if (e.type === 'keydown' && e.key !== 'Enter') return
      navigate(`/articles/${card.dataset.id}`)
    }
    card.addEventListener('click', handler)
    card.addEventListener('keydown', handler)
  })
}

function attachStarHandlers() {
  app.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = btn.dataset.starId
      // Optimistic toggle
      const wasStarred = btn.classList.contains('starred')
      btn.classList.toggle('starred')
      btn.textContent = wasStarred ? '☆' : '★'
      try {
        await toggleStar(id)
      } catch {
        // Revert on failure
        btn.classList.toggle('starred')
        btn.textContent = wasStarred ? '★' : '☆'
      }
    })
  })
}

// ── Articles browse view ──────────────────────────────────────────────────────

async function renderArticlesView() {
  let state = { page: 1, minScore: 0, category: '', sort: 'relevance' }

  async function load() {
    const container = document.getElementById('articles-browse-container')
    if (container) container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>'

    const gridContainer = document.getElementById('articles-browse-container')
    if (!gridContainer) return

    // Starred is a special case — separate endpoint, no pagination
    if (state.category === 'starred') {
      const starred = await fetchStarred()
      gridContainer.innerHTML = `
        <div class="section-header">
          <span class="section-title">${starred.length} starred articles</span>
        </div>
        ${renderArticleGrid(starred)}`
      attachCardHandlers()
      attachStarHandlers()
      return
    }

    const data = await fetchArticlesBrowse({
      page: state.page,
      pageSize: 20,
      minScore: state.minScore,
      category: state.category || null,
      sort: state.sort,
    })

    gridContainer.innerHTML = `
      <div class="section-header">
        <span class="section-title">${data.total} articles · Page ${data.page} of ${data.totalPages}</span>
      </div>
      ${renderArticleGrid(data.items)}
      ${renderPagination(data.page, data.totalPages)}`

    attachCardHandlers()
    attachStarHandlers()

    // Pagination clicks
    gridContainer.querySelectorAll('.pagination [data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page)
        if (p >= 1 && p <= data.totalPages) {
          state.page = p
          load()
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      })
    })
  }

  app.innerHTML = `
    <div class="articles-browse">
      <h1 class="search-heading">All Articles</h1>
      <div class="articles-controls">
        <select class="filter-select" id="browse-category">
          <option value="">All Categories</option>
          <option value="starred">★ Starred</option>
          <option value="ai">AI & Agents</option>
          <option value="stack">Stack Updates</option>
          <option value="devops">DevOps & Platform</option>
          <option value="trend">Trending</option>
          <option value="other">Other</option>
        </select>
        <select class="filter-select" id="browse-score">
          <option value="0">Any Score</option>
          <option value="0.4">0.4+</option>
          <option value="0.6">0.6+</option>
          <option value="0.8">0.8+</option>
        </select>
        <select class="filter-select" id="browse-sort">
          <option value="relevance">Sort: Relevance</option>
          <option value="date">Sort: Newest</option>
        </select>
      </div>
      <div id="articles-browse-container">
        <div class="loading-state"><div class="spinner"></div></div>
      </div>
    </div>`

  // Attach filter handlers
  document.getElementById('browse-category').addEventListener('change', (e) => {
    state.category = e.target.value
    state.page = 1
    load()
  })
  document.getElementById('browse-score').addEventListener('change', (e) => {
    state.minScore = parseFloat(e.target.value)
    state.page = 1
    load()
  })
  document.getElementById('browse-sort').addEventListener('change', (e) => {
    state.sort = e.target.value
    state.page = 1
    load()
  })

  await load()
}

// ── Search view ───────────────────────────────────────────────────────────────

function renderSearchView() {
  const urlQ = new URLSearchParams(location.search).get('q') || ''

  app.innerHTML = `
    <div class="search-view">
      <h1 class="search-heading">Search Articles</h1>
      <p class="search-sub">Semantic search powered by vector embeddings</p>
      <form class="search-form" id="search-form">
        <input class="search-input" type="search" id="search-input"
          placeholder="e.g. Claude API tool use, Kubernetes autoscaling…"
          autocomplete="off" value="${urlQ.replace(/"/g, '&quot;')}">
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
      <div id="search-results"></div>
    </div>`

  const form = document.getElementById('search-form')
  const input = document.getElementById('search-input')
  const results = document.getElementById('search-results')
  requestAnimationFrame(() => input.focus())

  let debounceTimer = null

  async function doSearch(query, updateUrl = true) {
    if (!query.trim()) { results.innerHTML = ''; return }
    // Persist query in URL so back-navigation restores it
    if (updateUrl) history.replaceState(null, '', `/search?q=${encodeURIComponent(query.trim())}`)
    results.innerHTML = '<div class="loading-state" style="padding:40px 0"><div class="spinner"></div></div>'
    try {
      const data = await fetchSearch(query.trim(), 12)
      if (!data.results.length) {
        results.innerHTML = '<div class="empty-state">No results found. Try a different query.</div>'
        return
      }
      results.innerHTML = `
        <div class="search-results-header">${data.count} results for "<strong>${query}</strong>"</div>
        <div class="article-grid">${data.results.map(r => renderSearchResult(r)).join('')}</div>`
      attachCardHandlers()
      attachStarHandlers()
    } catch (err) {
      results.innerHTML = `<div class="error-state"><h2>Search unavailable</h2><p>${err.message}</p></div>`
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); doSearch(input.value) })

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => doSearch(input.value), 300)
  })

  // Restore search results if query was in URL
  if (urlQ) doSearch(urlQ, false)
}

// ── Article detail view ───────────────────────────────────────────────────────

function esc(str) {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function renderDetailView(id) {
  const article = await fetchArticle(id)
  const cats = article.categories ?? []
  const primary = cats[0] ?? 'other'
  const tags = article.tags ?? []

  document.title = `${article.title} — AI Tech Radar`

  app.innerHTML = `
    <div class="detail-view">
      <a href="#" class="detail-back" id="detail-back-link">← Back</a>
      <div class="detail-meta">
        ${categoryBadge(primary)}
        ${scoreBadge(article.relevanceScore)}
        ${starButton(article)}
      </div>
      <h1 class="detail-title">${esc(article.title)}</h1>
      <div class="detail-byline">
        <span>📰 ${esc(article.source)}</span>
        ${article.author ? `<span>✍️ ${esc(article.author)}</span>` : ''}
        <span>🕐 ${formatDate(article.publishedAt || article.scrapedAt)}</span>
      </div>
      ${article.summary ? `<div class="detail-summary">${esc(article.summary)}</div>` : ''}
      ${tags.length ? `<div class="detail-tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="detail-cta">
        <a href="${esc(article.sourceUrl)}" target="_blank" rel="noopener" class="btn btn-primary">Read at Source →</a>
        <button class="btn btn-outline" onclick="window.history.back()">← Back</button>
      </div>
    </div>`

  document.getElementById('detail-back-link')?.addEventListener('click', (e) => {
    e.preventDefault()
    document.title = 'AI Tech Radar'
    window.history.back()
  })

  attachStarHandlers()
}

// ── Cmd+K search shortcut ─────────────────────────────────────────────────────

document.getElementById('search-trigger')?.addEventListener('click', () => {
  navigate('/search')
})

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    navigate('/search')
  }
})

// ── Boot ──────────────────────────────────────────────────────────────────────

render(location.pathname + location.search)
