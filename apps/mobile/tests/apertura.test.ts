// Q5-13 · «La app se abrió hoy»: una vez por día de Salta, con un id de
// métricas propio (no el device_id del push), y sin reintentos.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { CLAVE_DIA_APERTURA, CLAVE_ID_METRICAS, URL_APERTURA, avisarApertura, nuevoIdMetricas } from '../lib/apertura'
import type { Almacen } from '../lib/sin-conexion/almacen'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial))
  const a: Almacen = {
    leer: async (k) => datos.get(k) ?? null,
    escribir: async (k, v) => void datos.set(k, v),
    borrar: async (k) => void datos.delete(k),
    claves: async () => [...datos.keys()],
    borrarVarias: async (ks) => ks.forEach((k) => datos.delete(k)),
  }
  return { a, datos }
}

const MARTES = saltaWallClockToDate('2026-11-03T10:00:00')

describe('avisarApertura', () => {
  it('la primera vez del día: genera el id, lo guarda en el teléfono y avisa con el User-Agent de la app', async () => {
    const { a, datos } = almacen()
    const fetchDoble = vi.fn(async () => new Response('{}', { status: 200 }))
    const r = await avisarApertura({ almacen: a, fetch: fetchDoble as unknown as typeof fetch, ahora: MARTES, plataforma: 'android', version: '1.0.8', conCuenta: true })
    expect(r).toBe('enviada')
    expect(datos.get(CLAVE_ID_METRICAS)).toMatch(/^[0-9a-f]{32}$/)
    expect(datos.get(CLAVE_DIA_APERTURA)).toBe('2026-11-03')
    const [url, init] = fetchDoble.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(URL_APERTURA)
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^QuePintaSaltaApp\//)
    expect(JSON.parse(String(init.body))).toEqual({ idMetricas: datos.get(CLAVE_ID_METRICAS), plataforma: 'android', version: '1.0.8', conCuenta: true })
  })
  it('el mismo día no vuelve a avisar', async () => {
    const { a } = almacen({ [CLAVE_DIA_APERTURA]: '2026-11-03', [CLAVE_ID_METRICAS]: 'a'.repeat(32) })
    const fetchDoble = vi.fn()
    expect(await avisarApertura({ almacen: a, fetch: fetchDoble as unknown as typeof fetch, ahora: MARTES, plataforma: 'android', version: null, conCuenta: false })).toBe('ya-se-mando-hoy')
    expect(fetchDoble).not.toHaveBeenCalled()
  })
  it('si falla, no marca el día (prueba de nuevo al volver al frente) y nunca tira', async () => {
    const { a, datos } = almacen()
    const fetchFalla = vi.fn(async () => {
      throw new Error('sin red')
    })
    expect(await avisarApertura({ almacen: a, fetch: fetchFalla as unknown as typeof fetch, ahora: MARTES, plataforma: 'android', version: null, conCuenta: false })).toBe('fallo')
    expect(datos.has(CLAVE_DIA_APERTURA)).toBe(false)
  })
  it('el id de métricas es aleatorio y de 32 hex', () => {
    expect(nuevoIdMetricas(() => 0.5)).toBe('8'.repeat(32))
    expect(nuevoIdMetricas()).toMatch(/^[0-9a-f]{32}$/)
  })
  it('no usa el device_id del push ni nada de la cuenta', () => {
    const s = readFileSync(join(RAIZ, 'lib', 'apertura.ts'), 'utf8')
    expect(s).not.toMatch(/CLAVE_DEVICE_ID|push-device-id|user\.id|email/)
    expect(readFileSync(join(RAIZ, 'app', '_layout.tsx'), 'utf8')).toContain('<SincronizadorApertura />')
  })
})
