import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import { getWeeklyArticles } from '../db/digests.js'

const client = new Anthropic({ apiKey: config.anthropic.apiKey })

// --- Weekly summary via Claude ---

async function generateWeeklySummary(articles) {
  const topArticles = articles.slice(0, 30).map((a, i) =>
    `${i + 1}. [${a.source}] ${a.title}${a.summary ? ` — ${a.summary}` : ''}`
  ).join('\n')

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content:
        `Write a weekly tech digest summary for a Danish DevOps/AI developer. ` +
        `Identify 3-5 major themes or trends from this week. Be specific and actionable. ` +
        `Use markdown. Max 600 words.\n\nTop articles this week:\n${topArticles}`,
    }],
  })

  return response.content[0].text.trim()
}

// --- HTML email template ---

const CAT_COLORS = {
  ai: '#7c3aed', stack: '#2563eb', devops: '#059669', trend: '#dc2626', other: '#6b7280',
}
const CAT_LABELS = {
  ai: 'AI & Agents', stack: 'Stack Updates', devops: 'DevOps & Platform', trend: 'Trending', other: 'Other',
}

function scoreBadgeStyle(score) {
  if (score >= 0.8) return 'background:#d1fae5;color:#065f46;'
  if (score >= 0.6) return 'background:#fef3c7;color:#92400e;'
  return 'background:#f3f4f6;color:#6b7280;'
}

function featuredArticleCard(a) {
  const score = (a.relevanceScore ?? 0)
  const scoreLabel = (score * 10).toFixed(1)
  const cats = a.categories ?? []
  const primary = cats[0] ?? 'other'
  const catColor = CAT_COLORS[primary] ?? CAT_COLORS.other
  const catLabel = CAT_LABELS[primary] ?? 'Other'
  return `
    <tr>
      <td style="padding:0 0 16px;">
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="width:4px;background:${catColor};padding:0;"></td>
            <td style="padding:16px 20px;background:#fff;">
              <div style="margin-bottom:8px;">
                <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;background:${catColor}22;color:${catColor};">${catLabel}</span>
                <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;${scoreBadgeStyle(score)}">${scoreLabel}</span>
              </div>
              <a href="${escapeHtml(a.sourceUrl)}" style="display:block;font-size:16px;font-weight:700;color:#1a1a2e;text-decoration:none;font-family:Georgia,serif;line-height:1.4;margin-bottom:8px;">${escapeHtml(a.title)}</a>
              ${a.summary ? `<p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0 0 12px;">${escapeHtml(a.summary)}</p>` : ''}
              <div style="font-size:12px;color:#9ca3af;">${escapeHtml(a.source)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

function articleRow(a) {
  const score = (a.relevanceScore ?? 0)
  const scoreLabel = (score * 10).toFixed(1)
  const cats = a.categories ?? []
  const primary = cats[0] ?? 'other'
  const catColor = CAT_COLORS[primary] ?? CAT_COLORS.other
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:3px;background:${catColor};border-radius:2px;"></td>
            <td style="padding-left:12px;">
              <a href="${escapeHtml(a.sourceUrl)}" style="font-size:14px;font-weight:500;color:#1a1a2e;text-decoration:none;">${escapeHtml(a.title)}</a>
              <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${escapeHtml(a.source)} · ${scoreLabel}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

function buildEmailHtml({ summaryMarkdown, articles, weekRange }) {
  const featured = articles.slice(0, 5)
  const rest = articles.slice(5, 25)

  // Group rest by category
  const byCategory = {}
  for (const a of rest) {
    const primary = (a.categories ?? [])[0] ?? 'other'
    if (!byCategory[primary]) byCategory[primary] = []
    byCategory[primary].push(a)
  }

  const summaryHtml = summaryMarkdown
    .replace(/^### (.+)$/gm, '<h3 style="color:#1f2937;font-size:15px;margin:16px 0 6px;font-family:Georgia,serif;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#111827;font-size:17px;margin:20px 0 8px;font-family:Georgia,serif;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')

  const featuredRows = featured.map(featuredArticleCard).join('')

  const categoryRows = Object.entries(byCategory).map(([cat, catArticles]) => {
    const color = CAT_COLORS[cat] ?? CAT_COLORS.other
    const label = CAT_LABELS[cat] ?? 'Other'
    const rows = catArticles.map(articleRow).join('')
    return `
      <tr>
        <td style="padding:24px 0 8px;">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${color};border-bottom:2px solid ${color};padding-bottom:6px;margin-bottom:4px;">${label}</div>
        </td>
      </tr>
      ${rows}`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AI Tech Radar — Weekly Summary</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:36px 32px;color:#fff;">
      <div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#a5b4fc;margin-bottom:8px;">AI Tech Radar</div>
      <h1 style="margin:0 0 6px;font-size:28px;font-weight:800;font-family:Georgia,serif;letter-spacing:-.02em;">Weekly Summary</h1>
      <div style="color:#c7d2fe;font-size:14px;">${escapeHtml(weekRange)}</div>
      <div style="margin-top:20px;">
        <a href="https://ai-tech-radar.fly.dev" style="display:inline-block;padding:8px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View on web →</a>
      </div>
    </div>

    <!-- AI Summary -->
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="font-size:18px;font-weight:700;color:#1f2937;margin:0 0 16px;font-family:Georgia,serif;">This Week's Themes</h2>
      <div style="font-size:14px;line-height:1.8;color:#374151;">${summaryHtml}</div>
    </div>

    <!-- Featured Articles -->
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="font-size:18px;font-weight:700;color:#1f2937;margin:0 0 20px;font-family:Georgia,serif;">Top Stories</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${featuredRows}</tbody>
      </table>
    </div>

    <!-- Category sections -->
    ${Object.keys(byCategory).length > 0 ? `
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="font-size:18px;font-weight:700;color:#1f2937;margin:0 0 4px;font-family:Georgia,serif;">More Articles</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${categoryRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      <a href="https://ai-tech-radar.fly.dev" style="color:#7c3aed;text-decoration:none;font-weight:600;">ai-tech-radar.fly.dev</a>
      &nbsp;·&nbsp; Delivered every Monday &nbsp;·&nbsp; Powered by Claude + Bun
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str) {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function weekRange() {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - 7)
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} – ${fmt(now)}`
}

// --- Send via Resend ---

async function sendEmail(html, summaryMarkdown) {
  const { resendApiKey, notificationEmail } = config.notifications
  if (!resendApiKey) throw new Error('RESEND_API_KEY not set')
  if (!notificationEmail) throw new Error('NOTIFICATION_EMAIL not set')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AI Tech Radar <radar@resend.dev>',
      to: [notificationEmail],
      subject: `AI Tech Radar — Weekly Summary ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`,
      html,
      text: summaryMarkdown,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Resend failed: ${JSON.stringify(err)}`)
  }

  return res.json()
}

// --- Main export ---

export async function buildAndSendWeeklyEmail() {
  const articles = getWeeklyArticles()
  if (articles.length === 0) {
    console.warn('[email] No articles this week — skipping email')
    return null
  }

  console.log(`[email] Building weekly summary from ${articles.length} articles`)
  const summaryMarkdown = await generateWeeklySummary(articles)
  const range = weekRange()
  const html = buildEmailHtml({ summaryMarkdown, articles, weekRange: range })

  await sendEmail(html, summaryMarkdown)
  console.log(`[email] Weekly email sent to ${config.notifications.notificationEmail}`)

  return { summaryMarkdown, articleCount: articles.length }
}
