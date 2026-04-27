import { eq, and } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { RoundTeamWithTeam, RoundTableRow, RoundTableRowWithTeam } from '@shared/types/round-team'

type DrawInput = {
  id: string
  round_id: string
  team_id: string
  seed_lo: number | null
  seed_hi: number | null
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

export class RoundTeamRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  add(roundId: string, teamId: string): RoundTeamWithTeam {
    const id = randomUUID()
    this.db.insert(schema.round_teams).values({ id, round_id: roundId, team_id: teamId }).run()

    const tableId = randomUUID()
    this.db
      .insert(schema.round_table)
      .values({ id: tableId, round_id: roundId, team_id: teamId })
      .run()

    return this.getByIdOrThrow(id)
  }

  addMany(roundId: string, teamIds: string[]): RoundTeamWithTeam[] {
    return teamIds.map((teamId) => this.add(roundId, teamId))
  }

  listByRound(roundId: string): RoundTeamWithTeam[] {
    const rows = this.db
      .select({
        id: schema.round_teams.id,
        round_id: schema.round_teams.round_id,
        team_id: schema.round_teams.team_id,
        status: schema.round_teams.status,
        seed: schema.round_teams.seed,
        seed_lo: schema.tournament_teams.seed_lo,
        seed_hi: schema.tournament_teams.seed_hi,
        checked_in: schema.round_teams.checked_in,
        team_name: schema.teams.name,
        team_category: schema.teams.category
      })
      .from(schema.round_teams)
      .innerJoin(schema.rounds, eq(schema.round_teams.round_id, schema.rounds.id))
      .leftJoin(
        schema.tournament_teams,
        and(
          eq(schema.tournament_teams.event_id, schema.rounds.event_id),
          eq(schema.tournament_teams.team_id, schema.round_teams.team_id)
        )
      )
      .innerJoin(schema.teams, eq(schema.round_teams.team_id, schema.teams.id))
      .where(eq(schema.round_teams.round_id, roundId))
      .all()

    return rows.map((r) => ({
      id: r.id,
      round_id: r.round_id,
      team_id: r.team_id,
      status: r.status,
      seed: r.seed,
      seed_lo: r.seed_lo,
      seed_hi: r.seed_hi,
      checked_in: r.checked_in,
      team: { id: r.team_id, name: r.team_name, category: r.team_category }
    }))
  }

  resolveDraw(roundId: string): RoundTeamWithTeam[] {
    this.assertNoMatches(roundId)

    const rows = this.db
      .select({
        id: schema.round_teams.id,
        round_id: schema.round_teams.round_id,
        team_id: schema.round_teams.team_id,
        seed_lo: schema.tournament_teams.seed_lo,
        seed_hi: schema.tournament_teams.seed_hi
      })
      .from(schema.round_teams)
      .innerJoin(schema.rounds, eq(schema.round_teams.round_id, schema.rounds.id))
      .leftJoin(
        schema.tournament_teams,
        and(
          eq(schema.tournament_teams.event_id, schema.rounds.event_id),
          eq(schema.tournament_teams.team_id, schema.round_teams.team_id)
        )
      )
      .where(eq(schema.round_teams.round_id, roundId))
      .all()

    if (rows.length === 0) return []

    const size = nextPowerOf2(rows.length)
    this.validateRoundSeedConfiguration(rows, size)

    const assigned = new Map<string, number>()
    const taken = new Set<number>()

    for (const row of rows.filter((rt) => rt.seed_lo !== null && rt.seed_hi === null)) {
      assigned.set(row.id, row.seed_lo!)
      taken.add(row.seed_lo!)
    }

    const groups = new Map<string, DrawInput[]>()
    for (const row of rows.filter((rt) => rt.seed_lo !== null && rt.seed_hi !== null)) {
      const key = `${row.seed_lo}/${row.seed_hi}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    for (const groupRows of groups.values()) {
      const lo = groupRows[0].seed_lo!
      const hi = groupRows[0].seed_hi!
      const available = range(lo, Math.min(hi, rows.length)).filter((seed) => !taken.has(seed))
      const shuffledRows = shuffle(groupRows)
      shuffledRows.forEach((row, index) => {
        const seed = available[index]
        assigned.set(row.id, seed)
        taken.add(seed)
      })
    }

    const unseeded = shuffle(rows.filter((rt) => rt.seed_lo === null && rt.seed_hi === null))
    const remainingSeeds = range(1, rows.length).filter((seed) => !taken.has(seed))
    unseeded.forEach((row, index) => {
      assigned.set(row.id, remainingSeeds[index])
    })

    for (const [id, seed] of assigned) {
      this.db.update(schema.round_teams).set({ seed }).where(eq(schema.round_teams.id, id)).run()
    }

    return this.listByRound(roundId)
  }

  listTableByRound(roundId: string): RoundTableRow[] {
    return this.db
      .select()
      .from(schema.round_table)
      .where(eq(schema.round_table.round_id, roundId))
      .all()
  }

  listTableWithTeamsByRound(roundId: string): RoundTableRowWithTeam[] {
    const rows = this.db
      .select({
        id: schema.round_table.id,
        round_id: schema.round_table.round_id,
        team_id: schema.round_table.team_id,
        wins: schema.round_table.wins,
        losses: schema.round_table.losses,
        sets_won: schema.round_table.sets_won,
        sets_lost: schema.round_table.sets_lost,
        points_won: schema.round_table.points_won,
        points_lost: schema.round_table.points_lost,
        position: schema.round_table.position,
        team_name: schema.teams.name
      })
      .from(schema.round_table)
      .innerJoin(schema.teams, eq(schema.round_table.team_id, schema.teams.id))
      .where(eq(schema.round_table.round_id, roundId))
      .all()

    return rows.map((r) => ({
      id: r.id,
      round_id: r.round_id,
      team_id: r.team_id,
      wins: r.wins,
      losses: r.losses,
      sets_won: r.sets_won,
      sets_lost: r.sets_lost,
      points_won: r.points_won,
      points_lost: r.points_lost,
      position: r.position,
      team: { id: r.team_id, name: r.team_name }
    }))
  }

  remove(id: string): void {
    const row = this.db
      .select()
      .from(schema.round_teams)
      .where(eq(schema.round_teams.id, id))
      .get()
    if (!row) return

    this.db
      .delete(schema.round_table)
      .where(
        and(
          eq(schema.round_table.round_id, row.round_id),
          eq(schema.round_table.team_id, row.team_id)
        )
      )
      .run()
    this.db.delete(schema.round_teams).where(eq(schema.round_teams.id, id)).run()
  }

  private getByIdOrThrow(id: string): RoundTeamWithTeam {
    const rows = this.db
      .select({
        id: schema.round_teams.id,
        round_id: schema.round_teams.round_id,
        team_id: schema.round_teams.team_id,
        status: schema.round_teams.status,
        seed: schema.round_teams.seed,
        seed_lo: schema.tournament_teams.seed_lo,
        seed_hi: schema.tournament_teams.seed_hi,
        checked_in: schema.round_teams.checked_in,
        team_name: schema.teams.name,
        team_category: schema.teams.category
      })
      .from(schema.round_teams)
      .innerJoin(schema.rounds, eq(schema.round_teams.round_id, schema.rounds.id))
      .leftJoin(
        schema.tournament_teams,
        and(
          eq(schema.tournament_teams.event_id, schema.rounds.event_id),
          eq(schema.tournament_teams.team_id, schema.round_teams.team_id)
        )
      )
      .innerJoin(schema.teams, eq(schema.round_teams.team_id, schema.teams.id))
      .where(eq(schema.round_teams.id, id))
      .all()

    const row = rows[0]
    if (!row) throw new Error(`RoundTeam not found: ${id}`)
    return {
      id: row.id,
      round_id: row.round_id,
      team_id: row.team_id,
      status: row.status,
      seed: row.seed,
      seed_lo: row.seed_lo,
      seed_hi: row.seed_hi,
      checked_in: row.checked_in,
      team: { id: row.team_id, name: row.team_name, category: row.team_category }
    }
  }

  private assertNoMatches(roundId: string): void {
    const existing = this.db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .where(eq(schema.matches.round_id, roundId))
      .get()
    if (existing) throw new Error('ROUND_HAS_MATCHES')
  }

  private validateRoundSeedConfiguration(rows: DrawInput[], size: number): void {
    const exact = new Set<number>()
    const groups = new Map<string, DrawInput[]>()

    for (const row of rows) {
      const { seed_lo: lo, seed_hi: hi } = row
      if (lo === null && hi === null) continue
      if (lo === null || lo <= 0 || (hi !== null && hi <= 0) || (hi !== null && lo >= hi)) {
        throw new Error('INVALID_SEED_RANGE')
      }
      if (hi === null) {
        if (lo > rows.length) throw new Error('BRACKET_TOO_SMALL_FOR_SEED')
        if (exact.has(lo)) throw new Error('SEED_ALREADY_TAKEN')
        exact.add(lo)
        continue
      }
      if (!isPowerOfTwo(hi)) throw new Error('SEED_HI_NOT_POWER_OF_TWO')
      if (!(lo === 1 && hi === 2) && lo !== hi / 2 + 1) throw new Error('SEED_LO_INVALID_FOR_HI')
      if (size < hi) throw new Error('BRACKET_TOO_SMALL_FOR_SEED')
      const key = `${lo}/${hi}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    for (const [key, groupRows] of groups) {
      const [lo, hi] = key.split('/').map(Number)
      const slots = range(lo, Math.min(hi, rows.length))
      if (groupRows.length > slots.length) throw new Error('SEED_GROUP_TOO_LARGE')
      if (slots.some((seed) => exact.has(seed))) throw new Error('SEED_ALREADY_TAKEN')
    }
  }
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0
}

function nextPowerOf2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

function range(from: number, to: number): number[] {
  const result: number[] = []
  for (let i = from; i <= to; i++) result.push(i)
  return result
}
