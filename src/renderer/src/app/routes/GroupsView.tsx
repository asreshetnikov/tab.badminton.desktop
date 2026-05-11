import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Swords, RefreshCw, Pencil, Check, X, List, Network, Shuffle } from 'lucide-react'
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
  TournamentTeamWithTeam,
  RoundTeamWithTeam,
  MatchWithTeams,
  RoundTableRowWithTeam,
  UpdateMatchResultDTO
} from '@shared/types/ipc'
import type { MatchStatus } from '@shared/types/match'

// ─── Bracket layout ───────────────────────────────────────────────────────────
const MATCH_W = 180
const MATCH_H = 64
const H_GAP = 60
const V_GAP = 24
const SVG_PAD = 20
const LABEL_H = 28

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFn = (key: string, opts?: any) => string

function computeLayout(matches: MatchWithTeams[], t: TFn) {
  const empty = { nodes: [] as { match: MatchWithTeams; x: number; y: number }[], connectors: [] as string[], levelLabels: [] as { label: string; x: number }[], width: 0, height: 0 }
  if (!matches.length) return empty
  const byId = new Map(matches.map((m) => [m.id, m]))
  const levelsRev: MatchWithTeams[][] = []
  let cur = matches.filter((m) => !m.win_match_id)
  while (cur.length > 0) {
    levelsRev.push(cur)
    const next: MatchWithTeams[] = []
    for (const m of cur) {
      if (m.left_match_id) { const c = byId.get(m.left_match_id); if (c) next.push(c) }
      if (m.right_match_id) { const c = byId.get(m.right_match_id); if (c) next.push(c) }
    }
    cur = next
  }
  const levels = levelsRev.reverse()
  const numRounds = levels.length
  const matchY = new Map<string, number>()
  const yStart = SVG_PAD + LABEL_H
  levels[0].forEach((m, i) => matchY.set(m.id, yStart + i * (MATCH_H + V_GAP)))
  for (let l = 1; l < numRounds; l++) {
    for (const m of levels[l]) {
      const lcy = m.left_match_id != null ? (matchY.get(m.left_match_id)! + MATCH_H / 2) : null
      const rcy = m.right_match_id != null ? (matchY.get(m.right_match_id)! + MATCH_H / 2) : null
      const y = lcy != null && rcy != null ? (lcy + rcy) / 2 - MATCH_H / 2 : (lcy ?? rcy ?? yStart)
      matchY.set(m.id, y)
    }
  }
  const matchX = new Map<string, number>()
  levels.forEach((level, l) => { const x = SVG_PAD + l * (MATCH_W + H_GAP); level.forEach((m) => matchX.set(m.id, x)) })
  const nodes = matches.map((m) => ({ match: m, x: matchX.get(m.id) ?? 0, y: matchY.get(m.id) ?? 0 }))
  const connectors: string[] = []
  for (let l = 1; l < numRounds; l++) {
    for (const m of levels[l]) {
      const px = matchX.get(m.id)!
      const pcy = matchY.get(m.id)! + MATCH_H / 2
      const xMid = px - H_GAP / 2
      const childRX = px - H_GAP
      const lcy = m.left_match_id != null ? matchY.get(m.left_match_id)! + MATCH_H / 2 : null
      const rcy = m.right_match_id != null ? matchY.get(m.right_match_id)! + MATCH_H / 2 : null
      if (lcy != null && rcy != null) {
        connectors.push(`M ${childRX} ${lcy} H ${xMid}`, `M ${childRX} ${rcy} H ${xMid}`, `M ${xMid} ${lcy} V ${rcy}`, `M ${xMid} ${pcy} H ${px}`)
      } else {
        const childCY = lcy ?? rcy
        if (childCY != null) connectors.push(`M ${childRX} ${childCY} H ${px}`)
      }
    }
  }
  const total = numRounds
  const levelLabels = levels.map((_, idx) => {
    const fromEnd = total - 1 - idx
    const label = fromEnd === 0 ? t('playoffs.final') : fromEnd === 1 ? t('playoffs.semifinals') : fromEnd === 2 ? t('playoffs.quarterfinals') : t('playoffs.round', { n: idx + 1 })
    return { label, x: SVG_PAD + idx * (MATCH_W + H_GAP) }
  })
  const firstCount = levels[0].length
  return {
    nodes, connectors, levelLabels,
    width: SVG_PAD * 2 + numRounds * MATCH_W + (numRounds - 1) * H_GAP,
    height: SVG_PAD + LABEL_H + firstCount * MATCH_H + (firstCount - 1) * V_GAP + SVG_PAD
  }
}

function BracketMatchCard({ match, onClick }: { match: MatchWithTeams; onClick: () => void }) {
  const done = match.status === 'finished' || match.status === 'walkover' || match.status === 'retired'
  const team1Wins = done && match.winner_team_id === match.team1_id && match.team1_id != null
  const team2Wins = done && match.winner_team_id === match.team2_id && match.team2_id != null
  return (
    <div
      className="flex h-full w-full cursor-pointer select-none flex-col overflow-hidden rounded border border-border bg-card text-card-foreground hover:border-primary/60 hover:bg-muted/30"
      style={{ fontSize: 11 }}
      onClick={onClick}
    >
      <div className={cn('flex flex-1 items-center gap-1 px-2', team1Wins && 'bg-green-50 dark:bg-green-950/20')}>
        <span className={cn('min-w-0 flex-1 truncate', team1Wins ? 'font-semibold' : 'text-muted-foreground', !match.team1 && 'italic opacity-50')}>{match.team1?.name ?? '—'}</span>
        {match.team1 && <SeedBadge team={match.team1} />}
        {done && (
          match.sets.length > 0
            ? <div className="flex shrink-0 gap-0.5">{match.sets.map((s, i) => <span key={i} className={cn('font-mono text-[10px]', s.s1 > s.s2 ? 'font-bold' : 'text-muted-foreground')}>{s.s1}</span>)}</div>
            : <span className={cn('shrink-0 font-mono', team1Wins ? 'font-bold' : 'text-muted-foreground')}>{match.s1 ?? 0}</span>
        )}
      </div>
      <div className="border-t border-border" />
      <div className={cn('flex flex-1 items-center gap-1 px-2', team2Wins && 'bg-green-50 dark:bg-green-950/20')}>
        <span className={cn('min-w-0 flex-1 truncate', team2Wins ? 'font-semibold' : 'text-muted-foreground', !match.team2 && 'italic opacity-50')}>{match.team2?.name ?? '—'}</span>
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

export function GroupsView() {
  const { id, eid, rid } = useParams<{ id: string; eid: string; rid: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [event, setEvent] = useState<Event | undefined>()
  const [round, setRound] = useState<Round | undefined>()
  const [roundTeams, setRoundTeams] = useState<RoundTeamWithTeam[]>([])
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeamWithTeam[]>([])
  const [matches, setMatches] = useState<MatchWithTeams[]>([])
  const [standings, setStandings] = useState<RoundTableRowWithTeam[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Name editing
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)

  // Add teams dialog
  const [addTeamsOpen, setAddTeamsOpen] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [isAddingTeams, setIsAddingTeams] = useState(false)
  const [isDrawingSeeds, setIsDrawingSeeds] = useState(false)

  // View mode (list | bracket) — bracket only for playoff
  const [viewMode, setViewMode] = useState<'list' | 'bracket'>('list')

  // Generate matches
  const [isGenerating, setIsGenerating] = useState(false)
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)

  // Match result dialog
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
      api.roundTeams.listByRound(rid),
      api.tournamentTeams.listByTournament(id),
      api.matches.listByRound(rid),
      api.roundTeams.listTableByRound(rid)
    ]).then(([tournament, events, rounds, rtList, ttList, matchList, standingsList]) => {
      setTournament(tournament)
      const ev = events.find((e) => e.id === eid)
      setEvent(ev)
      setRound(rounds.find((r) => r.id === rid))
      setRoundTeams(rtList)
      setTournamentTeams(ttList.filter((tt) => tt.event_id === eid))
      setMatches(matchList)
      setStandings(sortStandings(standingsList))
      setIsLoading(false)
    })
  }, [id, eid, rid])

  // ─── Name editing ──────────────────────────────────────────────────────────

  function startEditName() {
    if (!round) return
    setEditNameValue(round.name)
    setEditingName(true)
  }

  async function saveName() {
    const name = editNameValue.trim()
    if (!name || !round) { setEditingName(false); return }
    if (name === round.name) { setEditingName(false); return }
    setIsSavingName(true)
    try {
      const updated = await api.rounds.update(round.id, { name })
      setRound(updated)
    } finally {
      setIsSavingName(false)
      setEditingName(false)
    }
  }

  // ─── Teams ─────────────────────────────────────────────────────────────────

  const roundTeamIds = useMemo(() => new Set(roundTeams.map((rt) => rt.team_id)), [roundTeams])

  const eligibleToAdd = useMemo(
    () =>
      tournamentTeams
        .filter((tt) => !roundTeamIds.has(tt.team_id))
        .sort((a, b) => a.team.name.localeCompare(b.team.name)),
    [tournamentTeams, roundTeamIds]
  )

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  async function handleAddTeams() {
    if (!rid || selectedTeamIds.size === 0) return
    setIsAddingTeams(true)
    try {
      const added = await api.roundTeams.addMany(rid, [...selectedTeamIds])
      setRoundTeams((prev) => [...prev, ...added])
      const updatedStandings = await api.roundTeams.listTableByRound(rid)
      setStandings(sortStandings(updatedStandings))
      setAddTeamsOpen(false)
      setSelectedTeamIds(new Set())
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAddingTeams(false)
    }
  }

  // ─── Matches ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!rid) return
    setIsGenerating(true)
    try {
      const generated = await api.matches.generate(rid)
      setMatches(generated)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleRegen() {
    if (!rid) return
    setRegenConfirmOpen(false)
    setIsGenerating(true)
    try {
      await api.matches.deleteByRound(rid)
      const generated = await api.matches.generate(rid)
      setMatches(generated)
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Match result ──────────────────────────────────────────────────────────

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

      const { match: updated, standings: updatedStandings } = await api.matches.updateResult(
        resultMatch.id,
        dto
      )
      if (round?.type === 'playoff') {
        // Reload all matches so winner propagation into next round is reflected
        const allMatches = await api.matches.listByRound(rid!)
        setMatches(allMatches)
      } else {
        setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
        setStandings(sortStandings(updatedStandings))
      }
      closeResultDialog()
    } finally {
      setIsSavingResult(false)
    }
  }

  // ─── Playoff bracket generation ───────────────────────────────────────────

  const [isGeneratingBracket, setIsGeneratingBracket] = useState(false)
  const [regenBracketConfirmOpen, setRegenBracketConfirmOpen] = useState(false)

  async function handleGenerateBracket() {
    if (!rid) return
    setIsGeneratingBracket(true)
    try {
      const generated = await api.matches.generatePlayoff(rid)
      setMatches(generated)
    } finally {
      setIsGeneratingBracket(false)
    }
  }

  async function handleRegenBracket() {
    if (!rid) return
    setRegenBracketConfirmOpen(false)
    setIsGeneratingBracket(true)
    try {
      await api.matches.deleteByRound(rid)
      setMatches([])
    } finally {
      setIsGeneratingBracket(false)
    }
  }

  async function handleDrawSeedings() {
    if (!rid) return
    setIsDrawingSeeds(true)
    try {
      const updated = await api.roundTeams.draw(rid)
      setRoundTeams(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDrawingSeeds(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  const isRoundRobin = round?.type === 'round_robin'
  const hasMatches = matches.length > 0
  const hasUnresolvedSeeds = !isRoundRobin && roundTeams.some((rt) => rt.seed === null)

  // Group matches by tour (round_robin)
  const byTour = matches.reduce<Record<number, MatchWithTeams[]>>((acc, m) => {
    const tour = m.tour ?? 1
    acc[tour] = acc[tour] ?? []
    acc[tour].push(m)
    return acc
  }, {})
  const tourNumbers = Object.keys(byTour).map(Number).sort((a, b) => a - b)

  // Group playoff matches by bracket level (first round → final)
  const playoffGroups = getPlayoffGroups(matches, t)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => navigate(`/tournaments/${id}/rounds`)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {tournament?.name} · {event?.name}
          </p>
          {editingName ? (
            <div className="mt-0.5 flex items-center gap-2">
              <Input
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                autoFocus
                className="h-8 text-lg font-semibold"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={saveName} disabled={isSavingName}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingName(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="mt-0.5 flex items-center gap-2">
              <h1 className="text-xl font-semibold">{round?.name}</h1>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  round?.type === 'round_robin'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                )}
              >
                {round ? t(`rounds.type.${round.type}`) : ''}
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={startEditName} title={t('common.edit')}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          {/* Generate / Regenerate */}
          {isRoundRobin ? (
            matches.length === 0 ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={roundTeams.length < 2 || isGenerating} onClick={handleGenerate}>
                <Swords className="mr-1 h-3 w-3" />
                {t('rounds.generate')}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={isGenerating} onClick={() => setRegenConfirmOpen(true)}>
                <RefreshCw className="mr-1 h-3 w-3" />
                {t('rounds.regenerate')}
              </Button>
            )
          ) : (
            matches.length === 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={roundTeams.length < 2 || isGeneratingBracket || hasUnresolvedSeeds}
                title={hasUnresolvedSeeds ? t('rounds.drawFirst') : undefined}
                onClick={handleGenerateBracket}
              >
                <Swords className="mr-1 h-3 w-3" />
                {t('rounds.generateBracket')}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={isGeneratingBracket} onClick={() => setRegenBracketConfirmOpen(true)}>
                <RefreshCw className="mr-1 h-3 w-3" />
                {t('rounds.regenerate')}
              </Button>
            )
          )}

          {/* List / Bracket toggle (playoff only) */}
          {!isRoundRobin && matches.length > 0 && (
            <div className="flex overflow-hidden rounded-md border">
              <button
                onClick={() => setViewMode('list')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                  viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                onClick={() => setViewMode('bracket')}
                className={cn('flex items-center gap-1.5 border-l px-3 py-1.5 text-xs font-medium transition-colors',
                  viewMode === 'bracket' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Network className="h-3.5 w-3.5" />
                Bracket
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bracket view */}
      {!isRoundRobin && viewMode === 'bracket' && (() => {
        const layout = computeLayout(matches, t)
        return matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('playoffs.noMatches')}</p>
        ) : (
          <div className="overflow-auto">
            <svg width={layout.width} height={layout.height} className="block" style={{ fontFamily: 'inherit' }}>
              {layout.levelLabels.map(({ label, x }) => (
                <text key={label} x={x + MATCH_W / 2} y={SVG_PAD + LABEL_H / 2} textAnchor="middle" dominantBaseline="middle"
                  className="fill-muted-foreground" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {label.toUpperCase()}
                </text>
              ))}
              {layout.connectors.map((d, i) => (
                <path key={i} d={d} fill="none" className="stroke-border" strokeWidth={1.5} />
              ))}
              {layout.nodes.map(({ match, x, y }) => (
                <foreignObject key={match.id} x={x} y={y} width={MATCH_W} height={MATCH_H}>
                  <BracketMatchCard match={match} onClick={() => openResultDialog(match)} />
                </foreignObject>
              ))}
            </svg>
          </div>
        )
      })()}

      <div className={cn('grid gap-8 lg:grid-cols-[1fr_auto]', !isRoundRobin && viewMode === 'bracket' && 'hidden')}>
        {/* Left column: Participants + Matches */}
        <div className="space-y-8">

          {/* Matches */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('rounds.participants')}
              </h2>
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setAddTeamsOpen(true)} disabled={hasMatches}>
                <Plus className="mr-1 h-3 w-3" />
                {t('rounds.addTeams')}
              </Button>
              {!isRoundRobin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleDrawSeedings}
                  disabled={hasMatches || roundTeams.length < 2 || isDrawingSeeds}
                  title={hasMatches ? t('rounds.regenerateToEditSeeds') : undefined}
                >
                  <Shuffle className="mr-1 h-3 w-3" />
                  {t('rounds.drawSeedings')}
                </Button>
              )}
            </div>
            {roundTeams.length === 0 ? (
              <p className="mb-8 text-sm text-muted-foreground">{t('rounds.noTeams')}</p>
            ) : (
              <div className="mb-8 divide-y rounded-md border">
                {roundTeams.map((rt) => (
                  <div key={rt.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{rt.team.name}</span>
                    {!isRoundRobin && (
                      <span className="w-32 shrink-0 text-right text-xs text-muted-foreground">
                        {formatDeclaredSeed(rt) || t('rounds.noSeed')}
                        {' · '}
                        {rt.seed !== null ? t('rounds.resolvedSeed', { n: rt.seed }) : t('rounds.unresolvedSeed')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('rounds.noMatches')}</p>
            ) : isRoundRobin ? (
              <div className="space-y-5">
                {tourNumbers.map((tour) => (
                  <div key={tour}>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {t('rounds.tour', { n: tour })}
                    </p>
                    <div className="space-y-1">
                      {byTour[tour].map((m) => (
                        <MatchRow key={m.id} match={m} onClick={() => openResultDialog(m)} t={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {playoffGroups.map(({ label, matches: groupMatches }) => (
                  <div key={label}>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
                    <div className="space-y-1">
                      {groupMatches.map((m) => (
                        <MatchRow key={m.id} match={m} onClick={() => openResultDialog(m)} t={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: Standings (round_robin only) */}
        {isRoundRobin && (
          <section className="lg:min-w-[420px]">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('groups.standings')}
            </h2>
            {standings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('groups.noStandings')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="pb-2 pr-3 text-right font-medium">#</th>
                      <th className="pb-2 pr-6 text-left font-medium">{t('groups.col.team')}</th>
                      <th className="pb-2 px-2 text-center font-medium" title={t('groups.col.played')}>{t('groups.col.P')}</th>
                      <th className="pb-2 px-2 text-center font-medium" title={t('groups.col.wins')}>{t('groups.col.W')}</th>
                      <th className="pb-2 px-2 text-center font-medium" title={t('groups.col.losses')}>{t('groups.col.L')}</th>
                      <th className="pb-2 px-2 text-center font-medium" title={t('groups.col.setsWon')}>{t('groups.col.SW')}</th>
                      <th className="pb-2 px-2 text-center font-medium" title={t('groups.col.setsLost')}>{t('groups.col.SL')}</th>
                      <th className="pb-2 px-2 text-center font-medium" title={t('groups.col.pointsWon')}>{t('groups.col.PW')}</th>
                      <th className="pb-2 pl-2 text-center font-medium" title={t('groups.col.pointsLost')}>{t('groups.col.PL')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, idx) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-right text-muted-foreground">{idx + 1}</td>
                        <td className="py-2 pr-6 font-medium">{row.team.name}</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{row.wins + row.losses}</td>
                        <td className="py-2 px-2 text-center font-medium">{row.wins}</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{row.losses}</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{row.sets_won}</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{row.sets_lost}</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{row.points_won}</td>
                        <td className="py-2 pl-2 text-center text-muted-foreground">{row.points_lost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Add Teams dialog */}
      <Dialog open={addTeamsOpen} onOpenChange={(open) => { if (!open) { setAddTeamsOpen(false); setSelectedTeamIds(new Set()) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('rounds.addTeamsTitle', { round: round?.name ?? '' })}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {eligibleToAdd.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('rounds.noEligibleTeams')}
              </p>
            ) : (
              <ul className="space-y-1 py-1">
                {eligibleToAdd.map((tt) => (
                  <li key={tt.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.has(tt.team_id)}
                        onChange={() => toggleTeam(tt.team_id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 text-sm">{tt.team.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddTeamsOpen(false); setSelectedTeamIds(new Set()) }}>
              {t('common.cancel')}
            </Button>
            <Button disabled={selectedTeamIds.size === 0 || isAddingTeams} onClick={handleAddTeams}>
              {t('rounds.addSelected', { count: selectedTeamIds.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate confirmation dialog */}
      <Dialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('rounds.regenerateTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('rounds.regenerateDescription')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRegen}>
              {t('rounds.regenerate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate bracket confirmation dialog */}
      <Dialog open={regenBracketConfirmOpen} onOpenChange={setRegenBracketConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('rounds.regenerateBracketTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('rounds.regenerateBracketDescription')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenBracketConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRegenBracket}>
              {t('rounds.regenerate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              /* Walkover: pick winner */
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
              /* Finished/Retired: enter set scores */
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

function MatchScore({ match }: { match: MatchWithTeams }) {
  if (match.status !== 'finished' && match.status !== 'walkover' && match.status !== 'retired') {
    return <span className="w-10 shrink-0 text-center text-xs text-muted-foreground">vs</span>
  }
  if (match.sets.length > 0) {
    return (
      <span className="shrink-0 text-center font-mono">
        {match.sets.map((s, i) => (
          <span key={i}>
            {i > 0 && ' '}
            <span className={s.s1 > s.s2 ? 'font-semibold' : ''}>{s.s1}</span>
            {'–'}
            <span className={s.s2 > s.s1 ? 'font-semibold' : ''}>{s.s2}</span>
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className="w-10 shrink-0 text-center font-mono font-semibold">
      {match.s1 ?? 0}–{match.s2 ?? 0}
    </span>
  )
}

function MatchRow({
  match,
  onClick,
  t
}: {
  match: MatchWithTeams
  onClick: () => void
  t: (key: string) => string
}) {
  return (
    <div
      className="group/match flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm hover:bg-muted/50"
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate text-right font-medium">
        {match.team1?.name ?? '—'}
      </span>
      {match.team1 && <SeedBadge team={match.team1} />}
      <MatchScore match={match} />
      {match.team2 && <SeedBadge team={match.team2} />}
      <span className="min-w-0 flex-1 truncate font-medium">
        {match.team2?.name ?? '—'}
      </span>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs',
          match.status === 'finished'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
            : match.status === 'walkover' || match.status === 'retired'
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
              : 'bg-muted text-muted-foreground'
        )}
      >
        {t(`matches.status.${match.status}`)}
      </span>
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFunction = (key: string, opts?: any) => string

function getPlayoffGroups(
  matches: MatchWithTeams[],
  t: TFunction
): Array<{ label: string; matches: MatchWithTeams[] }> {
  if (matches.length === 0) return []

  // Build levels from final down to first round via BFS
  const levels: MatchWithTeams[][] = []
  let current = matches.filter((m) => m.win_match_id === null)
  while (current.length > 0) {
    levels.push(current)
    const currentIds = new Set(current.map((m) => m.id))
    current = matches.filter(
      (m) => m.win_match_id !== null && currentIds.has(m.win_match_id)
    )
  }

  // levels[0] = final, levels[last] = first round — reverse to show first round first
  levels.reverse()
  const total = levels.length

  return levels.map((ms, idx) => {
    const fromEnd = total - 1 - idx
    let label: string
    if (fromEnd === 0) label = t('playoffs.final')
    else if (fromEnd === 1) label = t('playoffs.semifinals')
    else if (fromEnd === 2) label = t('playoffs.quarterfinals')
    else label = t('playoffs.round', { n: idx + 1 })
    return { label, matches: ms }
  })
}

function sortStandings(rows: RoundTableRowWithTeam[]): RoundTableRowWithTeam[] {
  return rows.slice().sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    const sdA = a.sets_won - a.sets_lost
    const sdB = b.sets_won - b.sets_lost
    if (sdB !== sdA) return sdB - sdA
    const pdA = a.points_won - a.points_lost
    const pdB = b.points_won - b.points_lost
    if (pdB !== pdA) return pdB - pdA
    return a.team.name.localeCompare(b.team.name)
  })
}

function formatDeclaredSeed(rt: Pick<RoundTeamWithTeam, 'seed_lo' | 'seed_hi'>): string {
  if (rt.seed_lo === null) return ''
  if (rt.seed_hi === null) return String(rt.seed_lo)
  return `${rt.seed_lo}/${rt.seed_hi}`
}

function formatTeamSeed(team: { seed: number | null; seed_lo: number | null; seed_hi: number | null }): string {
  if (team.seed_lo !== null && team.seed_hi !== null) return `${team.seed_lo}/${team.seed_hi}`
  if (team.seed_lo !== null) return String(team.seed_lo)
  if (team.seed !== null) return String(team.seed)
  return ''
}
