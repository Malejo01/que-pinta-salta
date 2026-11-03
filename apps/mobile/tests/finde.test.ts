// Q4-11: «Este finde pinta». Lógica pura + aplicación con dobles (sin teléfono).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-notifications', () => ({ SchedulableTriggerInputTypes: { DATE: 'date' } }))
vi.mock('@/lib/sin-conexion/almacen', () => ({ almacenPorDefecto: { leer: async () => null, escribir: async () => {}, borrar: async () => {} } }))

import { formatSaltaDayKey, saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { datosPushAvisoEquipo } from '@qps/core/notificaciones/equipo'
import { contarFinde, decidirFinde, proximoJueves18, textoFinde, type EventoParaFinde } from '../lib/finde/finde'
import { avisoDelEquipoDeHoy, CLAVE_DIA_AVISO_EQUIPO, CLAVE_FINDE, esAvisoDelEquipo, programarFinde, registrarAvisoDelEquipo, type ModuloNotificacionesFinde } from '../lib/finde'
import { CLAVE_AGENDA, VERSION_CACHE } from '../lib/sin-conexion/cache'
import type { Almacen } from '../lib/sin-conexion/almacen'

const RAIZ_APP = fileURLToPath(new URL('..', import.meta.url))

// Martes 3/11/2026, 10:00 de Salta. El jueves es el 5/11.
const MARTES = saltaWallClockToDate('2026-11-03T10:00:00')
const JUEVES_18 = saltaWallClockToDate('2026-11-05T18:00:00')

function plan(inicioSalta: string, gratis = false, categoria = 'penas'): EventoParaFinde {
  return { paraAtajo: { start_date: saltaWallClockToUtcISO(inicioSalta), category: categoria }, gratis }
}

const FINDE = [
  plan('2026-11-06T21:00:00', true), // viernes 21
  plan('2026-11-07T22:00:00'), // sábado
  plan('2026-11-08T11:00:00', true), // domingo
  plan('2026-11-06T10:00:00'), // viernes a la mañana: antes de las 19, no es finde
  plan('2026-11-09T21:00:00'), // lunes
  plan('2026-11-04T21:00:00'), // miércoles
]

describe('cuándo y qué (puro)', () => {
  it('el próximo jueves a las 18 (hoy, si es jueves antes de las 18)', () => {
    expect(proximoJueves18(MARTES).toISOString()).toBe(JUEVES_18.toISOString())
    expect(proximoJueves18(saltaWallClockToDate('2026-11-05T12:00:00')).toISOString()).toBe(JUEVES_18.toISOString())
    expect(proximoJueves18(saltaWallClockToDate('2026-11-05T18:30:00')).toISOString()).toBe(
      saltaWallClockToDate('2026-11-12T18:00:00').toISOString(),
    )
    expect(proximoJueves18(saltaWallClockToDate('2026-11-08T23:00:00')).toISOString()).toBe(
      saltaWallClockToDate('2026-11-12T18:00:00').toISOString(),
    )
  })

  it('cuenta los planes del finde con el mismo criterio que el atajo «Finde» (viernes 19 a domingo)', () => {
    expect(contarFinde(FINDE, JUEVES_18)).toEqual({ planes: 3, gratis: 2 })
  })

  it('el texto, en singular y sin «0 gratis»', () => {
    expect(textoFinde(12, 4)).toBe('Este finde pinta: 12 planes, 4 gratis')
    expect(textoFinde(1, 1)).toBe('Este finde pinta: 1 plan, 1 gratis')
    expect(textoFinde(5, 0)).toBe('Este finde pinta: 5 planes')
  })

  it('decide: programa con datos frescos y planes', () => {
    const d = decidirFinde({ ahora: MARTES, activo: true, eventos: FINDE, guardadoEn: MARTES, diaAvisoEquipo: null })
    expect(d).toMatchObject({ programar: true, titulo: 'Este finde pinta: 3 planes, 2 gratis' })
    if (d.programar) expect(d.cuando.toISOString()).toBe(JUEVES_18.toISOString())
  })

  it.each([
    ['apagado', { activo: false }],
    ['sin-datos-frescos', { guardadoEn: saltaWallClockToDate('2026-11-01T10:00:00') }],
    ['sin-datos-frescos', { eventos: null }],
    ['sin-planes', { eventos: [plan('2026-11-09T21:00:00')] }],
    ['aviso-del-equipo', { diaAvisoEquipo: '2026-11-05' }],
  ] as const)('no programa: %s', (motivo, cambio) => {
    const base = { ahora: MARTES, activo: true, eventos: FINDE as EventoParaFinde[] | null, guardadoEn: MARTES as Date | null, diaAvisoEquipo: null as string | null }
    const d = decidirFinde({ ...base, ...(cambio as Partial<typeof base>) })
    expect(d).toEqual({ programar: false, motivo })
  })

  it('un aviso del equipo de OTRO día no lo frena', () => {
    const d = decidirFinde({ ahora: MARTES, activo: true, eventos: FINDE, guardadoEn: MARTES, diaAvisoEquipo: '2026-11-03' })
    expect(d.programar).toBe(true)
  })
})

describe('el aviso del equipo se reconoce por { aviso: "equipo" }', () => {
  it('lo que manda el servidor (core) tiene la marca, en los tres destinos', () => {
    expect(esAvisoDelEquipo(datosPushAvisoEquipo({ tipo: 'cines' }))).toBe(true)
    expect(esAvisoDelEquipo(datosPushAvisoEquipo({ tipo: 'inicio' }))).toBe(true)
    expect(esAvisoDelEquipo({ tipo: 'patrocinado' })).toBe(false)
    expect(esAvisoDelEquipo(null)).toBe(false)
  })
})

describe('Q5-16 (nº17): el aviso del equipo de hoy, también el que se tocó con la app cerrada', () => {
  it('avisoDelEquipoDeHoy: marca y día de Salta', () => {
    const jueves1130 = Date.parse('2026-11-05T14:30:00Z') // jueves 5/11 11:30 en Salta
    expect(avisoDelEquipoDeHoy({ aviso: 'equipo' }, jueves1130, '2026-11-05')).toBe(true)
    expect(avisoDelEquipoDeHoy({ aviso: 'equipo' }, jueves1130, '2026-11-06')).toBe(false)
    expect(avisoDelEquipoDeHoy({ tipo: 'patrocinado' }, jueves1130, '2026-11-05')).toBe(false)
    expect(avisoDelEquipoDeHoy({ aviso: 'equipo' }, Number.NaN, '2026-11-05')).toBe(false)
  })

  it('el sincronizador mira la bandeja, la última notificación tocada y los toques', () => {
    const src = quitarComentarios(readFileSync(join(RAIZ_APP, 'components', 'SincronizadorFinde.tsx'), 'utf8'))
    expect(src).toContain('getPresentedNotificationsAsync()')
    expect(src).toContain('getLastNotificationResponseAsync()')
    expect(src).toMatch(/addNotificationResponseReceivedListener\(\(r\) => \{\s*if \(esAvisoDelEquipo\(r\.notification\.request\.content\.data\)\) void registrarAvisoDelEquipo/)
    expect(src).toContain('bajaToques.remove()')
  })
})

function dobles(opts: { permiso?: 'granted' | 'denied'; agenda?: unknown; guardadoEn?: Date; preferencia?: string; diaAviso?: string }) {
  const datos = new Map<string, string>()
  if (opts.agenda) datos.set(CLAVE_AGENDA, JSON.stringify({ v: VERSION_CACHE, guardadoEn: (opts.guardadoEn ?? MARTES).toISOString(), datos: opts.agenda }))
  if (opts.preferencia) datos.set(CLAVE_FINDE, opts.preferencia)
  if (opts.diaAviso) datos.set(CLAVE_DIA_AVISO_EQUIPO, opts.diaAviso)
  const almacen: Almacen = {
    leer: async (k) => datos.get(k) ?? null,
    escribir: async (k, v) => void datos.set(k, v),
    borrar: async (k) => void datos.delete(k),
    claves: async () => [...datos.keys()],
    borrarVarias: async (ks) => ks.forEach((k) => datos.delete(k)),
  }
  const programadas = new Map<string, { content: { title: string; data: unknown }; trigger: { date: Date } }>([['finde-pinta', {} as never]])
  const notificaciones = {
    getPermissionsAsync: vi.fn(async () => ({ status: opts.permiso ?? 'granted' })),
    cancelScheduledNotificationAsync: vi.fn(async (id: string) => void programadas.delete(id)),
    scheduleNotificationAsync: vi.fn(async (p: { identifier: string }) => {
      programadas.set(p.identifier, p as never)
      return p.identifier
    }),
  }
  return { deps: { almacen, notificaciones: notificaciones as unknown as ModuloNotificacionesFinde }, programadas, datos, notificaciones }
}

const AGENDA = {
  eventos: FINDE.map((e, i) => ({ evento: { id: `e${i}`, price: e.gratis ? 'gratis' : 1000 }, paraAtajo: e.paraAtajo, paraChicos: false })),
  categorias: [],
  peliculas: [],
}

describe('programarFinde (con dobles)', () => {
  it('con la agenda en caché fresca: programa un único aviso para el jueves 18:00', async () => {
    const d = dobles({ agenda: AGENDA })
    const r = await programarFinde(MARTES, d.deps)
    expect(r.programar).toBe(true)
    const pedido = d.programadas.get('finde-pinta')!
    expect(pedido.content.title).toBe('Este finde pinta: 3 planes, 2 gratis')
    expect(pedido.trigger.date.toISOString()).toBe(JUEVES_18.toISOString())
    expect(d.programadas.size).toBe(1)
  })

  it('sin caché o sin permiso o apagado: cancela el que había y no programa (nunca pide permiso)', async () => {
    for (const opts of [{}, { agenda: AGENDA, permiso: 'denied' as const }, { agenda: AGENDA, preferencia: '0' }]) {
      const d = dobles(opts)
      await programarFinde(MARTES, d.deps)
      expect(d.programadas.size).toBe(0)
      expect('requestPermissionsAsync' in d.notificaciones).toBe(false)
    }
  })

  it('llega el aviso del equipo el jueves: se anota y se cancela el del finde de ese día', async () => {
    const jueves = saltaWallClockToDate('2026-11-05T12:00:00')
    const d = dobles({ agenda: AGENDA, guardadoEn: jueves })
    await programarFinde(jueves, d.deps)
    expect(d.programadas.has('finde-pinta')).toBe(true)
    await registrarAvisoDelEquipo(jueves, d.deps)
    expect(d.datos.get(CLAVE_DIA_AVISO_EQUIPO)).toBe(formatSaltaDayKey(jueves))
    expect(d.programadas.has('finde-pinta')).toBe(false)
  })
})
