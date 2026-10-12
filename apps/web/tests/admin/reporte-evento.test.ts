import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildEventReport, getEventReport, type EventMetricRow } from '@/lib/admin/reporte-evento'

function fila(parcial: Partial<EventMetricRow>): EventMetricRow {
  return {
    day: '2026-08-01',
    origin: 'direct',
    featured: false,
    views: 0,
    clicks: 0,
    ...parcial,
  }
}

describe('buildEventReport', () => {
  it('sin filas: listas vacías y totales en 0', () => {
    const reporte = buildEventReport([])
    expect(reporte).toEqual({
      dias: [],
      totales: { views: 0, clicks: 0, ctr: null },
      porOrigen: [],
      desdeRadar: { views: 0, clicks: 0 },
      diasDestacado: 0,
    })
  })

  it('suma los orígenes por día', () => {
    const filas = [
      fila({ day: '2026-08-01', origin: 'direct', views: 10, clicks: 1 }),
      fila({ day: '2026-08-01', origin: 'radar', views: 5, clicks: 2 }),
      fila({ day: '2026-08-02', origin: 'direct', views: 3, clicks: 0 }),
    ]
    const reporte = buildEventReport(filas)

    expect(reporte.dias).toEqual([
      { day: '2026-08-01', views: 15, clicks: 3 },
      { day: '2026-08-02', views: 3, clicks: 0 },
    ])
    expect(reporte.totales).toEqual({ views: 18, clicks: 3, ctr: 16.7 })
  })

  it('rellena los huecos con 0', () => {
    const filas = [
      fila({ day: '2026-08-01', views: 1, clicks: 0 }),
      fila({ day: '2026-08-04', views: 2, clicks: 0 }),
    ]
    const reporte = buildEventReport(filas)
    expect(reporte.dias.map((d) => d.day)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
    expect(reporte.dias[1]).toEqual({ day: '2026-08-02', views: 0, clicks: 0 })
    expect(reporte.dias[2]).toEqual({ day: '2026-08-03', views: 0, clicks: 0 })
  })

  it('ordena por día aunque las filas lleguen desordenadas', () => {
    const filas = [
      fila({ day: '2026-08-03', views: 1, clicks: 0 }),
      fila({ day: '2026-08-01', views: 2, clicks: 0 }),
      fila({ day: '2026-08-02', views: 3, clicks: 0 }),
    ]
    const reporte = buildEventReport(filas)
    expect(reporte.dias.map((d) => d.day)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
  })

  it('CTR es null cuando no hubo vistas', () => {
    const filas = [fila({ views: 0, clicks: 0 })]
    const reporte = buildEventReport(filas)
    expect(reporte.totales.ctr).toBeNull()
  })

  it('CTR de 3/40 es 7,5%', () => {
    const filas = [fila({ views: 40, clicks: 3 })]
    const reporte = buildEventReport(filas)
    expect(reporte.totales.ctr).toBe(7.5)
  })

  it('desdeRadar solo cuenta origin = "radar"', () => {
    const filas = [
      fila({ origin: 'radar', views: 10, clicks: 1 }),
      fila({ origin: 'direct', views: 20, clicks: 2 }),
      fila({ origin: 'home', views: 30, clicks: 3 }),
    ]
    const reporte = buildEventReport(filas)
    expect(reporte.desdeRadar).toEqual({ views: 10, clicks: 1 })
  })

  it('diasDestacado cuenta días, no filas', () => {
    const filas = [
      fila({ day: '2026-08-01', origin: 'direct', featured: true, views: 1, clicks: 0 }),
      fila({ day: '2026-08-01', origin: 'radar', featured: true, views: 1, clicks: 0 }),
      fila({ day: '2026-08-02', origin: 'direct', featured: true, views: 1, clicks: 0 }),
      fila({ day: '2026-08-03', origin: 'direct', featured: false, views: 1, clicks: 0 }),
    ]
    const reporte = buildEventReport(filas)
    // Dos filas destacadas el mismo día (2026-08-01) cuentan como 1 día, más el 08-02: total 2.
    expect(reporte.diasDestacado).toBe(2)
  })

  it('porOrigen suma por origen, de mayor a menor vistas', () => {
    const filas = [
      fila({ origin: 'direct', views: 5, clicks: 1 }),
      fila({ origin: 'radar', views: 50, clicks: 5 }),
      fila({ origin: 'direct', views: 5, clicks: 1 }),
    ]
    const reporte = buildEventReport(filas)
    expect(reporte.porOrigen).toEqual([
      { origin: 'radar', views: 50, clicks: 5 },
      { origin: 'direct', views: 10, clicks: 2 },
    ])
  })
})

describe('getEventReport', () => {
  it('uuid inválido: no consulta la base', async () => {
    let seLlamoFrom = false
    const supabaseFalso = {
      from: () => {
        seLlamoFrom = true
        throw new Error('no debería llamarse con un uuid inválido')
      },
    } as unknown as SupabaseClient

    const resultado = await getEventReport(supabaseFalso, 'no-es-un-uuid')

    expect(resultado).toBeNull()
    expect(seLlamoFrom).toBe(false)
  })

  it('evento no encontrado: no consulta las métricas, devuelve null', async () => {
    const tablasConsultadas: string[] = []
    const supabaseFalso = {
      from: (table: string) => {
        tablasConsultadas.push(table)
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }
        }
        throw new Error('no debería consultar ' + table + ' si el evento no existe')
      },
    } as unknown as SupabaseClient

    const resultado = await getEventReport(supabaseFalso, '11111111-1111-4111-8111-111111111111')

    expect(resultado).toBeNull()
    expect(tablasConsultadas).toEqual(['events'])
  })

  it('camino feliz: trae el evento y arma el reporte con sus métricas', async () => {
    const eventoFalso = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Evento de Prueba',
      start_date: '2026-08-01T21:00:00-03:00',
      status: 'PUBLISHED',
      venue: { name: 'Venue de Prueba' },
    }
    const filasFalsas: EventMetricRow[] = [
      { day: '2026-08-01', origin: 'direct', featured: false, views: 10, clicks: 1 },
    ]
    const supabaseFalso = {
      from: (table: string) => {
        if (table === 'events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: eventoFalso, error: null }),
              }),
            }),
          }
        }
        if (table === 'event_metrics_daily') {
          return {
            select: () => ({
              eq: async () => ({ data: filasFalsas, error: null }),
            }),
          }
        }
        throw new Error('tabla inesperada: ' + table)
      },
    } as unknown as SupabaseClient

    const resultado = await getEventReport(supabaseFalso, eventoFalso.id)

    expect(resultado?.event).toEqual({
      id: eventoFalso.id,
      title: eventoFalso.title,
      start_date: eventoFalso.start_date,
      status: eventoFalso.status,
      venue: { name: 'Venue de Prueba' },
    })
    expect(resultado?.report.totales).toEqual({ views: 10, clicks: 1, ctr: 10 })
  })
})
