import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import * as schema from './schema'

type Schema = typeof schema

let db: BetterSQLite3Database<Schema>

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'tournament.db')

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  db = drizzle(sqlite, { schema })

  const migrationsFolder = is.dev
    ? join(app.getAppPath(), 'src/main/db/migrations')
    : join(process.resourcesPath, 'migrations')

  migrate(db, { migrationsFolder })
}

export function getDb(): BetterSQLite3Database<Schema> {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}
