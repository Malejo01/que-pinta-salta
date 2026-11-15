import { describe, expect, it } from 'vitest'
import {
  DIAS_ENTRE_INTENTOS,
  INTERVALO_PROGRAMADO_MS,
  TOPE_PROGRAMADO_MAXIMO,
  TOPE_PROGRAMADO_POR_DEFECTO,
  topeProgramado,
  resultadoDeCorrida,
  sinIntentoReciente,
} from '@/lib/venues/geocodificacion/programado'
import { crearClienteNominatim } from '@/lib/venues/geocodificacion/nominatim'
import { consultasParaLugar } from '@/lib/venues/geocodificacion/consultas'

const AHORA = new Date('2026-11-03T09:30:00Z')

describe('reglas fijas de la corrida programada (política de Nominatim)', () => {
  it('menos de 4 pedidos por minuto (y nunca más de 1 por segundo), 20 lugares por defecto y hasta 30, 30 días', () => {
    expect(60_000 / INTERVALO_PROGRAMADO_MS).toBeLessThan(4)
    expect(INTERVALO_PROGRAMADO_MS).toBeGreaterThanOrEqual(1000)
    expect(TOPE_PROGRAMADO_POR_DEFECTO).toBe(20)
    expect(TOPE_PROGRAMADO_MAXIMO).toBe(30)
    expect(DIAS_ENTRE_INTENTOS).toBe(30)
  })

  it('Q7-2: el peor caso del tope máximo entra en el timeout del workflow (45 min)', () => {
    // 4 consultas por lugar como mucho (consultas.test.ts), sin contar reintentos.
    const peorCasoMs = TOPE_PROGRAMADO_MAXIMO * 4 * INTERVALO_PROGRAMADO_MS
    expect(peorCasoMs).toBeLessThan(45 * 60 * 1000)
  })

  it('Q7-2: topeProgramado lee GEOCODIFICACION_TOPE con piso 1 y techo 30', () => {
    expect(topeProgramado(undefined)).toBe(20)
    expect(topeProgramado(' 15 ')).toBe(15)
    expect(topeProgramado('31')).toBe(30)
    expect(topeProgramado('-3')).toBe(20)
    expect(topeProgramado('2.5')).toBe(20)
  })

  it('el cliente con ese intervalo espacia de verdad los pedidos (reloj falso)', async () => {
    let reloj = 0
    const inicios: number[] = []
    const cliente = crearClienteNominatim({
      fetch: (async () => {
        inicios.push(reloj)
        return new Response('[]', { status: 200 })
      }) as unknown as typeof fetch,
      ahora: () => reloj,
      esperar: async (ms) => {
        reloj += ms
      },
      intervaloMinMs: INTERVALO_PROGRAMADO_MS,
    })
    const [consulta] = consultasParaLugar({ nombre: 'Teatro Provincial', direccion: 'Zuviría 70' })
    await cliente.buscar(consulta)
    await cliente.buscar(consulta)
    await cliente.buscar(consulta)
    for (let i = 1; i < inicios.length; i++) expect(inicios[i] - inicios[i - 1]).toBeGreaterThanOrEqual(INTERVALO_PROGRAMADO_MS)
  })
})

describe('sinIntentoReciente', () => {
  it('deja afuera lo intentado hace menos de 30 días; entra lo nunca intentado o más viejo', () => {
    const lugares = [
      { id: 'nunca', geocode_intentado_at: null },
      { id: 'ayer', geocode_intentado_at: '2026-11-02T09:30:00Z' },
      { id: 'hace-29', geocode_intentado_at: '2026-10-05T09:30:00Z' },
      { id: 'hace-31', geocode_intentado_at: '2026-10-03T09:00:00Z' },
      { id: 'basura', geocode_intentado_at: 'no-es-fecha' },
    ]
    expect(sinIntentoReciente(lugares, AHORA).map((l) => l.id)).toEqual(['nunca', 'hace-31', 'basura'])
  })
})

describe('resultadoDeCorrida (job_runs)', () => {
  it('cuenta por estado y nunca lleva nombres ni ids', () => {
    const r = resultadoDeCorrida(
      [{ estado: 'guardado' }, { estado: 'para-revisar' }, { estado: 'sin-resultado' }, { estado: 'error' }],
      { candidatos: 4, bloqueado: false },
    )
    expect(r).toEqual({
      status: 'PARTIAL',
      items_processed: 4,
      items_failed: 1,
      details: { candidatos: 4, mirados: 4, guardados: 1, sugeridosPorEnlace: 0, paraRevisar: 1, sinResultado: 1, noSePiso: 0, errores: 1 },
    })
  })

  it('sin candidatos: SKIPPED; con 403 de Nominatim: FAILED', () => {
    expect(resultadoDeCorrida([], { candidatos: 0, bloqueado: false }).status).toBe('SKIPPED')
    expect(resultadoDeCorrida([], { candidatos: 3, bloqueado: true })).toMatchObject({ status: 'FAILED', details: { bloqueado: true } })
    expect(resultadoDeCorrida([{ estado: 'guardado' }], { candidatos: 1, bloqueado: false }).status).toBe('SUCCESS')
  })
})
