import type { CreatePlayerDTO } from '@shared/types/player'

// Known header aliases — rows matching these are skipped
const HEADER_ALIASES = new Set([
  'last_name', 'lastname', 'surname', 'фамилия',
  'first_name', 'firstname', 'name', 'имя',
  'family name', 'given name'
])

function detectSeparator(line: string): string {
  return line.includes(';') ? ';' : ','
}

function isHeaderRow(cells: string[]): boolean {
  return cells.length > 0 && HEADER_ALIASES.has(cells[0].toLowerCase().trim())
}

/**
 * Parse CSV content into player DTOs.
 * Expected column order: last_name, first_name[, club]
 * Supports comma and semicolon separators.
 * Skips empty rows and an optional header row.
 */
export function parsePlayersCSV(content: string): CreatePlayerDTO[] {
  const lines = content.split(/\r?\n/)
  if (lines.length === 0) return []

  const sep = detectSeparator(lines.find((l) => l.trim()) ?? ',')
  const result: CreatePlayerDTO[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const cells = trimmed.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''))

    if (result.length === 0 && isHeaderRow(cells)) continue

    const last_name = cells[0] ?? ''
    const first_name = cells[1] ?? ''
    const club = cells[2] ?? null

    if (!last_name || !first_name) continue

    result.push({
      last_name,
      first_name,
      club: club || null
    })
  }

  return result
}
