import { saltaWallClockToDate } from '@/lib/date-format'
import { ScrapedEvent } from '../types'

const ALPOGO_API_URL = 'https://alpogo.com/api/events/getEvents2'

function isTextFree(title: string, description: string = ''): boolean {
  const text = `${title} ${description}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /gratis|gratuito|entrada libre|sin costo|libre y gratuit/.test(text);
}

/**
 * Scrapes events from Alpogo API for the cron job
 */
export async function scrapeAlpogo(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = []

  try {
    console.log('[cron-alpogo] Obteniendo cartelera desde la API...')
    const payload = {
      limit: 100,
      offset: 0,
      eventos_estado: 'activo',
      funciones_estado: 'activo',
      provincia_id: '16', // Salta
      tipo_actividad: null,
      fecha_inicio: null,
      fecha_fin: null
    }

    const res = await fetch(ALPOGO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload),
      next: { revalidate: 0 } as any // Avoid caching in Next.js
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const data = await res.json()
    console.log(`[cron-alpogo] Recibidos ${data.length} eventos de Alpogo.`)

    for (const item of data) {
      if (!item.nombre || !item.fecha_funcion) continue

      // La API entrega hora de pared de Salta sin zona ("2026-08-07 21:00:00").
      const dateTime = saltaWallClockToDate(item.fecha_funcion)
      const priceFrom = parseInt(item.menor_precio || item.botonPrecio || '0', 10) || 0
      const isFree = item.gratuito === '1' || (priceFrom === 0 && isTextFree(item.nombre, item.descripcion || ''))
      const flyerUrl = item.imagen_grilla || item.imagen_logo || ''
      const ticketLink = item.urlCompra || item.url || ''

      events.push({
        title: item.nombre.trim(),
        rawVenueName: item.lugar || 'Salta',
        dateTime,
        priceFrom,
        isFree,
        flyerUrl,
        ticketLink,
        source: 'alpogo'
      })
    }

    console.log(`[cron-alpogo] Encontrados ${events.length} eventos de Salta en Alpogo.`)

  } catch (error) {
    console.error('[cron-alpogo] Error scraping Alpogo:', error)
  }

  return events
}
