export type EventCategory = 
  | "penas" 
  | "boliches" 
  | "teatro" 
  | "ferias" 
  | "talleres" 
  | "cine"

export type EventVibe = "familiar" | "adultos" | "exterior"

export interface Event {
  id: string
  title: string
  venue: string
  date: string
  time: string
  category: EventCategory
  price: number | "gratis"
  image: string
  description: string
  address: string
  ticketUrl?: string
  noiseLevel: number
  vibe: EventVibe
  isFeatured?: boolean
}

export const categoryLabels: Record<EventCategory, string> = {
  penas: "Peñas",
  boliches: "Boliches",
  teatro: "Teatro",
  ferias: "Ferias",
  talleres: "Talleres",
  cine: "Cine",
}

export const vibeLabels: Record<EventVibe, string> = {
  familiar: "Familiar",
  adultos: "Adultos",
  exterior: "Al Aire Libre",
}
