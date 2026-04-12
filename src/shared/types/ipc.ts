// IPC contract between main and renderer processes.
// All API namespaces are defined here and extended as features are added.
// Renderer calls window.api.* — never ipcRenderer.invoke directly.

import type { Venue, CreateVenueDTO, UpdateVenueDTO } from './venue'
import type { Tournament, CreateTournamentDTO, UpdateTournamentDTO } from './tournament'

export type { Venue, CreateVenueDTO, UpdateVenueDTO }
export type { Tournament, CreateTournamentDTO, UpdateTournamentDTO }

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
}
