/**
 * R68, 68-q: integracion de 68-a por fuente (sin red ni base, fixtures inventados).
 *
 * Contrato comun a todas las fuentes:
 *  - frase positiva + precio 0            -> is_free true
 *  - sin frase + precio 0                 -> false (sigue "Consultar")
 *  - precio > 0 con "gratis" en el texto  -> false
 *  - frase + condicion (2x1, grupo)       -> false
 *  - alpogo `gratuito === '1'`            -> true aunque no haya frase (la fuente lo informa)
 *  - norteticket `ARS 0`                  -> true (la fuente lo informa)
 *
 * Fuentes cubiertas: norteticket (parsers.ts), vamos (vamos-parsers.ts), entradauno y alpogo
 * (scrapers de lib y providers del cron; estos con `fetch` stubbeado y `saveEventsToSupabase`
 * mockeado). Todo lo demas de cada scraper queda fuera.
 *
 * Roturas razonadas a mano: si un scraper volviera a `is_free = price_min === 0` (sin frase),
 * falla "sin frase + precio 0"; si ignorara el precio (`is_free = textoIndicaGratis(..)`),
 * falla "precio > 0 con gratis"; si dejara de pasar el texto a `textoIndicaGratis`, falla la
 * positiva; si alpogo dejara de leer `gratuito`, falla "gratuito === '1'".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const guardado = vi.hoisted(() => ({
  llamadas: [] as Array<Array<Record<string, unknown>>>,
}))
vi.mock('@/lib/scraper/save-to-supabase', () => ({
  saveEventsToSupabase: async (eventos: Array<Record<string, unknown>>) => {
    guardado.llamadas.push(eventos)
    return { inserted: eventos.length, skipped: 0, errors: [], venueErrors: [] }
  },
}))

import { parseAllEventsFromHtml } from '@/lib/scraper/parsers'
import { normalizeVamosEvento } from '@/lib/scraper/vamos-parsers'
import { scrapeEntradaUno as scrapeEntradaUnoLib } from '@/lib/scraper/entradauno-scraper'
import { scrapeAlpogoSalta } from '@/lib/scraper/alpogo-scraper'
import { scrapeEntradaUno as scrapeEntradaUnoCron } from '@/app/api/cron/scrape/providers/entradauno'
import { scrapeAlpogo as scrapeAlpogoCron } from '@/app/api/cron/scrape/providers/alpogo'

// Casos comunes: [nombre, precio, descripcion, is_free esperado].
const CASOS: Array<{ caso: string; precio: number | undefined; desc: string; esperado: boolean }> = [
  { caso: 'frase positiva + precio 0', precio: 0, desc: 'Entrada libre y gratuita. Show de prueba.', esperado: true },
  { caso: 'precio ausente (0) + "entrada gratis" sin condicion', precio: undefined, desc: 'Entrada gratis.', esperado: true },
  { caso: 'sin frase + precio 0', precio: 0, desc: 'Show de prueba en el Venue de Prueba.', esperado: false },
  { caso: 'precio > 0 con "gratis" en el texto', precio: 5000, desc: 'Entrada gratis para quien traiga el flyer.', esperado: false },
  { caso: 'precio > 0 con frase limpia', precio: 3500, desc: 'Entrada libre y gratuita.', esperado: false },
  { caso: 'frase + condicion 2x1', precio: 0, desc: 'Entrada gratis. Promo 2x1 en cerveza.', esperado: false },
  { caso: 'frase + gratuidad solo para un grupo', precio: 0, desc: 'Gratis para menores de 12 anios.', esperado: false },
  { caso: 'frase + hasta cierta hora', precio: 0, desc: 'Entrada gratis hasta las 2.', esperado: false },
  { caso: 'frase + "a la gorra" (aporte voluntario no es gratis)', precio: 0, desc: 'Entrada gratuita a la gorra.', esperado: false },
]

beforeEach(() => {
  guardado.llamadas.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function stubFetch(json: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })),
  )
}

// --- norteticket (HTML) -----------------------------------------------------------------------------------------

function cardNorteticket(titulo: string, precio: string): string {
  return `
    <div id="boxEvent">
      <div class="imagebox-container"><img src="/img/prueba.jpg"></div>
      <h4 class="card-title">${titulo}</h4>
      <div class="col-12 text-left">
        <p class="card-text">31/10/2030, 21:00</p>
        <p class="card-text">Venue de Prueba, Salta, Salta</p>
        <p class="card-text">${precio}</p>
      </div>
      <a class="buy-button" href="/evento/prueba">Comprar</a>
    </div>`
}

describe('norteticket: parseAllEventsFromHtml', () => {
  const una = (titulo: string, precio: string) => parseAllEventsFromHtml(cardNorteticket(titulo, precio))[0]

  it('"Desde ARS 0" (la fuente informa 0) -> is_free true, price_min 0', () => {
    const ev = una('Festival de Prueba', 'Desde ARS 0')
    expect(ev.price_min).toBe(0)
    expect(ev.is_free).toBe(true)
  })

  it('"Desde ARS 25000" -> is_free false, price_min 25000', () => {
    const ev = una('Festival de Prueba', 'Desde ARS 25000')
    expect(ev.price_min).toBe(25000)
    expect(ev.is_free).toBe(false)
  })

  it('sin precio y sin frase -> is_free false (sigue "Consultar")', () => {
    const ev = una('Festival de Prueba', '')
    expect(ev.price_min).toBe(0)
    expect(ev.is_free).toBe(false)
  })

  it('sin precio y con frase positiva ("Entrada libre y gratuita") -> true', () => {
    expect(una('Festival de Prueba', 'Entrada libre y gratuita').is_free).toBe(true)
    expect(una('Festival Gratis de Prueba', '').is_free).toBe(true) // la frase en el titulo tambien cuenta
  })

  it('sin precio, frase + condicion (2x1, menores) -> false', () => {
    expect(una('Festival de Prueba', 'Gratis. Promo 2x1').is_free).toBe(false)
    expect(una('Festival de Prueba', 'Gratis para menores de 10').is_free).toBe(false)
  })

  it('con precio > 0 no se mira el texto: "gratis" en el titulo no lo vuelve gratis', () => {
    const ev = una('Festival Gratis de Prueba', 'Desde ARS 8000')
    expect(ev.price_min).toBe(8000)
    expect(ev.is_free).toBe(false)
  })
})

// --- vamos (normalizador puro) ----------------------------------------------------------------------------------

function eventoVamos(precio: number | undefined, desc: string, nombre = 'Evento de Prueba') {
  return {
    idEspectaculoCartel: 1,
    idEspectaculoCartelTipo: 1,
    listaIdEspectaculoCartelCategoria: [],
    cNombre: nombre,
    cDescripcion: encodeURIComponent(`<p>${desc}</p>`),
    cDescripcion_l172: '',
    cSeo: 'evento-de-prueba',
    cHashValidacion: 'hash-de-prueba',
    fPrecioDesde: precio as number,
    cImagenEquityThumb: '',
    cImagenBanner: '',
    cImagenEquityBanner: '',
    cWebUri: '',
    oFuncionMenor: null,
    oFuncionLista: [{ idFuncion: 1, idEstablecimiento: 1, dFuncion: '2030-10-31T21:00:00', dFuncionHasta: '2030-10-31T23:00:00' }],
    listaIdEstablecimiento: [1],
    nCantidadFunciones: 1,
  }
}
const venuesVamos = new Map([[1, { idEstablecimiento: 1, cNombre: 'Venue de Prueba', cDomicilio: 'Calle de Prueba 1', cSeo: 'venue', cGoogleMapTag: null }]])

describe('vamos: normalizeVamosEvento', () => {
  for (const { caso, precio, desc, esperado } of CASOS) {
    it(`${caso} -> is_free ${esperado}`, () => {
      const r = normalizeVamosEvento(eventoVamos(precio, desc), venuesVamos)
      expect(r).not.toBeNull()
      expect(r!.is_free).toBe(esperado)
      if (precio === 5000 || precio === 3500) expect(r!.price_min).toBe(precio)
    })
  }

  it('la frase en el nombre (no en la descripcion) tambien cuenta', () => {
    expect(normalizeVamosEvento(eventoVamos(0, 'Show de prueba.', 'Ciclo Gratis de Prueba'), venuesVamos)!.is_free).toBe(true)
  })
})

// --- entradauno: scraper de lib (admin) y provider del cron -----------------------------------------------------

function eventoEntradaUno(precio: number | undefined, desc: string, nombre = 'Evento de Prueba') {
  return {
    cNombre: nombre,
    cDescripcion: encodeURIComponent(`<p>${desc}</p>`),
    cSeo: 'evento-de-prueba',
    idEspectaculoCartel: 1,
    cHashValidacion: 'hash-de-prueba',
    listaIdEstablecimiento: [1],
    oFuncionLista: [{ dFuncion: '2030-10-31T21:00:00' }],
    fPrecioDesde: precio,
  }
}
function carteleraEntradaUno(eventos: unknown[]) {
  return {
    oData: {
      oCartelera: {
        listaEspectaculoCartel: eventos,
        listaEstablecimiento: [{ idEstablecimiento: 1, cNombre: 'Venue de Prueba', cZona: 'Salta', idProvincia: 16, cGoogleMapTag: null, cDomicilio: 'Calle de Prueba 1' }],
      },
    },
  }
}

describe('entradauno: scraper de lib (admin)', () => {
  for (const { caso, precio, desc, esperado } of CASOS) {
    it(`${caso} -> is_free ${esperado}`, async () => {
      stubFetch(carteleraEntradaUno([eventoEntradaUno(precio, desc)]))
      await scrapeEntradaUnoLib()
      const [ev] = guardado.llamadas[0]
      expect(ev.is_free).toBe(esperado)
      expect(ev.price_min).toBe(precio ?? 0)
    })
  }
})

// HALLAZGO (68-q, arreglado en 68-r1): el provider del cron le pasaba a `textoIndicaGratis` el
// `cDescripcion` CRUDO, que la API entrega como HTML URL-encoded ("%3Cp%3EEntrada%20libre..."), y por
// el cron EntradaUno nunca marcaba is_free=true por la descripcion. Ahora lo decodifica antes
// (`textoDeDescripcion`); si vuelve a pasar el crudo, los casos "esperado true" se ponen en rojo.
describe('entradauno: provider del cron', () => {
  for (const { caso, precio, desc, esperado } of CASOS) {
    it(`${caso} -> isFree ${esperado}`, async () => {
      stubFetch(carteleraEntradaUno([eventoEntradaUno(precio, desc)]))
      const [ev] = await scrapeEntradaUnoCron()
      expect(ev.isFree).toBe(esperado)
      expect(ev.priceFrom).toBe(precio ?? 0)
    })
  }

  it('la frase en el NOMBRE si cuenta (el nombre no viene codificado)', async () => {
    stubFetch(carteleraEntradaUno([eventoEntradaUno(0, 'Show de prueba.', 'Ciclo Gratis de Prueba')]))
    const [ev] = await scrapeEntradaUnoCron()
    expect(ev.isFree).toBe(true)
  })
})

// --- alpogo: scraper de lib (admin) y provider del cron ---------------------------------------------------------

function eventoAlpogo(precio: number | undefined, desc: string, extra: Record<string, unknown> = {}) {
  return {
    nombre: 'Evento de Prueba',
    fecha_funcion: '2030-10-31 21:00:00',
    menor_precio: precio === undefined ? undefined : String(precio),
    descripcion: `<p>${desc}</p>`,
    lugar: 'Venue de Prueba',
    actividad: 'Otros',
    urlCompra: 'https://alpogo.ejemplo.test/evento-de-prueba',
    ...extra,
  }
}

describe('alpogo: scraper de lib (admin)', () => {
  for (const { caso, precio, desc, esperado } of CASOS) {
    it(`${caso} -> is_free ${esperado}`, async () => {
      stubFetch([eventoAlpogo(precio, desc)])
      await scrapeAlpogoSalta()
      const [ev] = guardado.llamadas[0]
      expect(ev.is_free).toBe(esperado)
      expect(ev.price_min).toBe(precio ?? 0)
    })
  }

  it('gratuito === "1" -> true aunque no haya frase ni precio 0 informado', async () => {
    stubFetch([eventoAlpogo(0, 'Show de prueba.', { gratuito: '1' })])
    await scrapeAlpogoSalta()
    expect(guardado.llamadas[0][0].is_free).toBe(true)
  })

  it('gratuito === "0" no es evidencia (se sigue por el texto)', async () => {
    stubFetch([eventoAlpogo(0, 'Show de prueba.', { gratuito: '0' })])
    await scrapeAlpogoSalta()
    expect(guardado.llamadas[0][0].is_free).toBe(false)
  })
})

describe('alpogo: provider del cron', () => {
  for (const { caso, precio, desc, esperado } of CASOS) {
    it(`${caso} -> isFree ${esperado}`, async () => {
      stubFetch([eventoAlpogo(precio, desc)])
      const [ev] = await scrapeAlpogoCron()
      expect(ev.isFree).toBe(esperado)
      expect(ev.priceFrom).toBe(precio ?? 0)
    })
  }

  it('gratuito === "1" -> true aunque no haya frase', async () => {
    stubFetch([eventoAlpogo(0, 'Show de prueba.', { gratuito: '1' })])
    const [ev] = await scrapeAlpogoCron()
    expect(ev.isFree).toBe(true)
  })

  it('gratuito === "0" no es evidencia', async () => {
    stubFetch([eventoAlpogo(0, 'Show de prueba.', { gratuito: '0' })])
    const [ev] = await scrapeAlpogoCron()
    expect(ev.isFree).toBe(false)
  })
})
