// Render helpers — return HTML strings

const CAT_LABEL = {
  ai: 'AI & Agents', stack: 'Stack Updates', devops: 'DevOps & Platform',
  trend: 'Trending', other: 'Other',
}
const CAT_COLOR = {
  ai: '#7c3aed', stack: '#2563eb', devops: '#059669', trend: '#dc2626', other: '#6b7280',
}

export function categoryClass(cat) {
  const valid = ['ai', 'stack', 'devops', 'trend', 'other']
  return valid.includes(cat) ? `cat-${cat}` : 'cat-other'
}

export function scoreBadge(score) {
  const val = score ?? 0
  const label = (val * 10).toFixed(1)
  const cls = val >= 0.8 ? 'score-high' : val >= 0.6 ? 'score-med' : 'score-low'
  return `<span class="score-badge ${cls}">${label}</span>`
}

export function categoryBadge(cat) {
  const label = CAT_LABEL[cat] ?? CAT_LABEL.other
  const cls = categoryClass(cat)
  return `<span class="category-badge ${cls}">${label}</span>`
}

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function esc(str) {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function starButton(article) {
  const isStarred = article.starred
  return `<button class="star-btn ${isStarred ? 'starred' : ''}" data-star-id="${esc(article.id)}" title="${isStarred ? 'Unstar' : 'Star'}">${isStarred ? '★' : '☆'}</button>`
}

export function renderHero(article) {
  if (!article) return ''
  const cats = article.categories ?? []
  const primary = cats[0] ?? 'other'
  const color = CAT_COLOR[primary] ?? CAT_COLOR.other

  return `
    <article class="hero-card" data-id="${esc(article.id)}" role="button" tabindex="0">
      <div class="hero-gradient" style="background: radial-gradient(ellipse at top left, ${color} 0%, transparent 70%);"></div>
      <div class="hero-inner">
        <div class="hero-meta">
          <span class="hero-label">Top Story</span>
          ${categoryBadge(primary)}
          ${scoreBadge(article.relevanceScore)}
          ${starButton(article)}
        </div>
        <h2 class="hero-title">${esc(article.title)}</h2>
        ${article.summary ? `<p class="hero-summary">${esc(article.summary)}</p>` : ''}
        <div class="hero-footer">
          <span class="hero-source">${esc(article.source)}${article.publishedAt ? ' · ' + timeAgo(article.publishedAt) : ''}</span>
          <a href="${esc(article.sourceUrl)}" target="_blank" rel="noopener" class="btn btn-primary" onclick="event.stopPropagation()">Read Article →</a>
        </div>
      </div>
    </article>`
}

export function renderArticleCard(article) {
  const cats = article.categories ?? []
  const primary = cats[0] ?? 'other'
  const color = CAT_COLOR[primary] ?? CAT_COLOR.other
  const tags = (article.tags ?? []).slice(0, 3)

  return `
    <article class="article-card" data-id="${esc(article.id)}" role="button" tabindex="0">
      <div class="card-stripe" style="background: ${color};"></div>
      <div class="card-body">
        <div class="card-meta">
          ${categoryBadge(primary)}
          ${scoreBadge(article.relevanceScore)}
          ${starButton(article)}
        </div>
        <h3 class="card-title">${esc(article.title)}</h3>
        ${article.summary ? `<p class="card-summary">${esc(article.summary)}</p>` : '<p class="card-summary"></p>'}
        <div class="card-footer">
          <span class="card-source">${esc(article.source)}${article.publishedAt ? ' · ' + timeAgo(article.publishedAt) : ''}</span>
          ${tags.length ? `<div class="card-tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </article>`
}

export function renderCategoryTabs(counts, active, { starredCount = 0 } = {}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const tabs = [
    { key: 'all', label: 'All', count: total },
    { key: 'starred', label: '★ Starred', count: starredCount },
    { key: 'ai',     label: 'AI & Agents',  count: counts.ai     ?? 0 },
    { key: 'stack',  label: 'Stack',        count: counts.stack  ?? 0 },
    { key: 'devops', label: 'DevOps',       count: counts.devops ?? 0 },
    { key: 'trend',  label: 'Trending',     count: counts.trend  ?? 0 },
    { key: 'other',  label: 'Other',        count: counts.other  ?? 0 },
  ].filter(t => t.count > 0 || t.key === 'all')

  return `
    <div class="category-tabs" role="tablist">
      ${tabs.map(t => `
        <button class="tab-btn ${active === t.key ? 'active' : ''}" role="tab"
          aria-selected="${active === t.key}" data-cat="${t.key}">
          ${t.label} <span class="tab-count">${t.count}</span>
        </button>`).join('')}
    </div>`
}

export function renderArticleGrid(articles) {
  if (!articles.length) {
    return `<div class="empty-state">No articles in this category yet.</div>`
  }
  return `<div class="article-grid">${articles.map(renderArticleCard).join('')}</div>`
}

export function renderSearchResult(article) {
  return renderArticleCard(article)
}

export function renderDigestBanner(intro) {
  if (!intro) return ''
  const short = intro.split('\n')[0].replace(/[#*`]/g, '').trim()
  if (!short) return ''
  return `
    <div class="digest-banner">
      <div class="digest-banner-icon">📡</div>
      <div class="digest-banner-text">${esc(short)}</div>
    </div>`
}
