// IPC contract between main and renderer processes.
// All API namespaces are defined here and extended as features are added.
// Renderer calls window.api.* — never ipcRenderer.invoke directly.

import type { Venue, CreateVenueDTO, UpdateVenueDTO } from './venue'

export type { Venue, CreateVenueDTO, UpdateVenueDTO }

export interface AppAPI {
  ping(): Promise<string>

  venues: {
    create(data: CreateVenueDTO): Promise<Venue>
    getById(id: string): Promise<Venue | undefined>
    list(): Promise<Venue[]>
    update(id: string, data: UpdateVenueDTO): Promise<Venue>
    delete(id: string): Promise<void>
  }
}
