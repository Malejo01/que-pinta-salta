// La vista de la ficha, con origen `app` (43-e). `registrarVistaEvento` se
// prueba de verdad, con un `fetch` doble (sin red). El hook (`useVistaEvento`)
// necesita React Native para montarse, y Vitest de `apps/mobile` corre con
// `environment: 'node'`, sin runner de RN (ver `vitest.config.ts`): se prueba
// con un detector estático sobre `app/evento/[id].tsx`, mismo patrón que
// `tests/portada-atajos.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { registrarVistaEvento } from '../lib/metricas'

const ID = '11111111-1111-4111-8111-111111111111'
const NO_UUID = 'no-es-un-uuid'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUTA_FICHA = join(MOBILE_ROOT, 'app', 'evento', '[id].tsx')

describe('registrarVistaEvento', () => {
  it('un solo POST a la vista, con el User-Agent de la app y el body { eventId, origin: "app" }', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })

    await registrarVistaEvento(ID, { fetch, version: '1.0.0' })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://www.quepintasalta.com.ar/api/metricas/vista')
    expect(init.method).toBe('POST')
    expect(init.headers['User-Agent']).toBe('QuePintaSaltaApp/1.0.0')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ eventId: ID, origin: 'app' }))
  })

  it('un id inválido no hace ningún fetch', async () => {
    const fetch = vi.fn()
    await registrarVistaEvento(NO_UUID, { fetch, version: '1.0.0' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('un fetch que rechaza no tira (se atrapa en silencio)', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('sin red'))
    await expect(registrarVistaEvento(ID, { fetch, version: '1.0.0' })).resolves.toBeUndefined()
  })

  it('sin version: igual manda el User-Agent (QuePintaSaltaApp/0)', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    await registrarVistaEvento(ID, { fetch })
    const [, init] = fetch.mock.calls[0]
    expect(init.headers['User-Agent']).toBe('QuePintaSaltaApp/0')
  })
})

describe('app/evento/[id].tsx: llama a useVistaEvento una sola vez, antes del primer return (detector estático)', () => {
  const contenido = readFileSync(RUTA_FICHA, 'utf8')

  it('el archivo se leyó (no está vacío) y sigue siendo la ficha del evento', () => {
    expect(contenido.length).toBeGreaterThan(500)
    expect(contenido).toMatch(/export default function EventoPorId\(\)/)
  })

  it('importa useVistaEvento de @/lib/metricas-hook', () => {
    expect(contenido).toMatch(/import\s*\{[^}]*\buseVistaEvento\b[^}]*\}\s*from\s*['"]@\/lib\/metricas-hook['"]/)
  })

  it('llama a useVistaEvento una sola vez en todo el archivo', () => {
    const llamadas = contenido.match(/\buseVistaEvento\(/g) ?? []
    expect(llamadas).toHaveLength(1)
  })

  it('la llamada a useVistaEvento está antes del primer "return" temprano del componente (if (!valido) { return <Redirect ...)', () => {
    const idxLlamada = contenido.indexOf('useVistaEvento(')
    // No confundir con el `if (!valido) return` (sin llaves) de dentro del
    // useEffect, de más arriba en el archivo: el return temprano real del
    // componente abre un bloque con llave.
    const idxPrimerReturn = contenido.indexOf('if (!valido) {')
    expect(idxLlamada).toBeGreaterThan(-1)
    expect(idxPrimerReturn).toBeGreaterThan(-1)
    expect(idxLlamada).toBeLessThan(idxPrimerReturn)
  })
})

describe('"Comprar tickets" depende de ticket_url, no de ticket_sources (detector estático)', () => {
  const contenido = readFileSync(RUTA_FICHA, 'utf8')

  it('no importa (ni menciona) ticketUrlsOf: se sacó, sin uso', () => {
    expect(contenido).not.toMatch(/\bticketUrlsOf\b/)
  })

  it('tieneTicket sale de evento.ticket_url, no de ticket_sources', () => {
    const idx = contenido.indexOf('const tieneTicket =')
    expect(idx).toBeGreaterThan(-1)
    const linea = contenido.slice(idx, contenido.indexOf('\n', idx))
    expect(linea).toMatch(/evento\.ticket_url/)
    expect(linea).not.toMatch(/ticket_sources/)
  })
})
