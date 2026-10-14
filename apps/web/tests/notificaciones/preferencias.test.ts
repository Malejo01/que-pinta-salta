/**
 * `notificaciones/preferencias.ts` (R27, tarea 27-a): canal del Radar,
 * interruptores y horario de silencio de la app. Sin React, sin Supabase,
 * sin red.
 *
 * `PREFERENCIAS_POR_DEFECTO` se compara contra los defaults reales de la
 * migración de la R23 (`supabase/migrations/20261013120000_app_notificaciones.sql`),
 * leída del disco: si alguno de los dos cambia sin el otro, este test lo
 * detecta.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CANALES_RADAR,
  PREFERENCIAS_POR_DEFECTO,
  validarPreferenciasNotificacion,
  type PreferenciasNotificacionEntrada,
} from '@qps/core/notificaciones/preferencias'

function base(overrides: Partial<Record<keyof PreferenciasNotificacionEntrada, unknown>> = {}) {
  return {
    radar_channel: 'email',
    favorite_reminders: true,
    follow_news: true,
    announcements: false,
    quiet_start: '23:00',
    quiet_end: '09:00',
    ...overrides,
  }
}

describe('CANALES_RADAR', () => {
  it('son exactamente estos 3', () => {
    expect(CANALES_RADAR).toEqual(['email', 'push', 'ambos'])
  })
})

describe('validarPreferenciasNotificacion: radar_channel', () => {
  it.each(CANALES_RADAR)('acepta el canal válido "%s"', (canal) => {
    const result = validarPreferenciasNotificacion(base({ radar_channel: canal }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.datos.radar_channel).toBe(canal)
  })

  it('rechaza un canal inventado ("sms")', () => {
    const result = validarPreferenciasNotificacion(base({ radar_channel: 'sms' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/canal/i)
  })

  it('rechaza radar_channel ausente', () => {
    const { radar_channel, ...sinCanal } = base()
    expect(validarPreferenciasNotificacion(sinCanal).ok).toBe(false)
  })
})

describe('validarPreferenciasNotificacion: booleanos', () => {
  it('favorite_reminders no booleano da error', () => {
    expect(validarPreferenciasNotificacion(base({ favorite_reminders: 'si' })).ok).toBe(false)
  })
  it('follow_news no booleano da error', () => {
    expect(validarPreferenciasNotificacion(base({ follow_news: 1 })).ok).toBe(false)
  })
  it('announcements no booleano (null) da error', () => {
    expect(validarPreferenciasNotificacion(base({ announcements: null })).ok).toBe(false)
  })
})

describe('validarPreferenciasNotificacion: horario de silencio (HH:MM)', () => {
  it.each(['24:00', '9:00', '09:60', ''])('quiet_start inválido: "%s"', (hora) => {
    expect(validarPreferenciasNotificacion(base({ quiet_start: hora })).ok).toBe(false)
  })

  it.each(['24:00', '9:00', '09:60', ''])('quiet_end inválido: "%s"', (hora) => {
    expect(validarPreferenciasNotificacion(base({ quiet_end: hora })).ok).toBe(false)
  })

  it.each(['00:00', '23:59'])('quiet_start límite válido: "%s"', (hora) => {
    expect(validarPreferenciasNotificacion(base({ quiet_start: hora })).ok).toBe(true)
  })

  it.each(['00:00', '23:59'])('quiet_end límite válido: "%s"', (hora) => {
    expect(validarPreferenciasNotificacion(base({ quiet_end: hora })).ok).toBe(true)
  })

  it('hora que no es string (número) da error, sin romper', () => {
    expect(validarPreferenciasNotificacion(base({ quiet_start: 900 })).ok).toBe(false)
  })
})

describe('validarPreferenciasNotificacion: resultado', () => {
  it('con datos válidos, devuelve exactamente esos datos, sin daily_cap (no se edita)', () => {
    const datos = base()
    const result = validarPreferenciasNotificacion(datos)
    expect(result).toEqual({ ok: true, datos })
    if (result.ok) expect('daily_cap' in result.datos).toBe(false)
  })

  it('con datos inválidos, el resultado no tiene campo "datos"', () => {
    const result = validarPreferenciasNotificacion(base({ radar_channel: 'sms' }))
    expect(result.ok).toBe(false)
    expect('datos' in result).toBe(false)
  })
})

describe('PREFERENCIAS_POR_DEFECTO === defaults de la migración de la R23', () => {
  const MIGRATION_PATH = new URL(
    '../../../../supabase/migrations/20261013120000_app_notificaciones.sql',
    import.meta.url,
  )
  const sql = readFileSync(MIGRATION_PATH, 'utf8')

  function extractDefault(columna: string): string {
    const re = new RegExp(`${columna}\\s+\\S+\\s+not\\s+null\\s+default\\s+([^,\\n]+)`, 'i')
    const m = re.exec(sql)
    if (!m) throw new Error(`No se encontró el default de "${columna}" en la migración`)
    return m[1].trim()
  }

  it('radar_channel: \'email\'', () => {
    expect(extractDefault('radar_channel')).toBe(`'${PREFERENCIAS_POR_DEFECTO.radar_channel}'`)
  })
  it('favorite_reminders: true', () => {
    expect(extractDefault('favorite_reminders')).toBe(String(PREFERENCIAS_POR_DEFECTO.favorite_reminders))
  })
  it('follow_news: true', () => {
    expect(extractDefault('follow_news')).toBe(String(PREFERENCIAS_POR_DEFECTO.follow_news))
  })
  it('announcements: false', () => {
    expect(extractDefault('announcements')).toBe(String(PREFERENCIAS_POR_DEFECTO.announcements))
  })
  it('quiet_start: \'23:00\'', () => {
    expect(extractDefault('quiet_start')).toBe(`'${PREFERENCIAS_POR_DEFECTO.quiet_start}'`)
  })
  it('quiet_end: \'09:00\'', () => {
    expect(extractDefault('quiet_end')).toBe(`'${PREFERENCIAS_POR_DEFECTO.quiet_end}'`)
  })
  it('daily_cap: 4', () => {
    expect(extractDefault('daily_cap')).toBe(String(PREFERENCIAS_POR_DEFECTO.daily_cap))
  })

  it('PREFERENCIAS_POR_DEFECTO pasa su propio validador (sin daily_cap)', () => {
    const { daily_cap, ...entrada } = PREFERENCIAS_POR_DEFECTO
    expect(validarPreferenciasNotificacion(entrada).ok).toBe(true)
  })
})
