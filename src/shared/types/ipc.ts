// IPC contract between main and renderer processes.
// All API namespaces are defined here and extended as features are added.
// Renderer calls window.api.* — never ipcRenderer.invoke directly.

import type { Venue, CreateVenueDTO, UpdateVenueDTO } from './venue'
import type { Tournament, CreateTournamentDTO, UpdateTournamentDTO } from './tournament'
import type { Court, CreateCourtDTO, UpdateCourtDTO } from './court'
import type { Event, EventCategory, CreateEventDTO, UpdateEventDTO } from './event'

export type { Venue, CreateVenueDTO, UpdateVenueDTO }
export type { Tournament, CreateTournamentDTO, UpdateTournamentDTO }
export type { Court, CreateCourtDTO, UpdateCourtDTO }
export type { Event, EventCategory, CreateEventDTO, UpdateEventDTO }

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
}
