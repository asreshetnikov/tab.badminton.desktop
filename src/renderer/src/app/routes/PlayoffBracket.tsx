import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import type {
  Tournament,
  Event,
  Round,
  MatchWithTeams,
  UpdateMatchResultDTO
} from '@shared/types/ipc'
import type { MatchStatus } from '@shared/types/match'

// ─── Layout constants ─────────────────────────────────────────────────────────
const MATCH_W = 180
const MATCH_H = 64
const H_GAP = 60
const V_GAP = 24
const SVG_PAD = 20
const LABEL_H = 28

// ─── Bracket layout ───────────────────────────────────────────────────────────

interface LayoutNode {
  match: MatchWithTeams
  x: number
  y: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFn = (key: string, opts?: any) => string

function computeLayout(
  matches: MatchWithTeams[],
  t: TFn
): {
  nodes: LayoutNode[]
  connectors: string[]
  levelLabels: { label: string; x: number }[]
  width: number
  height: number
} {
  const empty = { nodes: [], connectors: [], levelLabels: [], width: 0, height: 0 }
  if (!matches.length) return empty

  const byId = new Map(matches.map((m) => [m.id, m]))

  // BFS from final (win_match_id === null) down to first round
  const levelsRev: MatchWithTeams[][] = []
  let cur = matches.filter((m) => !m.win_match_id)
  while (cur.length > 0) {
    levelsRev.push(cur)
    const next: MatchWithTeams[] = []
    for (const m of cur) {
      if (m.left_match_id) {
        const c = byId.get(m.left_match_id)
        if (c) next.push(c)
      }
      if (m.right_match_id) {
        const c = byId.get(m.right_match_id)
        if (c) next.push(c)
      }
    }
    cur = next
  }
  const levels = levelsRev.reverse() // levels[0] = first round
  const numRounds = levels.length

  // Y positions: first round evenly spaced, later rounds at midpoint of children
  const matchY = new Map<string, number>()
  const yStart = SVG_PAD + LABEL_H
  levels[0].forEach((m, i) => matchY.set(m.id, yStart + i * (MATCH_H + V_GAP)))
  for (let l = 1; l < numRounds; l++) {
    for (const m of levels[l]) {
      const lcy = m.left_match_id != null ? (matchY.get(m.left_match_id)! + MATCH_H / 2) : null
      const rcy = m.right_match_id != null ? (matchY.get(m.right_match_id)! + MATCH_H / 2) : null
      const y =
        lcy != null && rcy != null
          ? (lcy + rcy) / 2 - MATCH_H / 2
          : (lcy ?? rcy ?? yStart)
      matchY.set(m.id, y)
    }
  }

  // X positions: level l is at column l from left
  const matchX = new Map<string, number>()
  levels.forEach((level, l) => {
    const x = SVG_PAD + l * (MATCH_W + H_GAP)
    level.forEach((m) => matchX.set(m.id, x))
  })

  const nodes: LayoutNode[] = matches.map((m) => ({
    match: m,
    x: matchX.get(m.id) ?? 0,
    y: matchY.get(m.id) ?? 0
  }))

  // Connector paths
  const connectors: string[] = []
  for (let l = 1; l < numRounds; l++) {
    for (const m of levels[l]) {
      const px = matchX.get(m.id)!
      const pcy = matchY.get(m.id)! + MATCH_H / 2
      const xMid = px - H_GAP / 2
      const childRX = px - H_GAP // child column right edge

      const lcy = m.left_match_id != null ? matchY.get(m.left_match_id)! + MATCH_H / 2 : null
      const rcy = m.right_match_id != null ? matchY.get(m.right_match_id)! + MATCH_H / 2 : null

      if (lcy != null && rcy != null) {
        // Both children: draw bracket shape then connect to parent
        connectors.push(`M ${childRX} ${lcy} H ${xMid}`)
        connectors.push(`M ${childRX} ${rcy} H ${xMid}`)
        connectors.push(`M ${xMid} ${lcy} V ${rcy}`)
        connectors.push(`M ${xMid} ${pcy} H ${px}`)
      } else {
        const childCY = lcy ?? rcy
        if (childCY != null) connectors.push(`M ${childRX} ${childCY} H ${px}`)
      }
    }
  }

  // Level labels
  const total = numRounds
  const levelLabels = levels.map((_, idx) => {
    const fromEnd = total - 1 - idx
    let label: string
    if (fromEnd === 0) label = t('playoffs.final')
    else if (fromEnd === 1) label = t('playoffs.semifinals')
    else if (fromEnd === 2) label = t('playoffs.quarterfinals')
    else label = t('playoffs.round', { n: idx + 1 })
    return { label, x: SVG_PAD + idx * (MATCH_W + H_GAP) }
  })

  const firstCount = levels[0].length
  const totalWidth = SVG_PAD * 2 + numRounds * MATCH_W + (numRounds - 1) * H_GAP
  const totalHeight = SVG_PAD + LABEL_H + firstCount * MATCH_H + (firstCount - 1) * V_GAP + SVG_PAD

  return { nodes, connectors, levelLabels, width: totalWidth, height: totalHeight }
}

// ─── Match card (rendered inside SVG foreignObject) ───────────────────────────

function MatchCard({ match, onClick }: { match: MatchWithTeams; onClick: () => void }) {
  const done = match.status === 'finished' || match.status === 'walkover' || match.status === 'retired'
  const team1Wins = done && match.winner_team_id === match.team1_id && match.team1_id != null
  const team2Wins = done && match.winner_team_id === match.team2_id && match.team2_id != null

  return (
    <div
      className="flex h-full w-full cursor-pointer select-none flex-col overflow-hidden rounded border border-border bg-card text-card-foreground hover:border-primary/60 hover:bg-muted/30"
      style={{ fontSize: 11 }}
      onClick={onClick}
    >
      <div
        className={cn(
          'flex flex-1 items-center gap-1 px-2',
          team1Wins && 'bg-green-50 dark:bg-green-950/20'
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            team1Wins ? 'font-semibold' : 'text-muted-foreground',
            !match.team1 && 'italic opacity-50'
          )}
        >
          {match.team1?.name ?? '—'}
        </span>
        {match.team1 && <SeedBadge team={match.team1} />}
        {done && (
          match.sets.length > 0
            ? <div className="flex shrink-0 gap-0.5">{match.sets.map((s, i) => <span key={i} className={cn('font-mono text-[10px]', s.s1 > s.s2 ? 'font-bold' : 'text-muted-foreground')}>{s.s1}</span>)}</div>
            : <span className={cn('shrink-0 font-mono', team1Wins ? 'font-bold' : 'text-muted-foreground')}>{match.s1 ?? 0}</span>
        )}
      </div>
      <div className="border-t border-border" />
      <div
        className={cn(
          'flex flex-1 items-center gap-1 px-2',
          team2Wins && 'bg-green-50 dark:bg-green-950/20'
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            team2Wins ? 'font-semibold' : 'text-muted-foreground',
            !match.team2 && 'italic opacity-50'
          )}
        >
          {match.team2?.name ?? '—'}
        </span>
        {match.team2 && <SeedBadge team={match.team2} />}
        {done && (
          match.sets.length > 0
            ? <div className="flex shrink-0 gap-0.5">{match.sets.map((s, i) => <span key={i} className={cn('font-mono text-[10px]', s.s2 > s.s1 ? 'font-bold' : 'text-muted-foreground')}>{s.s2}</span>)}</div>
            : <span className={cn('shrink-0 font-mono', team2Wins ? 'font-bold' : 'text-muted-foreground')}>{match.s2 ?? 0}</span>
        )}
      </div>
    </div>
  )
}

function SeedBadge({
  team
}: {
  team: { seed: number | null; seed_lo: number | null; seed_hi: number | null }
}) {
  const declared = formatTeamSeed(team)
  if (!declared) return null
  const title = team.seed !== null && team.seed_hi !== null ? `${declared}, draw ${team.seed}` : declared
  return (
    <span title={title} className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
      ({declared})
    </span>
  )
}

function formatTeamSeed(team: { seed: number | null; seed_lo: number | null; seed_hi: number | null }): string {
  if (team.seed_lo !== null && team.seed_hi !== null) return `${team.seed_lo}/${team.seed_hi}`
  if (team.seed_lo !== null) return String(team.seed_lo)
  if (team.seed !== null) return String(team.seed)
  return ''
}

// ─── PlayoffBracket screen ────────────────────────────────────────────────────

export function PlayoffBracket() {
  const { id, eid, rid } = useParams<{ id: string; eid: string; rid: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [event, setEvent] = useState<Event | undefined>()
  const [round, setRound] = useState<Round | undefined>()
  const [matches, setMatches] = useState<MatchWithTeams[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Result dialog state
  const [resultMatch, setResultMatch] = useState<MatchWithTeams | null>(null)
  const [resultSets, setResultSets] = useState<{ s1: string; s2: string }[]>([])
  const [resultStatus, setResultStatus] = useState<MatchStatus>('finished')
  const [resultWinnerId, setResultWinnerId] = useState<string>('')
  const [isSavingResult, setIsSavingResult] = useState(false)

  useEffect(() => {
    if (!id || !eid || !rid) return
    Promise.all([
      api.tournament.getById(id),
      api.events.listByTournament(id),
      api.rounds.listByEvent(eid),
      api.matches.listByRound(rid)
    ]).then(([t, events, rounds, matchList]) => {
      setTournament(t)
      setEvent(events.find((e) => e.id === eid))
      setRound(rounds.find((r) => r.id === rid))
      setMatches(matchList)
      setIsLoading(false)
    })
  }, [id, eid, rid])

  // ─── Result dialog handlers ────────────────────────────────────────────────

  function openResultDialog(m: MatchWithTeams) {
    setResultMatch(m)
    if (m.sets.length > 0) {
      setResultSets(m.sets.map((s) => ({ s1: String(s.s1), s2: String(s.s2) })))
    } else {
      setResultSets([{ s1: '', s2: '' }, { s1: '', s2: '' }])
    }
    setResultStatus(
      m.status === 'scheduled' || m.status === 'ready' || m.status === 'live' ? 'finished' : m.status
    )
    setResultWinnerId(m.winner_team_id ?? '')
  }

  function closeResultDialog() {
    setResultMatch(null)
  }

  function updateSet(idx: number, field: 's1' | 's2', value: string) {
    setResultSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  function autoFillOpposite(idx: number, field: 's1' | 's2', value: string) {
    const otherField = field === 's1' ? 's2' : 's1'
    const num = parseInt(value, 10)
    const pts = tournament?.points_per_set ?? 21
    setResultSets((prev) =>
      prev.map((s, i) => {
        if (i !== idx || isNaN(num) || s[otherField] !== '') return s
        if (num <= pts - 2) return { ...s, [otherField]: String(pts) }
        if (num === pts - 1) return { ...s, [otherField]: String(pts + 1) }
        return s
      })
    )
  }

  function addSet() {
    setResultSets((prev) => [...prev, { s1: '', s2: '' }])
  }

  function removeSet(idx: number) {
    setResultSets((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSaveResult() {
    if (!resultMatch) return
    setIsSavingResult(true)
    try {
      const parsedSets =
        resultStatus === 'walkover'
          ? []
          : resultSets
              .filter((s) => s.s1 !== '' || s.s2 !== '')
              .map((s) => ({ s1: Number(s.s1) || 0, s2: Number(s.s2) || 0 }))

      const dto: UpdateMatchResultDTO = {
        status: resultStatus,
        sets: parsedSets,
        winner_team_id: resultStatus === 'walkover' ? resultWinnerId || null : undefined
      }

      await api.matches.updateResult(resultMatch.id, dto)
      // Reload all matches so the winner propagated into the next round is reflected
      const allMatches = await api.matches.listByRound(rid!)
      setMatches(allMatches)
      closeResultDialog()
    } finally {
      setIsSavingResult(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  const layout = computeLayout(matches, t)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => navigate(`/tournaments/${id}/events/${eid}/rounds/${rid}/groups`)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {tournament?.name} · {event?.name}
          </p>
          <h1 className="text-xl font-semibold">{round?.name}</h1>
        </div>
      </div>

      {/* Bracket SVG */}
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('playoffs.noMatches')}</p>
      ) : (
        <div className="overflow-auto rounded-lg border bg-card p-4">
          <svg
            width={layout.width}
            height={layout.height}
            className="block"
            style={{ fontFamily: 'inherit' }}
          >
            {/* Round labels */}
            {layout.levelLabels.map(({ label, x }) => (
              <text
                key={label}
                x={x + MATCH_W / 2}
                y={SVG_PAD + LABEL_H / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >
                {label.toUpperCase()}
              </text>
            ))}

            {/* Connector lines */}
            {layout.connectors.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                className="stroke-border"
                strokeWidth={1.5}
              />
            ))}

            {/* Match cards */}
            {layout.nodes.map(({ match, x, y }) => (
              <foreignObject key={match.id} x={x} y={y} width={MATCH_W} height={MATCH_H}>
                <MatchCard match={match} onClick={() => openResultDialog(match)} />
              </foreignObject>
            ))}
          </svg>
        </div>
      )}

      {/* Match result dialog */}
      <Dialog open={!!resultMatch} onOpenChange={(open) => { if (!open) closeResultDialog() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {resultMatch?.status === 'scheduled' || resultMatch?.status === 'ready' || resultMatch?.status === 'live'
                ? t('matches.enterResult')
                : t('matches.editResult')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status selector */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('matches.resultStatus')}</p>
              <div className="flex gap-2">
                {(['finished', 'walkover', 'retired'] as MatchStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setResultStatus(s)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      resultStatus === s
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {t(`matches.status.${s}`)}
                  </button>
                ))}
              </div>
            </div>

            {resultStatus === 'walkover' ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('matches.winner')}</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: resultMatch?.team1_id ?? '', name: resultMatch?.team1?.name ?? '—' },
                    { id: resultMatch?.team2_id ?? '', name: resultMatch?.team2?.name ?? '—' }
                  ].map((team) => (
                    <label key={team.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted">
                      <input
                        type="radio"
                        name="winner"
                        value={team.id}
                        checked={resultWinnerId === team.id}
                        onChange={() => setResultWinnerId(team.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">{team.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-2 gap-y-2 text-xs font-medium text-muted-foreground">
                  <span />
                  <span className="truncate">{resultMatch?.team1?.name ?? '—'}</span>
                  <span />
                  <span className="truncate">{resultMatch?.team2?.name ?? '—'}</span>
                </div>
                {resultSets.map((set, idx) => (
                  <div key={idx} className="mb-2 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-x-2">
                    <span className="w-12 text-xs text-muted-foreground">{t('matches.set', { n: idx + 1 })}</span>
                    <Input
                      type="number"
                      min={0}
                      value={set.s1}
                      onChange={(e) => updateSet(idx, 's1', e.target.value)}
                      onBlur={(e) => autoFillOpposite(idx, 's1', e.target.value)}
                      className="h-8 text-center"
                    />
                    <span className="text-center text-muted-foreground">–</span>
                    <Input
                      type="number"
                      min={0}
                      value={set.s2}
                      onChange={(e) => updateSet(idx, 's2', e.target.value)}
                      onBlur={(e) => autoFillOpposite(idx, 's2', e.target.value)}
                      className="h-8 text-center"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSet(idx)}
                      disabled={resultSets.length <= 1}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={addSet}
                  disabled={resultSets.length >= 5}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t('matches.addSet')}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeResultDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSaveResult}
              disabled={isSavingResult || (resultStatus === 'walkover' && !resultWinnerId)}
            >
              {t('matches.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
