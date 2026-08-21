import { runCinemaScrapeAndSync } from '@/lib/scraper/cinema-scraper'
import type { JobHandler } from '../types'

/**
 * Cartelera de cines.
 *
 * Invoca `runCinemaScrapeAndSync()` tal cual está: la misma función que ya
 * usaba `/api/scrape-cinemas`. Acá no se toca nada del scraping.
 */
export const cinesHandler: JobHandler = async (ctx) => {
  const result = await runCinemaScrapeAndSync()

  // `runCinemaScrapeAndSync` atrapa el error de cada cine por separado y
  // siempre devuelve `success: true`, así que una cartelera vacía es
  // indistinguible de "los tres cines fallaron". Se trata como falla y se
  // lanza para que entren los reintentos: tres cines sin ninguna función un
  // día cualquiera no es un estado real, es el scraper roto. Es la misma
  // decisión que ya se tomó con NorteTicket, donde el fallo estuvo meses
  // invisible porque el job reportaba éxito con cero eventos.
  if (result.processed === 0) {
    throw new Error(
      'El scraper de cines no devolvió ninguna película: se asume fuente caída o selector roto.',
    )
  }

  ctx.log(
    `${result.processed} películas (${result.inserted} nuevas, ${result.updated} actualizadas, ${result.softDeleted} dadas de baja)`,
  )

  return {
    itemsProcessed: result.processed,
    itemsFailed: 0,
    details: {
      inserted: result.inserted,
      updated: result.updated,
      softDeleted: result.softDeleted,
    },
  }
}
