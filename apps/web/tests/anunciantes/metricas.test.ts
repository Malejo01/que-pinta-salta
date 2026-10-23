import { describe, expect, it } from 'vitest'
import { ANUNCIANTES } from '@/lib/config/anunciantes'
import {
  PIE_TARIFARIO,
  TARIFARIO,
  textoPrecioFundador,
  textoPrecioLista,
  textoUsdAprox,
} from '@qps/core/publicidad/precios'
import {
  formatPublicCount,
  formatRadarSubscribers,
  getAdvertiserMetrics,
  last30DaysRange,
  sumViewsPaged,
  type AdvertiserMetricsClient,
  type FetchPageResult,
} from '@/lib/anunciantes/metricas'

const MS_PER_DAY = 24 * 60 * 60 * 1000

describe('formatPublicCount', () => {
  it.each([
    [0, '<5'],
    [4, '<5'],
    [5, '5'],
    [1234, '1.234'],
  ])('%i -> %s', (n, esperado) => {
    expect(formatPublicCount(n)).toBe(esperado)
  })

  it('null y negativo devuelven "—"', () => {
    expect(formatPublicCount(null)).toBe('—')
    expect(formatPublicCount(-1)).toBe('—')
  })
})

describe('formatRadarSubscribers', () => {
  it.each([
    [0, '<5'],
    [4, '<5'],
    [5, '5+'],
    [9, '5+'],
    [10, '10+'],
    [19, '10+'],
    [47, '40+'],
    [1234, '1.230+'],
  ])('%i -> %s', (n, esperado) => {
    expect(formatRadarSubscribers(n)).toBe(esperado)
  })

  it('null devuelve "—"', () => {
    expect(formatRadarSubscribers(null)).toBe('—')
  })

  it('nunca muestra un número mayor que el real (redondeo siempre hacia abajo)', () => {
    for (let n = 0; n <= 3000; n++) {
      const salida = formatRadarSubscribers(n)
      if (salida === '<5' || salida === '5+') continue
      const mostrado = Number(salida.replace('+', '').replace(/\./g, ''))
      expect(mostrado).toBeLessThanOrEqual(n)
    }
  })
})

describe('last30DaysRange', () => {
  // 01:00 de Salta del 8 de agosto = 04:00 UTC (Salta es UTC-3 todo el año).
  const AHORA = new Date('2026-08-08T04:00:00Z')
  const rango = last30DaysRange(AHORA)

  it('hastaDay es el día de ayer en Salta (no "hoy" todavía en curso)', () => {
    expect(rango.hastaDay).toBe('2026-08-07')
  })

  it('desdeDay es 30 días de Salta antes de hastaDay', () => {
    expect(rango.desdeDay).toBe('2026-07-09')
  })

  it('hastaISO es la medianoche de Salta de "hoy" (03:00 UTC), no la medianoche UTC', () => {
    // Si se usara el día UTC en vez del de Salta, este instante sería "2026-08-08T00:00:00.000Z".
    expect(rango.hastaISO).toBe('2026-08-08T03:00:00.000Z')
    expect(rango.hastaISO).not.toBe('2026-08-08T00:00:00.000Z')
  })

  it('desdeISO es la medianoche de Salta de desdeDay', () => {
    expect(rango.desdeISO).toBe('2026-07-09T03:00:00.000Z')
  })

  it('el rango son exactamente 30 días (desdeISO a hastaISO)', () => {
    const diffDias = (Date.parse(rango.hastaISO) - Date.parse(rango.desdeISO)) / MS_PER_DAY
    expect(diffDias).toBe(30)
  })
})

describe('sumViewsPaged', () => {
  it('2500 filas en páginas de 1000: suma correcta, 3 páginas pedidas', async () => {
    let llamadas = 0
    const filas = Array.from({ length: 2500 }, () => ({ views: 1 }))
    const fetchPage = async (from: number, to: number): Promise<FetchPageResult> => {
      llamadas++
      return { data: filas.slice(from, to + 1), error: null }
    }
    const resultado = await sumViewsPaged(fetchPage, { pageSize: 1000 })
    expect(resultado).toEqual({ total: 2500, truncated: false })
    expect(llamadas).toBe(3)
  })

  it('página vacía devuelve 0', async () => {
    const fetchPage = async (): Promise<FetchPageResult> => ({ data: [], error: null })
    const resultado = await sumViewsPaged(fetchPage, { pageSize: 1000 })
    expect(resultado).toEqual({ total: 0, truncated: false })
  })

  it('con maxPages alcanzado y la última página llena: pide la consulta de prueba (4 llamadas) y da truncated true', async () => {
    let llamadas = 0
    const fetchPage = async (_from: number, to: number): Promise<FetchPageResult> => {
      llamadas++
      // Siempre devuelve una página llena: nunca "se termina" sola.
      const pageSize = to - _from + 1
      return { data: Array.from({ length: pageSize }, () => ({ views: 1 })), error: null }
    }
    const resultado = await sumViewsPaged(fetchPage, { pageSize: 10, maxPages: 3 })
    expect(resultado).toEqual({ total: 30, truncated: true })
    // 3 páginas (0-9, 10-19, 20-29) + la consulta de prueba (30, 30): no se
    // pasa de las páginas permitidas al sumar, esa 4.ª llamada solo decide
    // "truncated" y no suma a total.
    expect(llamadas).toBe(4)
  })

  it('un error en una página propaga el error (throw)', async () => {
    const errorDeLaPagina = { message: 'fallo de prueba en la página' }
    const fetchPage = async (): Promise<FetchPageResult> => ({ data: null, error: errorDeLaPagina })
    await expect(sumViewsPaged(fetchPage)).rejects.toBe(errorDeLaPagina)
  })

  // Casos nuevos (tarea 21-c / ronda 21, QPS-101): al llegar a maxPages con la
  // última página llena, sumViewsPaged pide UNA fila más
  // (fetchPage(maxPages * pageSize, maxPages * pageSize)) para decidir si de
  // verdad hay más datos o si el total cayó justo en el límite.

  it('total múltiplo exacto de pageSize × maxPages (30 filas, pageSize 10, maxPages 3): no queda truncado y pide (30, 30) de prueba', async () => {
    const totalFilas = 30
    const llamadas: Array<[number, number]> = []
    const fetchPage = async (from: number, to: number): Promise<FetchPageResult> => {
      llamadas.push([from, to])
      const fin = Math.min(to, totalFilas - 1)
      if (from > fin) return { data: [], error: null }
      return { data: Array.from({ length: fin - from + 1 }, () => ({ views: 1 })), error: null }
    }
    const resultado = await sumViewsPaged(fetchPage, { pageSize: 10, maxPages: 3 })
    expect(resultado).toEqual({ total: 30, truncated: false })
    // 3 páginas (0-9, 10-19, 20-29) + la consulta de prueba (30, 30), vacía.
    expect(llamadas).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
      [30, 30],
    ])
  })

  it('una fila más que el total exacto (31 filas, pageSize 10, maxPages 3): queda truncado y esa fila no se suma', async () => {
    const totalFilas = 31
    const fetchPage = async (from: number, to: number): Promise<FetchPageResult> => {
      const fin = Math.min(to, totalFilas - 1)
      if (from > fin) return { data: [], error: null }
      return { data: Array.from({ length: fin - from + 1 }, () => ({ views: 1 })), error: null }
    }
    const resultado = await sumViewsPaged(fetchPage, { pageSize: 10, maxPages: 3 })
    // El total son las 30 filas de las 3 páginas: la fila 31 (detectada por la
    // consulta de prueba) cuenta para decidir "truncated" pero no se suma.
    expect(resultado).toEqual({ total: 30, truncated: true })
  })

  it('si la consulta de prueba (la fila de más) da error, se propaga', async () => {
    const errorDeLaPrueba = { message: 'fallo de prueba en la fila de más' }
    const fetchPage = async (from: number, to: number): Promise<FetchPageResult> => {
      if (from === 30 && to === 30) return { data: null, error: errorDeLaPrueba }
      // Las 3 páginas normales (pageSize 10) siempre vienen llenas.
      return { data: Array.from({ length: to - from + 1 }, () => ({ views: 1 })), error: null }
    }
    await expect(sumViewsPaged(fetchPage, { pageSize: 10, maxPages: 3 })).rejects.toBe(errorDeLaPrueba)
  })

  it('el caso común (la última página viene incompleta) no hace la consulta de prueba', async () => {
    const llamadas: Array<[number, number]> = []
    const filas = Array.from({ length: 2500 }, () => ({ views: 1 }))
    const fetchPage = async (from: number, to: number): Promise<FetchPageResult> => {
      llamadas.push([from, to])
      return { data: filas.slice(from, to + 1), error: null }
    }
    const resultado = await sumViewsPaged(fetchPage, { pageSize: 1000, maxPages: 50 })
    expect(resultado).toEqual({ total: 2500, truncated: false })
    // Nota: el último `to` pedido es 2999 (from + pageSize - 1), aunque solo
    // existan filas hasta la 2499: fetchPage recibe el rango completo y es
    // quien decide cuántas filas realmente devuelve (slice se queda corto).
    expect(llamadas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })
})

describe('configuración de /anunciantes (ANUNCIANTES)', () => {
  it('está publicada (tarifario final cargado el 19/10) y no tiene paquetes ni precios propios', () => {
    expect(ANUNCIANTES.publicada).toBe(true)
    expect(Object.keys(ANUNCIANTES)).toEqual(['publicada'])
  })

  it('ningún texto visible del tarifario contiene "[COMPLETAR"', () => {
    const textos: string[] = []
    for (const p of TARIFARIO) {
      textos.push(p.nombre, p.queIncluye, textoPrecioLista(p.precio), textoPrecioFundador(p.precio))
      textos.push(textoUsdAprox(p.precio) ?? '')
    }
    textos.push(PIE_TARIFARIO)
    for (const texto of textos) {
      expect(texto).not.toContain('[COMPLETAR')
    }
  })
})

describe('getAdvertiserMetrics', () => {
  const AHORA = new Date('2026-08-08T04:00:00Z')

  type ClientConfig = {
    events?: { count: number | null; error?: unknown }
    radar?: { count: number | null; error?: unknown; rows?: Array<{ user_id: string }> }
    viewsPages?: Array<{ data: Array<{ views: number }> | null; error?: unknown }>
  }

  type RecordedCall = { table: string; method: string; args: unknown[] }

  function makeClient(config: ClientConfig): { client: AdvertiserMetricsClient; calls: RecordedCall[] } {
    const calls: RecordedCall[] = []
    const record = (table: string, method: string, args: unknown[]) => {
      calls.push({ table, method, args })
    }

    const from: AdvertiserMetricsClient['from'] = (table: string) => {
      if (table === 'events') {
        const chain = {
          select: (...args: unknown[]) => {
            record(table, 'select', args)
            return chain
          },
          eq: (...args: unknown[]) => {
            record(table, 'eq', args)
            return chain
          },
          gte: (...args: unknown[]) => {
            record(table, 'gte', args)
            return Promise.resolve({
              count: config.events?.count ?? 0,
              error: config.events?.error ?? null,
            })
          },
        }
        return chain
      }

      if (table === 'user_radar_settings') {
        const chain = {
          select: (...args: unknown[]) => {
            record(table, 'select', args)
            return chain
          },
          in: (...args: unknown[]) => {
            record(table, 'in', args)
            return Promise.resolve({
              count: config.radar?.count ?? 0,
              error: config.radar?.error ?? null,
              // Simula una fila real "de más" por si algún día alguien saca el head:true:
              // getAdvertiserMetrics no debe terminar exponiendo esto.
              data: config.radar?.rows ?? null,
            })
          },
        }
        return chain
      }

      if (table === 'event_metrics_daily') {
        let pagina = 0
        const chain = {
          select: (...args: unknown[]) => {
            record(table, 'select', args)
            return chain
          },
          gte: (...args: unknown[]) => {
            record(table, 'gte', args)
            return chain
          },
          lte: (...args: unknown[]) => {
            record(table, 'lte', args)
            return chain
          },
          range: (...args: unknown[]) => {
            record(table, 'range', args)
            const page = config.viewsPages?.[pagina] ?? { data: [], error: null }
            pagina++
            return Promise.resolve(page)
          },
        }
        return chain
      }

      throw new Error('tabla inesperada: ' + table)
    }

    return { client: { from }, calls }
  }

  it('pide head:true en user_radar_settings con exactamente las 3 frecuencias', async () => {
    const { client, calls } = makeClient({
      events: { count: 10 },
      radar: { count: 20 },
      viewsPages: [{ data: [{ views: 5 }], error: null }],
    })

    await getAdvertiserMetrics(client, AHORA)

    const selectRadar = calls.find((c) => c.table === 'user_radar_settings' && c.method === 'select')
    const inRadar = calls.find((c) => c.table === 'user_radar_settings' && c.method === 'in')

    expect(selectRadar?.args[1]).toEqual({ count: 'exact', head: true })
    expect(inRadar?.args).toEqual(['email_frequency', ['weekly', 'biweekly', 'monthly']])
  })

  it('aunque la tabla devuelva filas, el resultado solo expone el conteo: nada de user_id ni otros datos personales', async () => {
    const { client } = makeClient({
      events: { count: 10 },
      radar: { count: 2, rows: [{ user_id: 'u-1' }, { user_id: 'u-2' }] },
      viewsPages: [{ data: [{ views: 5 }], error: null }],
    })

    const metrics = await getAdvertiserMetrics(client, AHORA)

    expect(metrics.radarSubscribers).toBe(2)
    expect(Object.keys(metrics).sort()).toEqual(['eventsLast30', 'radarSubscribers', 'truncated', 'viewsLast30'])
    expect(JSON.stringify(metrics)).not.toMatch(/user_id|u-1|u-2/)
  })

  it('camino feliz: las tres métricas se calculan y no está truncado', async () => {
    const { client } = makeClient({
      events: { count: 12 },
      radar: { count: 34 },
      viewsPages: [{ data: [{ views: 100 }, { views: 50 }], error: null }],
    })

    const metrics = await getAdvertiserMetrics(client, AHORA)
    expect(metrics).toEqual({
      eventsLast30: 12,
      viewsLast30: 150,
      radarSubscribers: 34,
      truncated: false,
    })
  })

  it('una métrica que falla da null y las otras siguen (error en events)', async () => {
    const { client } = makeClient({
      events: { count: null, error: { message: 'boom' } },
      radar: { count: 7 },
      viewsPages: [{ data: [{ views: 3 }], error: null }],
    })

    const metrics = await getAdvertiserMetrics(client, AHORA)
    expect(metrics.eventsLast30).toBeNull()
    expect(metrics.radarSubscribers).toBe(7)
    expect(metrics.viewsLast30).toBe(3)
  })

  it('una métrica que falla da null y las otras siguen (error en una página de vistas)', async () => {
    const { client } = makeClient({
      events: { count: 5 },
      radar: { count: 8 },
      viewsPages: [{ data: null, error: { message: 'boom de vistas' } }],
    })

    const metrics = await getAdvertiserMetrics(client, AHORA)
    expect(metrics.viewsLast30).toBeNull()
    expect(metrics.truncated).toBe(false)
    expect(metrics.eventsLast30).toBe(5)
    expect(metrics.radarSubscribers).toBe(8)
  })

  it('una métrica que falla da null y las otras siguen (error en radar)', async () => {
    const { client } = makeClient({
      events: { count: 5 },
      radar: { count: null, error: { message: 'boom de radar' } },
      viewsPages: [{ data: [{ views: 1 }], error: null }],
    })

    const metrics = await getAdvertiserMetrics(client, AHORA)
    expect(metrics.radarSubscribers).toBeNull()
    expect(metrics.eventsLast30).toBe(5)
    expect(metrics.viewsLast30).toBe(1)
  })
})
