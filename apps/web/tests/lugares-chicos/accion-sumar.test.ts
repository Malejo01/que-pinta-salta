// Q6-7 · La server action de «Sumá un lugar para chicos» con dobles: el cupo
// de la base corta antes del insert, a la RPC no le llega la IP, y un bot o un
// formulario inválido no gastan cupo ni tocan la base.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, insert, from, cabeceras } = vi.hoisted(() => {
  const insert = vi.fn()
  const rpc = vi.fn()
  return { rpc, insert, from: vi.fn(() => ({ insert })), cabeceras: { valor: new Headers() } }
})
vi.mock('next/headers', () => ({ headers: async () => cabeceras.valor }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc, from }) }))

import { sumarLugarChicos } from '@/lib/actions/sumar-lugar-chicos'

let ipSiguiente = 0
function formulario(datos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(datos)) fd.set(k, v)
  return fd
}
const valido = () => formulario({ nombre: 'Plaza QA', direccion: 'Calle QA 1', iniciado: String(Date.now() - 30_000), sitio: '' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secreto-de-prueba-qa')
  // Una IP distinta por caso: el límite en memoria es del módulo y no se reinicia.
  ipSiguiente += 1
  cabeceras.valor = new Headers({ 'x-forwarded-for': `198.51.100.${ipSiguiente}` })
  insert.mockResolvedValue({ error: null })
  rpc.mockResolvedValue({ data: true, error: null })
})

describe('sumarLugarChicos', () => {
  it('con cupo: guarda, y a la RPC le llega un hash, no la IP', async () => {
    expect(await sumarLugarChicos({ estado: 'inicial' }, valido())).toEqual({ estado: 'enviado' })
    expect(rpc).toHaveBeenCalledTimes(1)
    const [, args] = rpc.mock.calls[0]!
    expect(args.p_clave).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(args)).not.toContain('198.51.100')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(insert.mock.calls[0])).not.toContain('198.51.100')
  })

  it('cupo agotado en la base: «límite» y no se guarda nada', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await sumarLugarChicos({ estado: 'inicial' }, valido())).toEqual({ estado: 'error', codigo: 'limite' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('la RPC falla (migración sin aplicar): el pedido se guarda igual', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    expect(await sumarLugarChicos({ estado: 'inicial' }, valido())).toEqual({ estado: 'enviado' })
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('un bot (honeypot) recibe «gracias» sin gastar cupo ni tocar la base', async () => {
    const fd = valido()
    fd.set('sitio', 'http://spam.example')
    expect(await sumarLugarChicos({ estado: 'inicial' }, fd)).toEqual({ estado: 'enviado' })
    expect(rpc).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('un pedido inválido no gasta cupo', async () => {
    const fd = valido()
    fd.set('nombre', 'ab')
    expect(await sumarLugarChicos({ estado: 'inicial' }, fd)).toEqual({ estado: 'error', codigo: 'nombre' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('el límite en memoria sigue: el 6.º pedido de la misma IP en la hora no llega a la base', async () => {
    for (let i = 0; i < 5; i++) expect(await sumarLugarChicos({ estado: 'inicial' }, valido())).toEqual({ estado: 'enviado' })
    expect(await sumarLugarChicos({ estado: 'inicial' }, valido())).toEqual({ estado: 'error', codigo: 'limite' })
    expect(rpc).toHaveBeenCalledTimes(5)
  })

  it('un error de la base no devuelve detalles: solo el código «servidor»', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    insert.mockResolvedValue({ error: { code: '23514', message: 'new row violates check constraint "lugares_chicos_pedidos_link_check"' } })
    expect(await sumarLugarChicos({ estado: 'inicial' }, valido())).toEqual({ estado: 'error', codigo: 'servidor' })
  })
})
