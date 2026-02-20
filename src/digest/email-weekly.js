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

function buildEmailHtml({ summaryMarkdown, articles, weekRange }) {
  const articleRows = articles.slice(0, 20).map((a) => {
    const score = ((a.relevanceScore ?? 0) * 10).toFixed(1)
    const cats = (a.categories ?? []).join(', ')
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
          <a href="${a.sourceUrl}" style="color:#2563eb;text-decoration:none;font-weight:500;">
            ${escapeHtml(a.title)}
          </a>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">
            ${escapeHtml(a.source)} · Score ${score} · ${cats}
          </div>
          ${a.summary ? `<div style="font-size:13px;color:#374151;margin-top:4px;">${escapeHtml(a.summary)}</div>` : ''}
        </td>
      </tr>`
  }).join('')

  // Convert basic markdown to HTML (bold, headers)
  const summaryHtml = summaryMarkdown
    .replace(/^### (.+)$/gm, '<h3 style="color:#1f2937;margin:16px 0 4px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#111827;margin:20px 0 8px;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:#1e1b4b;padding:32px;color:#fff;">
      <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#a5b4fc;">AI Tech Radar</div>
      <h1 style="margin:8px 0 4px;font-size:24px;">Weekly Summary</h1>
      <div style="color:#c7d2fe;font-size:14px;">${weekRange}</div>
    </div>

    <!-- AI Summary -->
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="font-size:16px;color:#1f2937;margin:0 0 16px;">This Week's Themes</h2>
      <div style="font-size:14px;line-height:1.7;color:#374151;">${summaryHtml}</div>
    </div>

    <!-- Top Articles -->
    <div style="padding:24px 32px;">
      <h2 style="font-size:16px;color:#1f2937;margin:0 0 16px;">Top Articles</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${articleRows}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      AI Tech Radar · Delivered every Monday · Powered by Claude + Bun
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
