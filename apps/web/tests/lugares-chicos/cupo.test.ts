// Q6-7 · Cupo diario de «Sumá un lugar para chicos» en la base: la clave (HMAC
// de la IP con el día, nunca la IP) y qué hace la server action con la RPC.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MAX_PEDIDOS_POR_CLAVE_DIA, MAX_PEDIDOS_POR_DIA, claveDeCupo, tomarCupoPedido } from '@/lib/lugares-chicos/cupo'

const MEDIODIA = new Date('2026-11-04T15:00:00Z') // 12:00 en Salta
const IP = '203.0.113.7' // rango de documentación (RFC 5737)

describe('claveDeCupo', () => {
  it('64 hex (lo que acepta el check de la base) y sin la IP adentro', () => {
    const clave = claveDeCupo(IP, MEDIODIA, 'secreto-qa')
    expect(clave).toMatch(/^[0-9a-f]{64}$/)
    expect(clave).not.toContain('203')
  })
  it('la misma IP el mismo día de Salta da la misma clave; otro día, otra', () => {
    const a = claveDeCupo(IP, MEDIODIA, 'secreto-qa')
    expect(claveDeCupo(IP, new Date('2026-11-05T02:59:00Z'), 'secreto-qa')).toBe(a) // 23:59 en Salta, mismo día
    expect(claveDeCupo(IP, new Date('2026-11-05T03:00:00Z'), 'secreto-qa')).not.toBe(a) // 00:00 del 5/11
  })
  it('otra IP u otro secreto, otra clave (sin el secreto no se puede recorrer el espacio de IPs)', () => {
    const a = claveDeCupo(IP, MEDIODIA, 'secreto-qa')
    expect(claveDeCupo('203.0.113.8', MEDIODIA, 'secreto-qa')).not.toBe(a)
    expect(claveDeCupo(IP, MEDIODIA, 'otro-secreto')).not.toBe(a)
  })
})

describe('tomarCupoPedido', () => {
  const clave = 'a'.repeat(64)
  it('manda la clave y los topes a la RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    expect(await tomarCupoPedido({ rpc }, clave)).toBe('ok')
    expect(rpc).toHaveBeenCalledWith('tomar_cupo_pedido_lugar_chicos', {
      p_clave: clave,
      p_max_por_clave: MAX_PEDIDOS_POR_CLAVE_DIA,
      p_max_por_dia: MAX_PEDIDOS_POR_DIA,
    })
  })
  it('la base dice que no: agotado', async () => {
    expect(await tomarCupoPedido({ rpc: vi.fn().mockResolvedValue({ data: false, error: null }) }, clave)).toBe('agotado')
  })
  it('la RPC falla o tira (migración sin aplicar): el pedido sigue, y solo se loguea el código', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await tomarCupoPedido({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }) }, clave)).toBe('ok')
    expect(await tomarCupoPedido({ rpc: vi.fn().mockRejectedValue(new Error('red')) }, clave)).toBe('ok')
    for (const llamada of espia.mock.calls) expect(llamada.join(' ')).not.toContain(clave)
    expect(espia.mock.calls[0]).toContain('PGRST202')
    espia.mockRestore()
  })
})

describe('detector: la IP no viaja a la base', () => {
  const accion = readFileSync(join(process.cwd(), 'lib', 'actions', 'sumar-lugar-chicos.ts'), 'utf8')
  const migracion = readFileSync(join(process.cwd(), '..', '..', 'supabase', 'migrations', '20261104020000_q6_revision_q5.sql'), 'utf8')
  it('la acción pasa claveDeCupo(ip, …) a la RPC, nunca la ip suelta', () => {
    expect(accion).toMatch(/tomarCupoPedido\(admin, claveDeCupo\(ip, new Date\(\), secreto\)\)/)
    expect(accion).not.toMatch(/insert\(\{[^}]*\bip\b/)
  })
  it('la función de la base es solo de service_role y rechaza lo que no es un hash', () => {
    expect(migracion).toMatch(/grant execute on function public\.tomar_cupo_pedido_lugar_chicos\(text, integer, integer\) to service_role;/)
    expect(migracion).toMatch(/revoke all on function public\.tomar_cupo_pedido_lugar_chicos\(text, integer, integer\) from public, anon, authenticated;/)
    expect(migracion).toContain("p_clave !~ '^[0-9a-f]{64}$'")
  })
})
