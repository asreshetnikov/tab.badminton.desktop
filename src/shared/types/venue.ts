export interface Venue {
  id: string
  name: string
  address: string | null
}

export interface CreateVenueDTO {
  name: string
  address?: string | null
}

export interface UpdateVenueDTO {
  name?: string
  address?: string | null
}
