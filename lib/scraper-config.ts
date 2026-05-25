export type ScrapeSourceKey =
  | 'norteticket'
  | 'vamos'
  | 'paseshow'
  | 'tuentrada'
  | 'ticketek'
  | 'passline'
  | 'eventbrite'
  | 'alpogo'
  | 'independientes'

export type ScrapeSourceConfig = {
  key: ScrapeSourceKey
  name: string
  description: string
  siteUrl: string
  enabled: boolean
}

export const SCRAPE_SOURCES: ScrapeSourceConfig[] = [
  {
    key: 'norteticket',
    name: 'Norteticket',
    description: 'Eventos publicados para Salta en Norteticket.',
    siteUrl: 'https://norteticket.com/?subcategoria=Salta',
    enabled: true,
  },
  {
    key: 'vamos',
    name: 'Vamos Salta',
    description: 'Eventos culturales y espectáculos del Gobierno de la Provincia de Salta.',
    siteUrl: 'https://www.vamos.gob.ar',
    enabled: true,
  },
  {
    key: 'paseshow',
    name: 'Paseshow',
    description: 'Fuente reservada para futura integración.',
    siteUrl: 'https://www.paseshow.com.ar/',
    enabled: false,
  },
  {
    key: 'tuentrada',
    name: 'TuEntrada',
    description: 'Fuente reservada para futura integración.',
    siteUrl: 'https://www.tuentrada.com/',
    enabled: false,
  },
  {
    key: 'ticketek',
    name: 'Ticketek',
    description: 'Fuente reservada para futura integración.',
    siteUrl: 'https://www.ticketek.com.ar/',
    enabled: false,
  },
  {
    key: 'passline',
    name: 'Passline',
    description: 'Fuente reservada para futura integración.',
    siteUrl: 'https://www.passline.com/',
    enabled: false,
  },
  {
    key: 'eventbrite',
    name: 'Eventbrite',
    description: 'Fuente reservada para futura integración.',
    siteUrl: 'https://www.eventbrite.com/',
    enabled: false,
  },
  {
    key: 'alpogo',
    name: 'AlPogo',
    description: 'Fuente reservada para futura integración.',
    siteUrl: 'https://alpogo.com/',
    enabled: false,
  },
  {
    key: 'independientes',
    name: 'Productores Independientes',
    description: 'Carga manual o scrapers dedicados por productor.',
    siteUrl: 'https://quepintasalta.com',
    enabled: false,
  },
]

export function getScrapeSourceConfig(sourceKey: ScrapeSourceKey) {
  return SCRAPE_SOURCES.find((source) => source.key === sourceKey)
}
