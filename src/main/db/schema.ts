// Database schema — tables are added incrementally, one step at a time.
// Each change requires running: npm run db:generate

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const venues = sqliteTable('venues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address')
})
