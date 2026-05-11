import type { EventCategory } from './event'

export interface PlayerActivityStatus {
  playerId: string
  firstName: string
  lastName: string
  club: string | null
  gender: 'M' | 'F' | null
  activeCategories: EventCategory[]
  doneCategories: EventCategory[]
}
