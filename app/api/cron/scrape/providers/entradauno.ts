import { saltaWallClockToDate } from '@/lib/date-format'
import { filtrarSaltaCapital, loguearDescartes } from '@/lib/scraper/salta-capital'
import { ScrapedEvent } from '../types'

const CARTELERA_JSON_URL = 'https://s3.sa-east-1.amazonaws.com/contenido.general.entradauno/cache/12/cartelera.json'

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
function getBestImage(rawEvent: any): string {
  const images = rawEvent.listaImagen || [];
  
  // Preferencias de etiquetas de imagen
  const tagsPreference = ['WEB_DESTACADO', 'WEB_CARRUSEL_CHICO', 'WEB_CARRUSEL_GRANDE', 'WEB_TOP', 'MAIL_TOP'];
  
  for (const tag of tagsPreference) {
    const found = images.find((img: any) => img.listaIdEtiqueta?.includes(tag));
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

    const payload = await res.json()
    const oCartelera = payload.oData?.oCartelera
    if (!oCartelera) {
      throw new Error('Estructura de cartelera no válida en EntradaUno')
    }

    const rawEvents = oCartelera.listaEspectaculoCartel || []
    const rawVenues = oCartelera.listaEstablecimiento || []

    // 1. Filtrar establecimientos de la PROVINCIA de Salta
    const provinciaVenues = rawVenues.filter((v: any) =>
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

    const saltaVenueIds = new Set(saltaVenues.map((v: any) => v.idEstablecimiento))
    const venueMap = new Map(saltaVenues.map((v: any) => [v.idEstablecimiento, v]))

    console.log(`[cron-entradauno] Quedan ${saltaVenues.length} establecimientos en Salta Capital.`)

    // 2. Mapear espectáculos
    for (const rawEvent of rawEvents) {
      const eventVenueIds = rawEvent.listaIdEstablecimiento || []
      const belongsToSalta = eventVenueIds.some((id: number) => saltaVenueIds.has(id))

      if (!belongsToSalta) continue

      const primaryVenueId = eventVenueIds.find((id: number) => saltaVenueIds.has(id))
      const venueObj: any = venueMap.get(primaryVenueId)
      const venueName = venueObj ? venueObj.cNombre : 'Salta'

      // Fechas
      const functions = (rawEvent.oFuncionLista ?? [])
        .filter((f: any) => f.dFuncion)
        .sort((a: any, b: any) => a.dFuncion.localeCompare(b.dFuncion))

      if (functions.length === 0 && !rawEvent.oFuncionMenor) {
        continue
      }

      const dateTime = functions.length > 0
        ? toDate(functions[0].dFuncion)
        : toDate(rawEvent.oFuncionMenor.oFuncionFecha.dFuncion)

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
