import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Swords, RefreshCw, Pencil, Check, X, Network } from 'lucide-react'
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

  async function handleRemoveTeam(rt: RoundTeamWithTeam) {
    await api.roundTeams.remove(rt.id)
    setRoundTeams((prev) => prev.filter((r) => r.id !== rt.id))
    if (rid) {
      const updatedStandings = await api.roundTeams.listTableByRound(rid)
      setStandings(sortStandings(updatedStandings))
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
      m.status === 'scheduled' || m.status === 'in_progress' ? 'finished' : m.status
    )
    setResultWinnerId(m.winner_team_id ?? '')
  }

  function closeResultDialog() {
    setResultMatch(null)
  }

  function updateSet(idx: number, field: 's1' | 's2', value: string) {
    setResultSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
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
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setStandings(sortStandings(updatedStandings))
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
      const generated = await api.matches.generatePlayoff(rid)
      setMatches(generated)
    } finally {
      setIsGeneratingBracket(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  const isRoundRobin = round?.type === 'round_robin'

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

  const sortedTeams = roundTeams.slice().sort((a, b) => a.team.name.localeCompare(b.team.name))

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
        {!isRoundRobin && matches.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1 shrink-0"
            onClick={() => navigate(`/tournaments/${id}/events/${eid}/rounds/${rid}/playoff`)}
          >
            <Network className="mr-1.5 h-3.5 w-3.5" />
            {t('playoffs.viewBracket')}
          </Button>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
        {/* Left column: Participants + Matches */}
        <div className="space-y-8">

          {/* Participants */}
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('rounds.participants')}
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setSelectedTeamIds(new Set()); setAddTeamsOpen(true) }}
              >
                <Plus className="mr-1 h-3 w-3" />
                {t('rounds.addTeams')}
              </Button>
            </div>
            {sortedTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('rounds.noTeams')}</p>
            ) : (
              <ul className="space-y-1">
                {sortedTeams.map((rt, idx) => (
                  <li key={rt.id} className="group/rt flex items-center gap-2 text-sm">
                    <span className="w-5 text-right text-xs text-muted-foreground">{idx + 1}.</span>
                    <span className="flex-1">{rt.team.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 hover:text-destructive group-hover/rt:opacity-100"
                      onClick={() => handleRemoveTeam(rt)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Matches */}
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('groups.matches')}
              </h2>
              {isRoundRobin ? (
                matches.length === 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={roundTeams.length < 2 || isGenerating}
                    onClick={handleGenerate}
                  >
                    <Swords className="mr-1 h-3 w-3" />
                    {t('rounds.generate')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={isGenerating}
                    onClick={() => setRegenConfirmOpen(true)}
                  >
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
                    disabled={roundTeams.length < 2 || isGeneratingBracket}
                    onClick={handleGenerateBracket}
                  >
                    <Swords className="mr-1 h-3 w-3" />
                    {t('rounds.generateBracket')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={isGeneratingBracket}
                    onClick={() => setRegenBracketConfirmOpen(true)}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    {t('rounds.regenerate')}
                  </Button>
                )
              )}
            </div>
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
              {resultMatch?.status === 'scheduled' || resultMatch?.status === 'in_progress'
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
                      className="h-8 text-center"
                    />
                    <span className="text-center text-muted-foreground">–</span>
                    <Input
                      type="number"
                      min={0}
                      value={set.s2}
                      onChange={(e) => updateSet(idx, 's2', e.target.value)}
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
    return <span className="w-16 shrink-0 text-center text-xs text-muted-foreground">vs</span>
  }
  return (
    <span className="w-16 shrink-0 text-center font-mono font-semibold">
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
      <MatchScore match={match} />
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
