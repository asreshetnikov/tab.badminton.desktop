import { create } from 'zustand'
import { api } from '@renderer/lib/api'
import type { Venue, CreateVenueDTO } from '@shared/types/ipc'

interface VenueStore {
  venues: Venue[]
  load: () => Promise<void>
  create: (data: CreateVenueDTO) => Promise<Venue>
}

export const useVenueStore = create<VenueStore>((set) => ({
  venues: [],

  load: async () => {
    const venues = await api.venues.list()
    set({ venues })
  },

  create: async (data: CreateVenueDTO) => {
    const venue = await api.venues.create(data)
    set((state) => ({ venues: [...state.venues, venue] }))
    return venue
  }
}))
