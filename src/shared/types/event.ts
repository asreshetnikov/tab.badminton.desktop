export type EventCategory = 'MS' | 'WS' | 'MD' | 'WD' | 'XD'

export const EVENT_CATEGORIES: EventCategory[] = ['MS', 'WS', 'MD', 'WD', 'XD']

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  MS: "Men's Singles",
  WS: "Women's Singles",
  MD: "Men's Doubles",
  WD: "Women's Doubles",
  XD: 'Mixed Doubles'
}

export interface Event {
  id: string
  tournament_id: string
  name: string
  category: EventCategory
  max_entries: number | null
  age_min: number | null
  age_max: number | null
}

export interface CreateEventDTO {
  tournament_id: string
  name: string
  category: EventCategory
  max_entries?: number | null
  age_min?: number | null
  age_max?: number | null
}

export interface UpdateEventDTO {
  name?: string
  category?: EventCategory
  max_entries?: number | null
  age_min?: number | null
  age_max?: number | null
}
