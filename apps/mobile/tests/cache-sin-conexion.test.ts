// R43, 43-a: la base de la caché (lib/sin-conexion/cache.ts), con un almacén
// en memoria (nunca AsyncStorage real, ni siquiera el doble del alias de
// Vitest: ese es para quien no quiera mockear nada a mano, pero acá
// queremos un control fino del contenido para probar los bordes). Fixtures
// inventados, sin red ni base.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Almacen } from '../lib/sin-conexion/almacen'
import {
  borrarCacheFavoritos,
  borrarTodaLaCache,
  CLAVE_AGENDA,
  CLAVE_FAVORITOS,
  guardarCache,
  leerCache,
  limpiarVersionesViejas,
  MARGEN_SOBRE_CACHE,
  PREFIJO_CACHE,
  recortarDescripcion,
  recortarParaCache,
  reiniciarBanderaDeLimpieza,
  TOPE_CARACTERES_AGENDA,
  TOPE_CARACTERES_FAVORITOS,
  TOPE_ITEMS_AGENDA,
  TTL_FAVORITOS_MS,
  VERSION_CACHE,
} from '../lib/sin-conexion/cache'
import type { EventoVigenteParaInicio } from '../lib/datos/eventos'
import type { DisplayEvent } from '@qps/core/home/types'

function crearAlmacenEnMemoria(inicial: Record<string, string> = {}): Almacen & { mapa: Map<string, string> } {
  const mapa = new Map(Object.entries(inicial))
  return {
    mapa,
    leer: async (clave) => (mapa.has(clave) ? (mapa.get(clave) as string) : null),
    escribir: async (clave, valor) => {
      mapa.set(clave, valor)
    },
    borrar: async (clave) => {
      mapa.delete(clave)
    },
    claves: async () => [...mapa.keys()],
    borrarVarias: async (claves) => {
      for (const clave of claves) mapa.delete(clave)
    },
  }
}

function crearAlmacenQueTira(): Almacen {
  const falla = () => Promise.reject(new Error('almacén roto'))
  return { leer: falla, escribir: falla, borrar: falla, claves: falla, borrarVarias: falla }
}

const DESCRIPCION_BASE =
  'Una noche de música en vivo con bandas locales e invitados especiales, entrada libre y gratuita hasta agotar la capacidad de la sala, en el centro de la ciudad, con buena iluminación y sonido profesional para toda la familia. '

/** `EventoVigenteParaInicio` inventado: la descripción vive ANIDADA en `evento.description` (la forma real de la agenda). */
function crearEventoAgendaFixture(indice: number): EventoVigenteParaInicio {
  const descripcion = DESCRIPCION_BASE.repeat(2).slice(0, 180 + (indice % 50))
  return {
    evento: {
      id: `evento-${indice}`,
      slug: `evento-${indice}`,
      title: `Evento número ${indice} en Salta`,
      venue: `Lugar ${indice % 20}`,
      date: '2026-10-20',
      time: '21:00',
      category: 'recitales',
      categoryName: 'Recitales',
      price: indice % 3 === 0 ? 'gratis' : 1500 + indice,
      image: `https://example.com/imagenes/evento-${indice}.jpg`,
      description: descripcion,
      address: `Calle Falsa ${indice}, Salta`,
      startDateTime: '2026-10-20T21:00:00-03:00',
      ticketUrl: indice % 5 === 0 ? `https://ticketera.example.com/evento-${indice}` : undefined,
      isFeatured: false,
    },
    paraAtajo: {
      start_date: '2026-10-20T21:00:00-03:00',
      end_date: null,
      category: 'recitales',
    },
    // A3 (nube Q1): el campo nuevo de `EventoVigenteParaInicio` (recitales: no es para chicos).
    paraChicos: false,
  }
}

/** `DisplayEvent` inventado: la descripción vive PLANA (la forma real de favoritos). */
function crearFavoritoFixture(indice: number): DisplayEvent {
  return {
    id: `evento-${indice}`,
    slug: `evento-${indice}`,
    title: `Favorito ${indice}`,
    venue: `Lugar ${indice}`,
    date: '2026-10-21',
    time: '20:00',
    category: 'teatro',
    categoryName: 'Teatro',
    price: 'gratis',
    image: `https://example.com/imagenes/favorito-${indice}.jpg`,
    description: DESCRIPCION_BASE,
    address: `Calle Falsa ${indice}, Salta`,
    startDateTime: '2026-10-21T20:00:00-03:00',
    isFeatured: false,
  }
}

/** La `sinDescripcionLarga` de la agenda: la descripción está en `item.evento.description`. */
function sinDescripcionLargaAgenda(item: EventoVigenteParaInicio): EventoVigenteParaInicio {
  return { ...item, evento: { ...item.evento, description: recortarDescripcion(item.evento.description) } }
}

/** La `sinDescripcionLarga` de favoritos: la descripción está en `item.description`, plana. */
function sinDescripcionLargaFavoritos(item: DisplayEvent): DisplayEvent {
  return { ...item, description: recortarDescripcion(item.description) }
}

beforeEach(() => {
  reiniciarBanderaDeLimpieza()
})

describe('guardarCache + leerCache: el camino feliz', () => {
  it('guarda y lee de vuelta con un almacén en memoria', async () => {
    const almacen = crearAlmacenEnMemoria()
    const ahora = new Date('2026-10-14T12:00:00-03:00')

    const ok = await guardarCache(CLAVE_FAVORITOS, { eventos: [crearFavoritoFixture(1)] }, { ahora, almacen })
    expect(ok).toBe(true)

    const leido = await leerCache<{ eventos: DisplayEvent[] }>(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
    expect(leido).not.toBeNull()
    expect(leido?.datos.eventos[0].id).toBe('evento-1')
    expect(leido?.guardadoEn.toISOString()).toBe(ahora.toISOString())
  })

  it('el sobre guardado tiene v: VERSION_CACHE y guardadoEn en ISO', async () => {
    const almacen = crearAlmacenEnMemoria()
    const ahora = new Date('2026-10-14T12:00:00-03:00')
    await guardarCache(CLAVE_AGENDA, { eventos: [] }, { ahora, almacen })

    const crudo = JSON.parse(almacen.mapa.get(CLAVE_AGENDA) as string)
    expect(crudo.v).toBe(VERSION_CACHE)
    expect(crudo.guardadoEn).toBe(ahora.toISOString())
  })
})

describe('leerCache: TTL', () => {
  it('justo ANTES de vencer (1 ms de margen) todavía es válida', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-01T00:00:00-03:00')
    await guardarCache(CLAVE_FAVORITOS, { eventos: [] }, { ahora: guardadoEn, almacen })

    const ahora = new Date(guardadoEn.getTime() + TTL_FAVORITOS_MS - 1)
    const leido = await leerCache(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
    expect(leido).not.toBeNull()
  })

  it('justo DESPUÉS de vencer da null y borra la clave', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-01T00:00:00-03:00')
    await guardarCache(CLAVE_FAVORITOS, { eventos: [] }, { ahora: guardadoEn, almacen })

    const ahora = new Date(guardadoEn.getTime() + TTL_FAVORITOS_MS + 1)
    const leido = await leerCache(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
    expect(leido).toBeNull()
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(false)
  })
})

describe('leerCache: versión', () => {
  it('un sobre con v: 2 (distinto de VERSION_CACHE) se ignora y se borra', async () => {
    const almacen = crearAlmacenEnMemoria({
      [CLAVE_AGENDA]: JSON.stringify({ v: 2, guardadoEn: new Date().toISOString(), datos: { eventos: [] } }),
    })

    const leido = await leerCache(CLAVE_AGENDA, { ahora: new Date(), ttlMs: 999999999, almacen })
    expect(leido).toBeNull()
    expect(almacen.mapa.has(CLAVE_AGENDA)).toBe(false)
  })

  it('limpiarVersionesViejas borra una clave qps:cache:v0:agenda (de otra versión, no v1)', async () => {
    const almacen = crearAlmacenEnMemoria({
      'qps:cache:v0:agenda': JSON.stringify({ v: 0, guardadoEn: new Date().toISOString(), datos: {} }),
      [CLAVE_FAVORITOS]: JSON.stringify({ v: VERSION_CACHE, guardadoEn: new Date().toISOString(), datos: {} }),
    })

    await limpiarVersionesViejas(almacen)

    expect(almacen.mapa.has('qps:cache:v0:agenda')).toBe(false)
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(true)
  })

  it('guardarCache dispara limpiarVersionesViejas (una vez por arranque)', async () => {
    const almacen = crearAlmacenEnMemoria({
      'qps:cache:v0:agenda': JSON.stringify({ v: 0, guardadoEn: new Date().toISOString(), datos: {} }),
    })

    await guardarCache(CLAVE_FAVORITOS, { eventos: [] }, { ahora: new Date(), almacen })

    expect(almacen.mapa.has('qps:cache:v0:agenda')).toBe(false)
  })
})

describe('leerCache: datos corruptos', () => {
  it('JSON roto da null y borra la clave', async () => {
    const almacen = crearAlmacenEnMemoria({ [CLAVE_AGENDA]: 'esto no es json{{{' })

    const leido = await leerCache(CLAVE_AGENDA, { ahora: new Date(), ttlMs: 999999999, almacen })
    expect(leido).toBeNull()
    expect(almacen.mapa.has(CLAVE_AGENDA)).toBe(false)
  })

  it('un guardadoEn en el futuro da null y borra la clave', async () => {
    const almacen = crearAlmacenEnMemoria()
    const ahora = new Date('2026-10-14T12:00:00-03:00')
    const futuro = new Date(ahora.getTime() + 60_000)
    await guardarCache(CLAVE_FAVORITOS, { eventos: [] }, { ahora: futuro, almacen })

    const leido = await leerCache(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
    expect(leido).toBeNull()
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(false)
  })

  it('un guardadoEn que no parsea como fecha da null y borra la clave', async () => {
    const almacen = crearAlmacenEnMemoria({
      [CLAVE_AGENDA]: JSON.stringify({ v: VERSION_CACHE, guardadoEn: 'no-es-una-fecha', datos: {} }),
    })

    const leido = await leerCache(CLAVE_AGENDA, { ahora: new Date(), ttlMs: 999999999, almacen })
    expect(leido).toBeNull()
    expect(almacen.mapa.has(CLAVE_AGENDA)).toBe(false)
  })

  it('no hay nada guardado: null, sin tirar', async () => {
    const almacen = crearAlmacenEnMemoria()
    const leido = await leerCache(CLAVE_AGENDA, { ahora: new Date(), ttlMs: 999999999, almacen })
    expect(leido).toBeNull()
  })
})

describe('recortarParaCache', () => {
  it('401 eventos quedan en 400 (TOPE_ITEMS_AGENDA)', () => {
    const items = Array.from({ length: 401 }, (_valor, indice) => crearEventoAgendaFixture(indice))
    const recortado = recortarParaCache(items, {
      topeItems: TOPE_ITEMS_AGENDA,
      topeCaracteres: 50_000_000,
      sinDescripcionLarga: sinDescripcionLargaAgenda,
    })
    expect(recortado).not.toBeNull()
    expect(recortado?.length).toBe(400)
  })

  it('una descripción de 2.000 caracteres queda en 300, en la forma ANIDADA (evento.description)', () => {
    const item = crearEventoAgendaFixture(0)
    item.evento.description = 'x'.repeat(2000)

    const recortado = recortarParaCache([item], {
      topeItems: 10,
      topeCaracteres: 50_000,
      sinDescripcionLarga: sinDescripcionLargaAgenda,
    })

    expect(recortado?.[0].evento.description.length).toBe(300)
  })

  it('una descripción de 2.000 caracteres queda en 300, en la forma PLANA (description) — el otro llamador, favoritos', () => {
    const item = crearFavoritoFixture(0)
    item.description = 'y'.repeat(2000)

    const recortado = recortarParaCache([item], {
      topeItems: 10,
      topeCaracteres: 50_000,
      sinDescripcionLarga: sinDescripcionLargaFavoritos,
    })

    expect(recortado?.[0].description.length).toBe(300)
  })

  it('si la sinDescripcionLarga leyera la forma equivocada, la agenda NO recortaría nada: la prueba de que la inyección importa', () => {
    const item = crearEventoAgendaFixture(0)
    item.evento.description = 'x'.repeat(2000)

    // `(it) => it` simula el error de leer `item.description` a secas sobre
    // un `EventoVigenteParaInicio` (no tiene ese campo, así que no cambia nada).
    const recortadoSinInyeccionCorrecta = recortarParaCache([item], {
      topeItems: 10,
      topeCaracteres: 50_000,
      sinDescripcionLarga: (it: EventoVigenteParaInicio) => it,
    })

    expect(recortadoSinInyeccionCorrecta?.[0].evento.description.length).toBe(2000)
  })

  it('una lista que no entra ni vacía da null (topeCaracteres menor que "[]")', () => {
    const items = [crearFavoritoFixture(0)]
    const recortado = recortarParaCache(items, {
      topeItems: 10,
      topeCaracteres: 1,
      sinDescripcionLarga: sinDescripcionLargaFavoritos,
    })
    expect(recortado).toBeNull()
  })

  it('una lista vacía siempre entra (salvo con un tope absurdo)', () => {
    const recortado = recortarParaCache<DisplayEvent>([], {
      topeItems: 10,
      topeCaracteres: 1000,
      sinDescripcionLarga: sinDescripcionLargaFavoritos,
    })
    expect(recortado).toEqual([])
  })
})

describe('recortarParaCache + guardarCache: la franja de riesgo del margen del sobre (vuelta 1 de la revisión)', () => {
  // `recortarParaCache` medía solo el array de `datos` contra
  // `topeCaracteres`; `guardarCache` mide el SOBRE completo (`{ v,
  // guardadoEn, datos }`, MARGEN_SOBRE_CACHE caracteres más) contra el
  // mismo tope. Una lista cuyo array mide entre `tope - MARGEN_SOBRE_CACHE`
  // y `tope` caía justo en el agujero: el recorte decía "entra" y
  // `guardarCache` la rechazaba y borraba la clave vieja que funcionaba.
  //
  // `MARGEN_SOBRE_CACHE` es chico (bien por debajo de 100 caracteres: ver
  // su comentario en cache.ts), así que para poner un fixture justo en esa
  // franja alcanza con un `topeCaracteres` chico e inventado (acá, 200) —
  // no hace falta acercarse a los 300.000/1.000.000 reales.
  it('MARGEN_SOBRE_CACHE es un número chico y positivo (depende solo de VERSION_CACHE y del ISO, no de un valor puesto a mano)', () => {
    // Anotado a propósito para el reporte de la vuelta 1 de 43-a (no es código de la app).
    console.log(`[43-a, vuelta 1] MARGEN_SOBRE_CACHE = ${MARGEN_SOBRE_CACHE}`)
    expect(MARGEN_SOBRE_CACHE).toBeGreaterThan(0)
    expect(MARGEN_SOBRE_CACHE).toBeLessThan(100)
  })

  it('un array "al borde" (entre tope - MARGEN_SOBRE_CACHE y tope): recortarParaCache lo recorta y el resultado SÍ entra en el sobre', () => {
    const topeChico = 200 // inventado, no es TOPE_CARACTERES_FAVORITOS (300.000) ni TOPE_CARACTERES_AGENDA (1.000.000).
    const ahora = new Date('2026-10-14T12:00:00-03:00')

    // Dos ítems: uno chico que sobrevive al recorte, y uno grande calculado
    // para que el array COMPLETO (sin recortar) mida justo 5 caracteres por
    // debajo de `topeChico` — adentro de la franja de riesgo
    // `(topeChico - MARGEN_SOBRE_CACHE, topeChico]`, ya que
    // `MARGEN_SOBRE_CACHE` es mucho más que 5 (se verifica arriba). El
    // tamaño de `itemGrande` se calcula restando el "relleno" del array con
    // el string vacío (comillas, coma, corchetes), no a mano: así no
    // importa si `itemChico` cambia.
    const itemChico = 'ok'
    const objetivoArray = topeChico - 5
    const relleno = JSON.stringify([itemChico, '']).length
    const itemGrande = 'x'.repeat(objetivoArray - relleno)
    const items = [itemChico, itemGrande]

    const arrayCompleto = JSON.stringify(items)
    // El fixture tiene que caer de verdad en la franja de riesgo: si esto
    // fallara, hay que ajustar los tamaños de arriba, no borrar el test.
    expect(arrayCompleto.length).toBeLessThanOrEqual(topeChico)
    expect(arrayCompleto.length).toBeGreaterThan(topeChico - MARGEN_SOBRE_CACHE)

    // Lo que habría pasado con el código viejo (array completo, sin
    // recortar, porque "entraba" contra `topeChico` sola): ya puesto en el
    // sobre real que arma `guardarCache`, SE PASA del tope.
    const sobreConLoViejo = JSON.stringify({ v: VERSION_CACHE, guardadoEn: ahora.toISOString(), datos: items })
    expect(sobreConLoViejo.length).toBeGreaterThan(topeChico)

    // Con el arreglo: recortarParaCache descuenta MARGEN_SOBRE_CACHE sola.
    const recorte = recortarParaCache(items, {
      topeItems: items.length,
      topeCaracteres: topeChico,
      sinDescripcionLarga: (item: string) => item,
    })

    expect(recorte).not.toBeNull()
    expect(recorte).toEqual([itemChico]) // sacó el grande, dejó el chico: no quedó vacío de más.

    const sobreConElArreglo = JSON.stringify({ v: VERSION_CACHE, guardadoEn: ahora.toISOString(), datos: recorte })
    // Esto es EXACTAMENTE lo que compara `guardarCache`
    // (`texto.length > topeCaracteresDe(clave)`) antes de escribir: con el
    // arreglo da `false` (escribe) en vez de `true` (borraría la vieja).
    expect(sobreConElArreglo.length).toBeLessThanOrEqual(topeChico)
  })

  it('end-to-end con el guardarCache real y CLAVE_FAVORITOS (tope real, 300.000 — no 1.000.000, no hace falta un fixture gigante)', async () => {
    const ahora = new Date('2026-10-14T12:00:00-03:00')

    // Un ítem chico (sobrevive al recorte) y uno grande, calculados igual
    // que en el test de arriba (array completo a 5 caracteres de
    // TOPE_CARACTERES_FAVORITOS): un solo campo largo armado con
    // `.repeat()`, no miles de ítems ni un tope de 1.000.000.
    const itemChico = 'ok'
    const objetivoArray = TOPE_CARACTERES_FAVORITOS - 5
    const relleno = JSON.stringify([itemChico, '']).length
    const itemGrande = 'x'.repeat(objetivoArray - relleno)
    const itemsSinRecortar = [itemChico, itemGrande]
    expect(JSON.stringify(itemsSinRecortar).length).toBeLessThanOrEqual(TOPE_CARACTERES_FAVORITOS)
    expect(JSON.stringify(itemsSinRecortar).length).toBeGreaterThan(
      TOPE_CARACTERES_FAVORITOS - MARGEN_SOBRE_CACHE,
    )

    // Representa lo que el código VIEJO le habría pasado a `guardarCache`
    // (el array tal cual, porque "entraba" contra el tope sin descontar el
    // margen): `guardarCache` lo rechaza y borra lo que hubiera.
    const almacenConLoViejo = crearAlmacenEnMemoria({ [CLAVE_FAVORITOS]: 'valor-viejo-que-tiene-que-desaparecer' })
    const okConLoViejo = await guardarCache(CLAVE_FAVORITOS, itemsSinRecortar, { ahora, almacen: almacenConLoViejo })
    expect(okConLoViejo).toBe(false)
    expect(almacenConLoViejo.mapa.has(CLAVE_FAVORITOS)).toBe(false)

    // Con el arreglo: se pasa por recortarParaCache antes (lo que haría
    // 43-b), y AHORA SÍ entra.
    const almacenConElArreglo = crearAlmacenEnMemoria()
    const recorte = recortarParaCache(itemsSinRecortar, {
      topeItems: itemsSinRecortar.length,
      topeCaracteres: TOPE_CARACTERES_FAVORITOS,
      sinDescripcionLarga: (item: string) => item,
    })
    expect(recorte).toEqual([itemChico])

    const okConElArreglo = await guardarCache(CLAVE_FAVORITOS, recorte, { ahora, almacen: almacenConElArreglo })
    expect(okConElArreglo).toBe(true)
    expect(almacenConElArreglo.mapa.has(CLAVE_FAVORITOS)).toBe(true)
  })
})

describe('guardarCache: el tope de caracteres es también una red de seguridad propia', () => {
  it('si el JSON pasa el tope de la clave, no escribe y borra lo que hubiera (la vieja)', async () => {
    const almacen = crearAlmacenEnMemoria({ [CLAVE_AGENDA]: 'valor-viejo-que-tiene-que-desaparecer' })
    const itemsEnormes = Array.from({ length: 5000 }, (_valor, indice) => crearEventoAgendaFixture(indice))

    const ok = await guardarCache(CLAVE_AGENDA, { eventos: itemsEnormes }, { ahora: new Date(), almacen })

    expect(ok).toBe(false)
    expect(almacen.mapa.has(CLAVE_AGENDA)).toBe(false)
  })

  it('guardarCache con un almacén que tira no tira: devuelve false', async () => {
    const almacen = crearAlmacenQueTira()
    const ok = await guardarCache(CLAVE_FAVORITOS, { eventos: [] }, { ahora: new Date(), almacen })
    expect(ok).toBe(false)
  })
})

describe('borrarCacheFavoritos y borrarTodaLaCache', () => {
  it('borrarCacheFavoritos borra CLAVE_FAVORITOS y deja la agenda intacta', async () => {
    const almacen = crearAlmacenEnMemoria({
      [CLAVE_FAVORITOS]: 'x',
      [CLAVE_AGENDA]: 'y',
    })
    await borrarCacheFavoritos(almacen)
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(false)
    expect(almacen.mapa.has(CLAVE_AGENDA)).toBe(true)
  })

  it('borrarCacheFavoritos alcanza la clave de favoritos de CUALQUIER versión (bug de seguridad, vuelta 1): v0 y v1 se van, una clave ajena se queda', async () => {
    const almacen = crearAlmacenEnMemoria({
      'qps:cache:v0:favoritos': 'favoritos-de-una-versión-vieja-del-formato',
      [CLAVE_FAVORITOS]: 'favoritos-de-la-versión-actual',
      'otra-app:preferencias': 'no-es-de-la-caché-sin-conexión',
    })

    await borrarCacheFavoritos(almacen)

    expect(almacen.mapa.has('qps:cache:v0:favoritos')).toBe(false)
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(false)
    expect(almacen.mapa.has('otra-app:preferencias')).toBe(true)
  })

  it('borrarCacheFavoritos con un almacén que tira no tira', async () => {
    await expect(borrarCacheFavoritos(crearAlmacenQueTira())).resolves.toBeUndefined()
  })

  it('borrarTodaLaCache borra solo lo que empieza con PREFIJO_CACHE y deja otras claves intactas', async () => {
    const almacen = crearAlmacenEnMemoria({
      [CLAVE_AGENDA]: 'a',
      [CLAVE_FAVORITOS]: 'b',
      'qps:cache:v0:agenda': 'c',
      'otra-app:preferencias': 'd',
      sesion: 'e',
    })

    await borrarTodaLaCache(almacen)

    expect(almacen.mapa.has(CLAVE_AGENDA)).toBe(false)
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(false)
    expect(almacen.mapa.has('qps:cache:v0:agenda')).toBe(false)
    expect(almacen.mapa.has('otra-app:preferencias')).toBe(true)
    expect(almacen.mapa.has('sesion')).toBe(true)
    expect([...almacen.mapa.keys()].every((clave) => !clave.startsWith(PREFIJO_CACHE))).toBe(true)
  })
})

describe('el tamaño real con un fixture grande', () => {
  it('400 eventos inventados (forma EventoVigenteParaInicio, descripciones realistas) entran bien debajo de TOPE_CARACTERES_AGENDA', () => {
    const items = Array.from({ length: 400 }, (_valor, indice) => crearEventoAgendaFixture(indice))
    const sobre = { v: VERSION_CACHE, guardadoEn: new Date().toISOString(), datos: { eventos: items } }
    const texto = JSON.stringify(sobre)

    // Anotado a propósito para el reporte de la tarea 43-a (no es código de la app: un test no cae bajo "ninguna función loguea").
    console.log(`[43-a] 400 eventos (EventoVigenteParaInicio) ocupan ${texto.length} caracteres en JSON`)

    expect(texto.length).toBeLessThan(TOPE_CARACTERES_AGENDA)
  })

  it('guardarCache escribe ese fixture de 400 eventos sin recortar (entra de sobra)', async () => {
    const almacen = crearAlmacenEnMemoria()
    const items = Array.from({ length: 400 }, (_valor, indice) => crearEventoAgendaFixture(indice))

    const ok = await guardarCache(CLAVE_AGENDA, { eventos: items }, { ahora: new Date(), almacen })
    expect(ok).toBe(true)
  })
})

describe('sin datos personales en lo que se escribe', () => {
  it('el string guardado para una lista de favoritos inventada no contiene user_id, email, access_token ni refresh_token', async () => {
    const almacen = crearAlmacenEnMemoria()
    const favoritos = Array.from({ length: 5 }, (_valor, indice) => crearFavoritoFixture(indice))

    await guardarCache(CLAVE_FAVORITOS, { eventos: favoritos, guardadoEn: new Date().toISOString() }, { ahora: new Date(), almacen })

    const guardado = almacen.mapa.get(CLAVE_FAVORITOS) as string
    expect(guardado).toBeTruthy()
    expect(guardado).not.toMatch(/user_id/i)
    expect(guardado).not.toMatch(/\bemail\b/i)
    expect(guardado).not.toMatch(/access_token/i)
    expect(guardado).not.toMatch(/refresh_token/i)
  })
})
