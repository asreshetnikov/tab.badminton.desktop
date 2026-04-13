// IPC contract between main and renderer processes.
// All API namespaces are defined here and extended as features are added.
// Renderer calls window.api.* — never ipcRenderer.invoke directly.

import type { Venue, CreateVenueDTO, UpdateVenueDTO } from './venue'
import type { Tournament, CreateTournamentDTO, UpdateTournamentDTO } from './tournament'
import type { Court, CreateCourtDTO, UpdateCourtDTO } from './court'
import type { Event, EventCategory, CreateEventDTO, UpdateEventDTO } from './event'
import type { Player, PlayerGender, CreatePlayerDTO, UpdatePlayerDTO } from './player'
import type { TeamWithPlayers, CreateTeamDTO } from './team'
import type { TournamentPlayerWithPlayer, RegistrationStatus } from './tournament-player'
import type { TournamentTeamWithTeam } from './tournament-team'
import type { Round, RoundType, CreateRoundDTO, UpdateRoundDTO } from './round'
import type { RoundTeamWithTeam, RoundTableRowWithTeam } from './round-team'
import type { MatchWithTeams, UpdateMatchResultDTO } from './match'

export type { Venue, CreateVenueDTO, UpdateVenueDTO }
export type { Tournament, CreateTournamentDTO, UpdateTournamentDTO }
export type { Court, CreateCourtDTO, UpdateCourtDTO }
export type { Event, EventCategory, CreateEventDTO, UpdateEventDTO }
export type { Player, PlayerGender, CreatePlayerDTO, UpdatePlayerDTO }
export type { TeamWithPlayers, CreateTeamDTO }
export type { TournamentPlayerWithPlayer, RegistrationStatus }
export type { TournamentTeamWithTeam }
export type { Round, RoundType, CreateRoundDTO, UpdateRoundDTO }
export type { RoundTeamWithTeam, RoundTableRowWithTeam }
export type { MatchWithTeams, UpdateMatchResultDTO }

export interface AppAPI {
  ping(): Promise<string>

  venues: {
    create(data: CreateVenueDTO): Promise<Venue>
    getById(id: string): Promise<Venue | undefined>
    list(): Promise<Venue[]>
    update(id: string, data: UpdateVenueDTO): Promise<Venue>
    delete(id: string): Promise<void>
  }

  tournament: {
    create(data: CreateTournamentDTO): Promise<Tournament>
    getById(id: string): Promise<Tournament | undefined>
    list(): Promise<Tournament[]>
    update(id: string, data: UpdateTournamentDTO): Promise<Tournament>
    delete(id: string): Promise<void>
  }

  courts: {
    create(data: CreateCourtDTO): Promise<Court>
    listByTournament(tournamentId: string): Promise<Court[]>
    update(id: string, data: UpdateCourtDTO): Promise<Court>
    delete(id: string): Promise<void>
  }

  events: {
    create(data: CreateEventDTO): Promise<Event>
    listByTournament(tournamentId: string): Promise<Event[]>
    update(id: string, data: UpdateEventDTO): Promise<Event>
    delete(id: string): Promise<void>
  }

  tournamentTeams: {
    add(tournamentId: string, eventId: string, teamId: string): Promise<TournamentTeamWithTeam>
    addMany(tournamentId: string, eventId: string, teamIds: string[]): Promise<TournamentTeamWithTeam[]>
    listByTournament(tournamentId: string): Promise<TournamentTeamWithTeam[]>
    remove(id: string): Promise<void>
  }

  tournamentPlayers: {
    register(tournamentId: string, playerId: string): Promise<TournamentPlayerWithPlayer>
    registerMany(tournamentId: string, playerIds: string[]): Promise<TournamentPlayerWithPlayer[]>
    listByTournament(tournamentId: string): Promise<TournamentPlayerWithPlayer[]>
    updateStatus(id: string, status: RegistrationStatus): Promise<TournamentPlayerWithPlayer>
    remove(id: string): Promise<void>
  }

  teams: {
    create(data: CreateTeamDTO): Promise<TeamWithPlayers>
    list(): Promise<TeamWithPlayers[]>
    update(id: string, data: { name: string }): Promise<TeamWithPlayers>
    delete(id: string): Promise<void>
  }

  rounds: {
    create(data: CreateRoundDTO): Promise<Round>
    listByEvent(eventId: string): Promise<Round[]>
    update(id: string, data: UpdateRoundDTO): Promise<Round>
    delete(id: string): Promise<void>
  }

  roundTeams: {
    add(roundId: string, teamId: string): Promise<RoundTeamWithTeam>
    addMany(roundId: string, teamIds: string[]): Promise<RoundTeamWithTeam[]>
    listByRound(roundId: string): Promise<RoundTeamWithTeam[]>
    listTableByRound(roundId: string): Promise<RoundTableRowWithTeam[]>
    remove(id: string): Promise<void>
  }

  matches: {
    generate(roundId: string): Promise<MatchWithTeams[]>
    generatePlayoff(roundId: string): Promise<MatchWithTeams[]>
    listByRound(roundId: string): Promise<MatchWithTeams[]>
    deleteByRound(roundId: string): Promise<void>
    updateResult(matchId: string, dto: UpdateMatchResultDTO): Promise<{ match: MatchWithTeams; standings: RoundTableRowWithTeam[] }>
  }

  players: {
    create(data: CreatePlayerDTO): Promise<Player>
    getById(id: string): Promise<Player | undefined>
    list(): Promise<Player[]>
    update(id: string, data: UpdatePlayerDTO): Promise<Player>
    delete(id: string): Promise<void>
    importCSV(): Promise<{ imported: number; canceled: boolean }>
  }
}
