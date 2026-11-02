// Q4-10: recordatorios locales de lo guardado. Sin teléfono: la lógica de
// programación es pura y la parte con efectos se prueba con dobles inyectados
// (notificaciones y almacén en memoria).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-notifications', () => ({ SchedulableTriggerInputTypes: { DATE: 'date' } }))
vi.mock('@/lib/sin-conexion/almacen', () => ({ almacenPorDefecto: { leer: async () => null, escribir: async () => {}, borrar: async () => {} } }))

import type { DisplayEvent } from '@qps/core/home/types'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import {
  diaAnterior,
  momentoDelRecordatorio,
  planificarRecordatorios,
  recordatoriosActivos,
  textoDelRecordatorio,
  MAX_RECORDATORIOS,
} from '../lib/recordatorios/programacion'
import { CLAVE_RECORDATORIOS, sincronizarRecordatorios, type DependenciasRecordatorios, type ModuloNotificacionesLocales } from '../lib/recordatorios'
import type { Almacen } from '../lib/sin-conexion/almacen'
import { avisarCambioGuardados, suscribirCambiosGuardados } from '../lib/recordatorios/cambios'

const AHORA = saltaWallClockToDate('2026-11-05T10:00:00')

function evento(id: string, inicioSalta: string, extra: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id,
    slug: id,
    title: `Peña ${id}`,
    venue: 'La Casona',
    date: inicioSalta.slice(0, 10),
    time: inicioSalta.slice(11, 16),
    category: 'penas',
    categoryName: 'Peñas',
    price: 'gratis',
    image: '',
    description: '',
    address: '',
    startDateTime: saltaWallClockToUtcISO(inicioSalta),
    isFeatured: false,
    status: 'PUBLISHED',
    ...extra,
  }
}

describe('programación (pura)', () => {
  it('día anterior en el calendario (fin de mes y de año)', () => {
    expect(diaAnterior('2026-11-07')).toBe('2026-11-06')
    expect(diaAnterior('2026-12-01')).toBe('2026-11-30')
    expect(diaAnterior('2027-01-01')).toBe('2026-12-31')
  })

  it('a las 18:00 de Salta del día anterior, aunque el evento sea de madrugada', () => {
    expect(momentoDelRecordatorio(saltaWallClockToUtcISO('2026-11-07T21:30:00')).toISOString()).toBe(
      saltaWallClockToDate('2026-11-06T18:00:00').toISOString(),
    )
    // 00:30 del sábado → el día del evento es el sábado → aviso el viernes 18:00.
    expect(momentoDelRecordatorio(saltaWallClockToUtcISO('2026-11-07T00:30:00')).toISOString()).toBe(
      saltaWallClockToDate('2026-11-06T18:00:00').toISOString(),
    )
  })

  it('el texto: «Mañana: <evento> a las <hora>», o sin hora', () => {
    expect(textoDelRecordatorio(' Peña de los viernes ', '21:30')).toBe('Mañana: Peña de los viernes a las 21:30')
    expect(textoDelRecordatorio('Feria', '')).toBe('Mañana: Feria')
  })

  it('planifica solo eventos publicados, futuros y con el aviso todavía por delante', () => {
    const plan = planificarRecordatorios(
      [
        evento('a', '2026-11-07T21:30:00'),
        evento('a', '2026-11-07T21:30:00'), // repetido (Voy + guardado)
        evento('hoy', '2026-11-05T21:00:00'), // el aviso era ayer a las 18
        evento('manana', '2026-11-06T21:00:00'), // aviso hoy 18:00: todavía no pasó
        evento('cancelado', '2026-11-08T21:00:00', { status: 'CANCELLED' }),
        evento('movie-x', '2026-11-08T21:00:00', { isCinemaMovie: true }),
        evento('ig-x', '2026-11-08T21:00:00', { isInstagramFlyer: true }),
        evento('pasado', '2026-11-01T21:00:00'),
      ],
      AHORA,
    )
    expect(plan.map((p) => p.eventId)).toEqual(['manana', 'a'])
    expect(plan[1]).toMatchObject({
      identificador: 'recordatorio-guardado:a',
      titulo: 'Mañana: Peña a a las 21:30',
      cuerpo: 'La Casona',
    })
  })

  it('no programa más de MAX_RECORDATORIOS', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => evento(`e${i}`, `2026-11-${String(10 + (i % 15)).padStart(2, '0')}T21:00:00`))
    expect(planificarRecordatorios(muchos, AHORA)).toHaveLength(MAX_RECORDATORIOS)
  })

  it('activos: sin permiso nunca; con permiso, prendido salvo que la persona los apague', () => {
    expect(recordatoriosActivos(null, false)).toBe(false)
    expect(recordatoriosActivos('1', false)).toBe(false)
    expect(recordatoriosActivos(null, true)).toBe(true)
    expect(recordatoriosActivos('0', true)).toBe(false)
    expect(recordatoriosActivos('1', true)).toBe(true)
  })
})

function dobles(opts: { permiso: 'granted' | 'denied'; preferencia?: string | null; yaProgramadas?: string[] }) {
  const programadas = new Map<string, unknown>((opts.yaProgramadas ?? []).map((id) => [id, {}]))
  const llamadas: string[] = []
  const notificaciones = {
    getPermissionsAsync: vi.fn(async () => {
      llamadas.push('getPermissions')
      return { status: opts.permiso }
    }),
    getAllScheduledNotificationsAsync: vi.fn(async () => [...programadas.keys()].map((identifier) => ({ identifier }))),
    cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
      programadas.delete(id)
    }),
    scheduleNotificationAsync: vi.fn(async (pedido: { identifier: string }) => {
      programadas.set(pedido.identifier, pedido)
      return pedido.identifier
    }),
  }
  const almacen = {
    leer: vi.fn(async (clave: string) => (clave === CLAVE_RECORDATORIOS ? (opts.preferencia ?? null) : null)),
    escribir: vi.fn(async () => {}),
    borrar: vi.fn(async () => {}),
  }
  const deps: DependenciasRecordatorios = { notificaciones: notificaciones as unknown as ModuloNotificacionesLocales, almacen: almacen as unknown as Almacen }
  return { deps, programadas, llamadas, raw: notificaciones }
}

describe('sincronizarRecordatorios (con dobles)', () => {
  it('con permiso: programa los del plan con data { eventId, tipo } y fecha', async () => {
    const d = dobles({ permiso: 'granted' })
    const r = await sincronizarRecordatorios([evento('a', '2026-11-07T21:30:00')], AHORA, d.deps)
    expect(r).toEqual({ activos: true, programados: 1, cancelados: 0 })
    const pedido = d.programadas.get('recordatorio-guardado:a') as {
      content: { title: string; data: Record<string, unknown> }
      trigger: { type: string; date: Date }
    }
    expect(pedido.content.title).toBe('Mañana: Peña a a las 21:30')
    expect(pedido.content.data).toEqual({ eventId: 'a', tipo: 'recordatorio-guardado' })
    expect(pedido.trigger.type).toBe('date')
  })

  it('lo que se sacó de guardados se cancela; las notificaciones ajenas no se tocan', async () => {
    const d = dobles({ permiso: 'granted', yaProgramadas: ['recordatorio-guardado:viejo', 'otra-cosa'] })
    await sincronizarRecordatorios([evento('a', '2026-11-07T21:30:00')], AHORA, d.deps)
    expect([...d.programadas.keys()].sort()).toEqual(['otra-cosa', 'recordatorio-guardado:a'])
  })

  it('sin permiso: no programa nada, cancela lo nuestro y NUNCA pide el permiso', async () => {
    const d = dobles({ permiso: 'denied', yaProgramadas: ['recordatorio-guardado:a'] })
    const r = await sincronizarRecordatorios([evento('a', '2026-11-07T21:30:00')], AHORA, d.deps)
    expect(r.programados).toBe(0)
    expect(d.programadas.size).toBe(0)
    expect('requestPermissionsAsync' in d.raw).toBe(false)
  })

  it('apagado en Cuenta: cancela y no programa', async () => {
    const d = dobles({ permiso: 'granted', preferencia: '0', yaProgramadas: ['recordatorio-guardado:a'] })
    const r = await sincronizarRecordatorios([evento('a', '2026-11-07T21:30:00')], AHORA, d.deps)
    expect(r).toEqual({ activos: false, programados: 0, cancelados: 1 })
  })

  it('sin sesión (lista vacía): cancela todo lo nuestro', async () => {
    const d = dobles({ permiso: 'granted', yaProgramadas: ['recordatorio-guardado:a', 'recordatorio-guardado:b'] })
    await sincronizarRecordatorios([], AHORA, d.deps)
    expect(d.programadas.size).toBe(0)
  })
})

describe('el aviso de cambios y el cableado', () => {
  it('avisarCambioGuardados llama a los oyentes, y uno roto no frena al resto', () => {
    const a = vi.fn()
    const baja1 = suscribirCambiosGuardados(() => {
      throw new Error('roto')
    })
    const baja2 = suscribirCambiosGuardados(a)
    avisarCambioGuardados()
    expect(a).toHaveBeenCalledTimes(1)
    baja1()
    baja2()
  })

  it('Guardar, sacar de guardados y Voy avisan el cambio (en el camino de éxito)', () => {
    const fav = readFileSync(join(__dirname, '../lib/favoritos.ts'), 'utf8')
    expect(fav.match(/avisarCambioGuardados\(\)/g)).toHaveLength(2)
    const asis = readFileSync(join(__dirname, '../lib/asistencia.ts'), 'utf8')
    expect(asis).toMatch(/avisarCambioGuardados\(\)\s*\n\s*return \{ tipo: 'ok'/)
  })

  it('el sincronizador está montado en el layout y el interruptor en Cuenta', () => {
    expect(readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8')).toMatch(/<SincronizadorRecordatorios \/>/)
    expect(readFileSync(join(__dirname, '../app/(tabs)/cuenta.tsx'), 'utf8')).toMatch(/<InterruptorRecordatorios \/>/)
  })

  it('el código de recordatorios nunca pide el permiso por su cuenta (solo el interruptor, con activar())', () => {
    for (const archivo of ['../lib/recordatorios/index.ts', '../lib/recordatorios/programacion.ts', '../components/SincronizadorRecordatorios.tsx']) {
      expect(readFileSync(join(__dirname, archivo), 'utf8')).not.toMatch(/requestPermissionsAsync|activar\(/)
    }
  })
})
