import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { config } from '../config.js'
import * as schema from './schema.js'

let _sqlite = null
let _db = null

export function getSqlite() {
  if (_sqlite) return _sqlite

  mkdirSync(dirname(config.db.path), { recursive: true })

  _sqlite = new Database(config.db.path)
  _sqlite.exec('PRAGMA journal_mode = WAL;')
  _sqlite.exec('PRAGMA foreign_keys = ON;')

  return _sqlite
}

export function getDb() {
  if (_db) return _db
  _db = drizzle(getSqlite(), { schema })
  return _db
}
