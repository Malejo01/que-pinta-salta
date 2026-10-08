import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// QPS-049c: cualquier falla de consulta a la base en /api/cron/health devuelve 503 con un
// texto FIJO ('Error consultando la base'), nunca el mensaje crudo de Postgres (que puede
// filtrar detalle interno). Este archivo cubre esa garantía para cada una de las consultas
// que participan del chequeo de salud (en el orden exacto del Promise.all de la ruta).

const createAdminClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { GET } from '@/app/api/cron/health/route'

const SECRETO = 'secreto-falso-de-prueba'
const entorno = process.env.CRON_SECRET

/**
 * Cliente falso que falla SOLO en la n-ésima llamada a `.from(...)` (0-based), en el mismo
 * orden en que la ruta las arma dentro del Promise.all: ticketeras(0), cines(1),
 * instagram-último(2), oldestPending(3), lastProcessed(4), job_last_runs(5), sinLugar(6),
 * sinLugarUrgente(7). Las demás devuelven datos vacíos/benignos (no importan: la ruta
 * corta apenas detecta el primer error de los índices 0,1,2,3,4,6,7).
 */
function clienteConFalla(indiceQueFalla: number, mensajeCrudo: string) {
  let contador = -1
  return {
    from: () => {
      contador++
      const esLaFalla = contador === indiceQueFalla
      const resultado = () => (esLaFalla ? { data: null, error: { message: mensajeCrudo } } : { data: null, error: null })
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'not', 'eq', 'gte', 'lte', 'is', 'order', 'limit', 'or']) {
        b[m] = () => b
      }
      b.maybeSingle = () => Promise.resolve(resultado())
      b.then = (res: (r: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(resultado()).then(res, rej)
      return b
    },
  }
}

const pedir = () =>
  GET(new Request('http://localhost.test/api/cron/health', { headers: { authorization: `Bearer ${SECRETO}` } }))

beforeEach(() => {
  createAdminClient.mockReset()
  process.env.CRON_SECRET = SECRETO
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  if (entorno === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entorno
})

const CASOS: Array<[nombre: string, indice: number]> = [
  ['ticketeras (último updated_at)', 0],
  ['cines (cinema_movies)', 1],
  ['instagram (último fetched_at)', 2],
  ['cola de IA (flyer pendiente más viejo)', 3],
  ['último flyer procesado', 4],
  ['eventos_sin_lugar (consulta general)', 6],
  ['eventos_sin_lugar (consulta urgente)', 7],
]

describe('GET /api/cron/health: 503 con texto fijo, sin filtrar el mensaje crudo de la base', () => {
  for (const [nombre, indice] of CASOS) {
    it(`falla en ${nombre}: 503, ok=false, error fijo y el mensaje crudo no aparece en la respuesta`, async () => {
      const mensajeCrudo = `constraint violation interna #${indice}: duplicate key value violates unique constraint "events_pkey"`
      createAdminClient.mockReturnValue(clienteConFalla(indice, mensajeCrudo))
      const res = await pedir()
      const body = await res.json()

      expect(res.status).toBe(503)
      expect(body.ok).toBe(false)
      expect(body.error).toBe('Error consultando la base')
      expect(JSON.stringify(body)).not.toContain(mensajeCrudo)
      expect(JSON.stringify(body)).not.toContain('events_pkey')
    })
  }

  it('job_last_runs fallando SOLO (índice 5) no entra en el chequeo de error de base (se tolera)', async () => {
    createAdminClient.mockReturnValue(clienteConFalla(5, 'no debería importar'))
    const res = await pedir()
    const body = await res.json()
    // Sin "error" de nivel superior: la ruta tomó el camino normal (checks), no el de
    // falla temprana de base, que es el único que agrega { ok:false, error: '...' }.
    expect(body.error).toBeUndefined()
    expect(Array.isArray(body.checks)).toBe(true)
  })
})
