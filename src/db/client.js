import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'
import { getLoadablePath } from 'sqlite-vec'
import { config } from '../config.js'
import * as schema from './schema.js'

let _sqlite = null
let _db = null
export let vecLoaded = false

function openDatabase() {
  const db = new Database(config.db.path)
  // Quick integrity check — catches corrupted files before they cause downstream errors
  try {
    const { integrity_check } = db.query('PRAGMA integrity_check').get()
    if (integrity_check !== 'ok') throw new Error(`integrity_check: ${integrity_check}`)
  } catch (err) {
    console.error(`[db] Corrupt DB detected (${err.message}) — wiping and starting fresh`)
    db.close()
    for (const suffix of ['', '-wal', '-shm']) {
      try { unlinkSync(config.db.path + suffix) } catch { /* ignore if missing */ }
    }
    return new Database(config.db.path)
  }
  return db
}

export function getSqlite() {
  if (_sqlite) return _sqlite

  mkdirSync(dirname(config.db.path), { recursive: true })

  _sqlite = openDatabase()

  // Load sqlite-vec for vector similarity search
  // Note: Bun's loadExtension appends the platform suffix (.so/.dylib) automatically,
  // so we strip the extension from the path that sqlite-vec returns (designed for Node).
  try {
    const fullPath = getLoadablePath()
    const pathWithoutExt = fullPath.replace(/\.(so|dylib|dll)$/, '')
    _sqlite.loadExtension(pathWithoutExt)
    vecLoaded = true
    console.log('[db] sqlite-vec loaded')
  } catch (err) {
    console.warn('[db] sqlite-vec unavailable — vector search disabled:', err.message)
  }

  _sqlite.exec('PRAGMA journal_mode = WAL;')
  _sqlite.exec('PRAGMA foreign_keys = ON;')

  return _sqlite
}

export function getDb() {
  if (_db) return _db
  _db = drizzle(getSqlite(), { schema })
  return _db
}
