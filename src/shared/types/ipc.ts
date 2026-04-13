// IPC contract between main and renderer processes.
// All API namespaces are defined here and extended as features are added.
// Renderer calls window.api.* — never ipcRenderer.invoke directly.

import type { Venue, CreateVenueDTO, UpdateVenueDTO } from './venue'
import type { Tournament, CreateTournamentDTO, UpdateTournamentDTO } from './tournament'
import type { Court, CreateCourtDTO, UpdateCourtDTO } from './court'
import type { Event, EventCategory, CreateEventDTO, UpdateEventDTO } from './event'
import type { Player, CreatePlayerDTO, UpdatePlayerDTO } from './player'
import type { TeamWithPlayers, CreateTeamDTO } from './team'
import type { TournamentPlayerWithPlayer, RegistrationStatus } from './tournament-player'

export type { Venue, CreateVenueDTO, UpdateVenueDTO }
export type { Tournament, CreateTournamentDTO, UpdateTournamentDTO }
export type { Court, CreateCourtDTO, UpdateCourtDTO }
export type { Event, EventCategory, CreateEventDTO, UpdateEventDTO }
export type { Player, CreatePlayerDTO, UpdatePlayerDTO }
export type { TeamWithPlayers, CreateTeamDTO }
export type { TournamentPlayerWithPlayer, RegistrationStatus }

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

  players: {
    create(data: CreatePlayerDTO): Promise<Player>
    getById(id: string): Promise<Player | undefined>
    list(): Promise<Player[]>
    update(id: string, data: UpdatePlayerDTO): Promise<Player>
    delete(id: string): Promise<void>
    importCSV(): Promise<{ imported: number; canceled: boolean }>
  }
}
