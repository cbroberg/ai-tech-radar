// ── Theme ─────────────────────────────────────────────────────────────────────
const toggleBtn = document.getElementById('theme-toggle')
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
  toggleBtn.textContent = t === 'dark' ? '☀️' : '🌙'
}
;(() => {
  const saved = localStorage.getItem('theme')
  const pref = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  applyTheme(saved || pref)
})()
toggleBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  localStorage.setItem('theme', next)
  applyTheme(next)
})

// ── Auth ───────────────────────────────────────────────────────────────────────
let token = sessionStorage.getItem('admin_token') || ''

const loginOverlay = document.getElementById('login-overlay')
const tokenInput   = document.getElementById('token-input')
const loginBtn     = document.getElementById('login-btn')
const loginError   = document.getElementById('login-error')

async function tryLogin() {
  const t = tokenInput.value.trim()
  if (!t) return
  loginBtn.disabled = true
  loginBtn.textContent = 'Checking…'
  const res = await fetch('/api/admin/status', { headers: { Authorization: `Bearer ${t}` } })
  if (res.status === 401) {
    loginError.textContent = 'Invalid token.'
    loginBtn.disabled = false
    loginBtn.textContent = 'Sign in'
    return
  }
  token = t
  sessionStorage.setItem('admin_token', token)
  loginOverlay.style.display = 'none'
  const data = await res.json()
  renderPage(data)
}

loginBtn.addEventListener('click', tryLogin)
tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin() })

// ── API ────────────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  })
  if (res.status === 401) { sessionStorage.removeItem('admin_token'); location.reload() }
  return res.json()
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr || dateStr === 'never') return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function statusPill(status) {
  const map = {
    success: ['success', '✓ ok'],
    failed:  ['failed',  '✗ failed'],
    running: ['running', '⟳ running'],
  }
  const [cls, label] = map[status] ?? ['never', '— never']
  return `<span class="status-pill status-${cls}">${label}</span>`
}

function catPill(cat) {
  return `<span class="cat-pill cat-${cat}">${cat}</span>`
}

function sourceGroup(name) {
  if (name.startsWith('medium-'))  return 'Medium RSS'
  if (name.startsWith('reddit-'))  return 'Reddit RSS'
  if (name.includes('-blog') || name.includes('-news') || name === 'changelog' || name === 'import-ai' || name === 'lobsters') return 'RSS'
  if (name === 'hackernews' || name === 'devto' || name === 'producthunt' || name === 'hashnode') return 'API'
  if (name.startsWith('github') || name === 'npm-trending') return 'GitHub/npm'
  if (name === 'google-search') return 'Search'
  return 'Scrape'
}

// ── Render ─────────────────────────────────────────────────────────────────────
function renderPage(data) {
  // Stats
  document.getElementById('stat-articles').textContent  = data.db.articles.toLocaleString()
  document.getElementById('stat-scored').textContent    = data.db.scored.toLocaleString()
  document.getElementById('stat-embedded').textContent  = data.db.embedded.toLocaleString()
  document.getElementById('stat-sources').textContent   = data.allSources.length
  document.getElementById('last-run-label').textContent = `Last scan: ${timeAgo(data.lastRun)}`

  // Build source map from runs (keyed by source name)
  const runMap = {}
  for (const r of data.sources) runMap[r.source] = r

  // Render sources table — allSources is now [{name, custom, id?, feedUrl?}]
  const tbody = document.getElementById('sources-tbody')
  tbody.innerHTML = data.allSources.map((source) => {
    const { name } = source
    const run = runMap[name]
    const status   = run?.status ?? 'never'
    const found    = run?.items_found ?? '—'
    const newItems = run?.items_new ?? '—'
    const lastRun  = run ? timeAgo(run.started_at) : '—'
    const error    = run?.error_message ?? ''
    const group    = source.custom ? 'Custom RSS' : sourceGroup(name)

    const deleteBtn = source.custom
      ? `<button class="delete-btn" data-source-id="${source.id}" data-source-name="${name}" title="Delete">✕</button>`
      : ''

    return `<tr>
      <td>
        <div class="source-name">${name}</div>
        <div class="source-group">${group}</div>
      </td>
      <td>
        ${statusPill(status)}
        ${error ? `<div class="error-tip" title="${error}">${error}</div>` : ''}
      </td>
      <td class="num muted">${found}</td>
      <td class="num muted">${newItems}</td>
      <td class="faint" style="font-size:12px">${lastRun}</td>
      <td style="white-space:nowrap">
        <button class="rescrape-btn" data-source="${name}">Rescrape</button>${deleteBtn}
      </td>
    </tr>`
  }).join('')

  attachRowButtons()

  // Render keywords table
  if (data.keywords) renderKeywords(data.keywords)
}

function renderKeywords(keywords) {
  const tbody = document.getElementById('keywords-tbody')
  if (!keywords.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-faint)">No keywords yet</td></tr>'
    return
  }
  tbody.innerHTML = keywords.map((kw) => `<tr>
    <td style="font-family:monospace;font-size:13px">${kw.keyword}</td>
    <td>${catPill(kw.category)}</td>
    <td class="num muted">${kw.priority}</td>
    <td><button class="delete-btn" data-kw-id="${kw.id}">✕</button></td>
  </tr>`).join('')

  document.querySelectorAll('[data-kw-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true
      await apiFetch(`/api/admin/keywords/${btn.dataset.kwId}`, { method: 'DELETE' })
      const data = await apiFetch('/api/admin/status')
      renderPage(data)
    })
  })
}

function attachRowButtons() {
  // Rescrape buttons
  document.querySelectorAll('.rescrape-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const source = btn.dataset.source
      btn.disabled = true
      btn.classList.add('running')
      btn.textContent = '⟳ Running…'
      await apiFetch(`/api/admin/scan/${source}`, { method: 'POST' })
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        const data = await apiFetch('/api/admin/status')
        const run = data.sources.find((r) => r.source === source)
        if (run?.status === 'success' || run?.status === 'failed' || attempts > 30) {
          clearInterval(poll)
          btn.classList.remove('running')
          btn.classList.add('done')
          btn.textContent = run?.status === 'failed' ? '✗ Failed' : '✓ Done'
          btn.disabled = false
          renderPage(data)
          setTimeout(() => {
            btn.classList.remove('done')
            btn.textContent = 'Rescrape'
          }, 4000)
        }
      }, 3000)
    })
  })

  // Delete source buttons
  document.querySelectorAll('[data-source-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete source "${btn.dataset.sourceName}"?`)) return
      btn.disabled = true
      await apiFetch(`/api/admin/sources/${btn.dataset.sourceId}`, { method: 'DELETE' })
      const data = await apiFetch('/api/admin/status')
      renderPage(data)
    })
  })
}

// ── Global action buttons ──────────────────────────────────────────────────────
document.getElementById('btn-scan-all').addEventListener('click', async () => {
  const btn = document.getElementById('btn-scan-all')
  btn.disabled = true
  btn.textContent = '⟳ Running…'
  btn.classList.add('running-pulse')
  await apiFetch('/api/admin/scan/all', { method: 'POST' })

  const before = document.getElementById('stat-articles').textContent
  let attempts = 0
  const poll = setInterval(async () => {
    attempts++
    const data = await apiFetch('/api/admin/status')
    renderPage(data)
    const after = document.getElementById('stat-articles').textContent
    if (after !== before || attempts > 60) {
      clearInterval(poll)
      btn.disabled = false
      btn.textContent = '⚡ Rescrape All + Score'
      btn.classList.remove('running-pulse')
    }
  }, 5000)
})

document.getElementById('btn-refresh').addEventListener('click', async () => {
  const data = await apiFetch('/api/admin/status')
  renderPage(data)
})

// ── Add keyword form ───────────────────────────────────────────────────────────
document.getElementById('btn-add-kw').addEventListener('click', async () => {
  const keyword  = document.getElementById('new-kw').value.trim()
  const category = document.getElementById('new-kw-cat').value
  const priority = document.getElementById('new-kw-priority').value
  const errEl    = document.getElementById('kw-error')
  errEl.textContent = ''
  if (!keyword) { errEl.textContent = 'Keyword required'; return }

  const btn = document.getElementById('btn-add-kw')
  btn.disabled = true
  const res = await apiFetch('/api/admin/keywords', {
    method: 'POST',
    body: JSON.stringify({ keyword, category, priority }),
  })
  btn.disabled = false

  if (res.error) { errEl.textContent = res.error; return }

  document.getElementById('new-kw').value = ''
  const data = await apiFetch('/api/admin/status')
  renderPage(data)
})
document.getElementById('new-kw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-kw').click()
})

// ── Add custom source form ─────────────────────────────────────────────────────
document.getElementById('btn-add-src').addEventListener('click', async () => {
  const name   = document.getElementById('new-src-name').value.trim()
  const feedUrl = document.getElementById('new-src-url').value.trim()
  const errEl  = document.getElementById('src-error')
  errEl.textContent = ''
  if (!name || !feedUrl) { errEl.textContent = 'Name and URL required'; return }

  const btn = document.getElementById('btn-add-src')
  btn.disabled = true
  const res = await apiFetch('/api/admin/sources', {
    method: 'POST',
    body: JSON.stringify({ name, feedUrl }),
  })
  btn.disabled = false

  if (res.error) { errEl.textContent = res.error; return }

  document.getElementById('new-src-name').value = ''
  document.getElementById('new-src-url').value = ''
  const data = await apiFetch('/api/admin/status')
  renderPage(data)
})

// ── Discover source ────────────────────────────────────────────────────────────
document.getElementById('btn-discover').addEventListener('click', async () => {
  const query   = document.getElementById('discover-query').value.trim()
  const errEl   = document.getElementById('discover-error')
  errEl.textContent = ''
  if (!query) { errEl.textContent = 'Enter a name or URL'; return }

  const btn = document.getElementById('btn-discover')
  btn.disabled = true
  btn.textContent = '🤖 Thinking…'

  const res = await apiFetch('/api/admin/discover-source', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
  btn.disabled = false
  btn.textContent = '🤖 Discover feed'

  if (res.error) { errEl.textContent = res.error; return }

  // Pre-fill the manual add form with discovered values
  document.getElementById('new-src-name').value = res.name ?? ''
  document.getElementById('new-src-url').value  = res.feedUrl ?? ''
  document.getElementById('discover-query').value = ''
  document.getElementById('new-src-name').focus()
})
document.getElementById('discover-query').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-discover').click()
})

// ── Boot ───────────────────────────────────────────────────────────────────────
if (token) {
  apiFetch('/api/admin/status').then((data) => {
    loginOverlay.style.display = 'none'
    renderPage(data)
  }).catch(() => {
    // Token invalid — show login
  })
} else {
  tokenInput.focus()
}
