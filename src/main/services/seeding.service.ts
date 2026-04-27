import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { RoundTeamRepository } from '../db/repositories/round-team.repo'
import type * as schema from '../db/schema'

export interface DrawEntry {
  id: string
  seedLo: number | null
  seedHi: number | null
}

export interface DrawResult {
  id: string
  seed: number
}

export function validateSeedNotation(lo: number | null, hi: number | null): string | null {
  if (lo === null && hi === null) return null
  if (lo === null || lo <= 0) return 'INVALID_SEED_RANGE'
  if (hi === null) return null
  if (hi <= 0 || lo >= hi) return 'INVALID_SEED_RANGE'
  if (!isPowerOfTwo(hi)) return 'SEED_HI_NOT_POWER_OF_TWO'
  if (lo === 1 && hi === 2) return null
  if (lo !== hi / 2 + 1) return 'SEED_LO_INVALID_FOR_HI'
  return null
}

export function buildDrawPlan(entries: DrawEntry[]): DrawResult[] {
  const n = entries.length
  const drawSize = Math.max(
    n,
    ...entries.map((entry) => entry.seedHi ?? entry.seedLo ?? 0)
  )
  const assigned = new Map<string, number>()
  const taken = new Set<number>()
  const groups = new Map<string, DrawEntry[]>()

  for (const entry of entries) {
    const error = validateSeedNotation(entry.seedLo, entry.seedHi)
    if (error) throw new Error(error)

    if (entry.seedLo !== null && entry.seedHi === null) {
      if (entry.seedLo > drawSize) throw new Error('BRACKET_TOO_SMALL_FOR_SEED')
      if (taken.has(entry.seedLo)) throw new Error('SEED_ALREADY_TAKEN')
      assigned.set(entry.id, entry.seedLo)
      taken.add(entry.seedLo)
    } else if (entry.seedLo !== null && entry.seedHi !== null) {
      const key = `${entry.seedLo}/${entry.seedHi}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(entry)
    }
  }

  for (const groupEntries of groups.values()) {
    const lo = groupEntries[0].seedLo!
    const hi = groupEntries[0].seedHi!
    if (hi > drawSize) throw new Error('BRACKET_TOO_SMALL_FOR_SEED')
    const slots = range(lo, hi).filter((seed) => !taken.has(seed))
    if (groupEntries.length > slots.length) throw new Error('SEED_GROUP_TOO_LARGE')
    shuffle(groupEntries).forEach((entry, index) => {
      const seed = slots[index]
      assigned.set(entry.id, seed)
      taken.add(seed)
    })
  }

  const remainingSeeds = range(1, drawSize).filter((seed) => !taken.has(seed))
  const unseeded = shuffle(entries.filter((entry) => entry.seedLo === null && entry.seedHi === null))
  unseeded.forEach((entry, index) => {
    assigned.set(entry.id, remainingSeeds[index])
  })

  return entries
    .map((entry) => ({ id: entry.id, seed: assigned.get(entry.id)! }))
    .sort((a, b) => a.seed - b.seed)
}

export function resolveDraw(
  db: BetterSQLite3Database<typeof schema>,
  roundId: string
) {
  return new RoundTeamRepository(db).resolveDraw(roundId)
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0
}

function range(from: number, to: number): number[] {
  const result: number[] = []
  for (let i = from; i <= to; i++) result.push(i)
  return result
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = result[i]
    result[i] = result[j]
    result[j] = tmp
  }
  return result
}
