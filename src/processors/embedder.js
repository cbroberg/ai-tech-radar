import { config } from '../config.js'
import { getSqlite, vecLoaded } from '../db/client.js'

const BATCH_SIZE = 64 // Voyage AI max batch size

async function fetchEmbeddings(texts, inputType = 'document') {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.voyage.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.voyage.model,
      input: texts,
      input_type: inputType,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Voyage AI error: ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  return data.data.map((d) => d.embedding) // number[][]
}

function storeEmbeddings(articles, embeddings) {
  const sqlite = getSqlite()
  const insertVec = sqlite.prepare(
    'INSERT OR REPLACE INTO vec_articles(article_id, embedding) VALUES (?, ?)'
  )
  const markEmbedded = sqlite.prepare(
    'UPDATE articles SET embedded = 1 WHERE id = ?'
  )

  const batch = sqlite.transaction(() => {
    for (let i = 0; i < articles.length; i++) {
      const vec = new Uint8Array(new Float32Array(embeddings[i]).buffer)
      insertVec.run(articles[i].id, vec)
      markEmbedded.run(articles[i].id)
    }
  })
  batch()
}

export async function embedNewArticles() {
  if (!vecLoaded) return
  if (!config.voyage.apiKey) {
    console.log('[embedder] No VOYAGE_API_KEY — skipping embeddings')
    return
  }

  const sqlite = getSqlite()
  // Articles with relevance score but not yet embedded
  const toEmbed = sqlite.query(`
    SELECT id, title, summary, content_snippet
    FROM articles
    WHERE relevance_score >= 0.4 AND embedded = 0
    ORDER BY scraped_at DESC
    LIMIT 200
  `).all()

  if (toEmbed.length === 0) {
    console.log('[embedder] No new articles to embed')
    return
  }

  console.log(`[embedder] Embedding ${toEmbed.length} articles`)
  let embedded = 0

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE)
    const texts = batch.map(
      (a) => `${a.title}. ${a.summary ?? a.content_snippet ?? ''}`.slice(0, 1000)
    )

    try {
      const embeddings = await fetchEmbeddings(texts, 'document')
      storeEmbeddings(batch, embeddings)
      embedded += batch.length
    } catch (err) {
      console.error(`[embedder] Batch failed: ${err.message}`)
    }
  }

  console.log(`[embedder] Done — ${embedded} articles embedded`)
}

export async function embedQuery(text) {
  const [embedding] = await fetchEmbeddings([text], 'query')
  return embedding
}
