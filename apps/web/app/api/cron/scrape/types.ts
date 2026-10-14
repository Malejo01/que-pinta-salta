export interface ScrapedEvent {
  title: string
  rawVenueName: string
  dateTime: Date
  priceFrom: number
  isFree?: boolean
  flyerUrl: string
  ticketLink: string
  source: string
}

export interface ScraperProvider {
  name: string
  scrape: () => Promise<ScrapedEvent[]>
}
