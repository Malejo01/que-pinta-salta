import { saltaWallClockToDate } from '@/lib/date-format'
import { filtrarSaltaCapital, loguearDescartes } from '@/lib/scraper/salta-capital'
import { ScrapedEvent } from '../types'

const CARTELERA_JSON_URL = 'https://s3.sa-east-1.amazonaws.com/contenido.general.entradauno/cache/12/cartelera.json'

// ─── Tipos de la respuesta JSON de EntradaUno (cartelera.json) ─────────────
// Reflejan solo lo que este archivo lee, sin asumir más de lo que el código
// ya maneja (fallbacks con `||`/`??` quedan como campos opcionales).

interface EntradaUnoImagen {
  listaIdEtiqueta?: string[]
  cUri?: string
}

interface EntradaUnoFuncion {
  dFuncion: string
}

interface EntradaUnoFuncionMenor {
  oFuncionFecha: EntradaUnoFuncion
}

interface EntradaUnoRawEvent {
  cNombre: string
  cDescripcion?: string
  cSeo: string
  idEspectaculoCartel: number | string
  cHashValidacion: string
  listaIdEstablecimiento?: number[]
  oFuncionLista?: EntradaUnoFuncion[]
  oFuncionMenor?: EntradaUnoFuncionMenor
  listaImagen?: EntradaUnoImagen[]
  cImagenBanner?: string
  cImagenEquityBanner?: string
  cImagenBannerMovil?: string
  cImagenEquityThumb?: string
  fPrecioDesde?: number
}

interface EntradaUnoRawVenue {
  cZona?: string
  idProvincia?: number
  idEstablecimiento: number
  cNombre: string
  cGoogleMapTag?: string | null
  cDomicilio?: string | null
}

interface EntradaUnoCartelera {
  listaEspectaculoCartel?: EntradaUnoRawEvent[]
  listaEstablecimiento?: EntradaUnoRawVenue[]
}

interface EntradaUnoPayload {
  oData?: {
    oCartelera?: EntradaUnoCartelera
  }
}

/**
 * Normaliza las fechas del formato API de EntradaUno a objeto Date.
 * La API entrega hora de pared de Salta sin zona ("2026-05-27T11:00:00").
 */
function toDate(isoString: string): Date {
  return saltaWallClockToDate(isoString)
}

/**
 * Detecta si el evento es realmente gratis analizando el título
 * (Como en cron no tenemos la descripción larga del todo en el mapping, podemos buscar también en cDescripcion si existiera)
 */
function isTextFree(title: string, description: string = ''): boolean {
  const text = `${title} ${description}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /gratis|gratuito|entrada libre|sin costo|libre y gratuit/.test(text);
}

/**
 * Retorna la mejor imagen disponible para el evento (prioriza resoluciones altas sobre miniaturas)
 */
function getBestImage(rawEvent: EntradaUnoRawEvent): string {
  const images = rawEvent.listaImagen || [];

  // Preferencias de etiquetas de imagen
  const tagsPreference = ['WEB_DESTACADO', 'WEB_CARRUSEL_CHICO', 'WEB_CARRUSEL_GRANDE', 'WEB_TOP', 'MAIL_TOP'];

  for (const tag of tagsPreference) {
    const found = images.find((img) => img.listaIdEtiqueta?.includes(tag));
    if (found && found.cUri) {
      return found.cUri;
    }
  }
  
  // Si no se encuentra ninguna imagen etiquetada, usar los fallbacks en este orden:
  if (rawEvent.cImagenBanner) return rawEvent.cImagenBanner;
  if (rawEvent.cImagenEquityBanner) return rawEvent.cImagenEquityBanner;
  if (rawEvent.cImagenBannerMovil) return rawEvent.cImagenBannerMovil;
  if (rawEvent.cImagenEquityThumb) return rawEvent.cImagenEquityThumb;
  
  return '';
}

/**
 * Scrapes events from EntradaUno S3 JSON for the cron job
 */
export async function scrapeEntradaUno(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = []

  try {
    console.log('[cron-entradauno] Obteniendo cartelera desde CDN S3...')
    const res = await fetch(CARTELERA_JSON_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      next: { revalidate: 0 }
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const payload: EntradaUnoPayload = await res.json()
    const oCartelera = payload.oData?.oCartelera
    if (!oCartelera) {
      throw new Error('Estructura de cartelera no válida en EntradaUno')
    }

    const rawEvents = oCartelera.listaEspectaculoCartel || []
    const rawVenues = oCartelera.listaEstablecimiento || []

    // 1. Filtrar establecimientos de la PROVINCIA de Salta
    const provinciaVenues = rawVenues.filter((v) =>
      (v.cZona && v.cZona.toLowerCase().trim() === 'salta') ||
      (v.idProvincia === 16)
    )

    console.log(`[cron-entradauno] Filtrados ${provinciaVenues.length} establecimientos en la provincia de Salta.`)

    // 2. Segundo filtro: sólo Salta Capital.
    // El de arriba es por provincia y deja pasar Cachi (84 km) y Cafayate
    // (154 km). Se acota por distancia real a la Plaza 9 de Julio; ver
    // lib/scraper/salta-capital.ts para por qué no alcanza ningún campo
    // declarado de la fuente.
    const { dentro: saltaVenues, descartados } = filtrarSaltaCapital(provinciaVenues)
    loguearDescartes('[cron-entradauno]', descartados)

    const saltaVenueIds = new Set(saltaVenues.map((v) => v.idEstablecimiento))
    const venueMap = new Map(saltaVenues.map((v): [number, EntradaUnoRawVenue] => [v.idEstablecimiento, v]))

    console.log(`[cron-entradauno] Quedan ${saltaVenues.length} establecimientos en Salta Capital.`)

    // 2. Mapear espectáculos
    for (const rawEvent of rawEvents) {
      const eventVenueIds = rawEvent.listaIdEstablecimiento || []
      const belongsToSalta = eventVenueIds.some((id: number) => saltaVenueIds.has(id))

      if (!belongsToSalta) continue

      // primaryVenueId siempre está definido acá: usa el mismo predicado que
      // belongsToSalta, que ya confirmó al menos un match en eventVenueIds.
      const primaryVenueId = eventVenueIds.find((id: number) => saltaVenueIds.has(id))
      const venueObj = venueMap.get(primaryVenueId!)
      const venueName = venueObj ? venueObj.cNombre : 'Salta'

      // Fechas
      const functions = (rawEvent.oFuncionLista ?? [])
        .filter((f) => f.dFuncion)
        .sort((a, b) => a.dFuncion.localeCompare(b.dFuncion))

      if (functions.length === 0 && !rawEvent.oFuncionMenor) {
        continue
      }

      // rawEvent.oFuncionMenor está garantizado acá por el guard de arriba.
      const dateTime = functions.length > 0
        ? toDate(functions[0].dFuncion)
        : toDate(rawEvent.oFuncionMenor!.oFuncionFecha.dFuncion)

      // Ticket link
      const ticketLink = `https://entradauno.com/landing/${rawEvent.cSeo}` +
        `?idEspectaculoCartel=${rawEvent.idEspectaculoCartel}` +
        `&cHashValidacion=${rawEvent.cHashValidacion}`

      // Imagen
      const flyerUrl = getBestImage(rawEvent)

      const priceFrom = rawEvent.fPrecioDesde ?? 0
      const isFree = priceFrom === 0 && isTextFree(rawEvent.cNombre, rawEvent.cDescripcion || '')

      events.push({
        title: rawEvent.cNombre.trim(),
        rawVenueName: venueName,
        dateTime,
        priceFrom,
        isFree,
        flyerUrl,
        ticketLink,
        source: 'entradauno'
      })
    }

    console.log(`[cron-entradauno] Encontrados ${events.length} eventos de Salta.`)

  } catch (error) {
    console.error('[cron-entradauno] Error scraping EntradaUno:', error)
  }

  return events
}
