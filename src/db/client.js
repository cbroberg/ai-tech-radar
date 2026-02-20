import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { config } from '../config.js'
import * as schema from './schema.js'

let _db = null

export function getDb() {
  if (_db) return _db

  // Ensure data directory exists
  mkdirSync(dirname(config.db.path), { recursive: true })

  const sqlite = new Database(config.db.path)
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')

  _db = drizzle(sqlite, { schema })
  return _db
}
