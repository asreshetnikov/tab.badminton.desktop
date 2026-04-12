import { create } from 'zustand'
import { api } from '@renderer/lib/api'
import type { Tournament } from '@shared/types/ipc'

interface TournamentStore {
  tournaments: Tournament[]
  isLoading: boolean
  load: () => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTournamentStore = create<TournamentStore>((set) => ({
  tournaments: [],
  isLoading: false,

  load: async () => {
    set({ isLoading: true })
    try {
      const tournaments = await api.tournament.list()
      set({ tournaments })
    } finally {
      set({ isLoading: false })
    }
  },

  remove: async (id: string) => {
    await api.tournament.delete(id)
    set((state) => ({ tournaments: state.tournaments.filter((t) => t.id !== id) }))
  }
}))
