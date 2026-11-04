// R-1 · La server action `sumarLugarChicos` (Q5-3) de punta a punta, con la
// base y los headers de mentira. Antes: las reglas puras (pedido.test.ts), un
// detector del orden en el fuente y el formulario con la acción como doble
// (dom/sumar-lugar.dom.test.ts); la acción en sí no corría en ningún test.
// Cada test importa la acción de nuevo (vi.resetModules): el límite por IP
// vive en memoria del módulo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  ip: '200.1.1.1',
  inserts: [] as { tabla: string; fila: Record<string, unknown> }[],
  resultado: { error: null } as { error: unknown } | 'tira',
  adminCreado: 0,
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': estado.ip }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => {
    throw new Error('la acción pública no usa la sesión')
  }),
  createAdminClient: () => {
    estado.adminCreado++
    return {
      from: (tabla: string) => ({
        insert: async (fila: Record<string, unknown>) => {
          estado.inserts.push({ tabla, fila })
          if (estado.resultado === 'tira') throw new Error(`se cayó con ${JSON.stringify(fila)}`)
          return estado.resultado
        },
      }),
    }
  },
}))

const AHORA = new Date('2026-11-03T18:00:00Z').getTime()

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData()
  const base: Record<string, string> = {
    iniciado: String(AHORA - 30_000),
    sitio: '',
    nombre: 'Plaza Güemes',
    direccion: 'Caseros y Zuviría',
    idioma: 'es',
  }
  for (const [k, v] of Object.entries({ ...base, ...campos })) fd.set(k, v)
  return fd
}

async function accion() {
  vi.resetModules()
  return (await import('@/lib/actions/sumar-lugar-chicos')).sumarLugarChicos
}

const INICIAL = { estado: 'inicial' } as const

let errores: ReturnType<typeof vi.spyOn>
let logs: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  estado.ip = '200.1.1.1'
  estado.inserts = []
  estado.resultado = { error: null }
  estado.adminCreado = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  errores = vi.spyOn(console, 'error').mockImplementation(() => {})
  logs = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('sumarLugarChicos: el pedido de una persona', () => {
  it('guarda el pedido limpio en lugares_chicos_pedidos, con el idioma, y contesta «enviado»', async () => {
    const sumar = await accion()
    const r = await sumar(
      INICIAL,
      formulario({
        nombre: '  Plaza   Güemes ',
        tipo: 'plaza_juegos',
        link: 'instagram.com/plazaguemes',
        contacto: 'persona@example.com',
        comentario: 'Tiene juegos nuevos',
        idioma: 'en',
      }),
    )
    expect(r).toEqual({ estado: 'enviado' })
    expect(estado.inserts).toEqual([
      {
        tabla: 'lugares_chicos_pedidos',
        fila: {
          nombre: 'Plaza Güemes',
          direccion: 'Caseros y Zuviría',
          tipo: 'plaza_juegos',
          comentario: 'Tiene juegos nuevos',
          link: 'https://instagram.com/plazaguemes',
          contacto: 'persona@example.com',
          idioma: 'en',
        },
      },
    ])
  })

  it('lo mínimo (nombre y dirección): lo opcional va en null; un idioma raro queda en «es»', async () => {
    const sumar = await accion()
    expect(await sumar(INICIAL, formulario({ idioma: 'fr' }))).toEqual({ estado: 'enviado' })
    expect(estado.inserts[0]!.fila).toEqual({
      nombre: 'Plaza Güemes',
      direccion: 'Caseros y Zuviría',
      tipo: null,
      comentario: null,
      link: null,
      contacto: null,
      idioma: 'es',
    })
  })

  it.each([
    ['nombre', { nombre: 'ab' }],
    ['direccion', { direccion: '' }],
    ['tipo', { tipo: 'casa_particular' }],
    ['link', { link: 'javascript:alert(1)' }],
    ['contacto', { contacto: 'abc' }],
    ['comentario', { comentario: 'x'.repeat(1001) }],
  ])('dato inválido → código «%s» y nada se guarda', async (codigo, campos) => {
    const sumar = await accion()
    expect(await sumar(INICIAL, formulario(campos))).toEqual({ estado: 'error', codigo })
    expect(estado.adminCreado).toBe(0)
  })
})

describe('sumarLugarChicos: anti-spam antes que todo', () => {
  it.each([
    ['honeypot con algo', { sitio: 'https://spam.example' }],
    ['enviado en menos de 4 segundos', { iniciado: String(AHORA - 1_000) }],
    ['sin la marca de inicio (un bot que no cargó la página)', { iniciado: '' }],
  ])('%s: «enviado» igual (no le enseñamos qué falló) y NO se guarda nada', async (_n, campos) => {
    const sumar = await accion()
    expect(await sumar(INICIAL, formulario(campos))).toEqual({ estado: 'enviado' })
    expect(estado.inserts).toEqual([])
    expect(estado.adminCreado).toBe(0)
  })

  it('un formulario de hace más de 2 horas: «vencido» (se pide recargar), sin guardar', async () => {
    const sumar = await accion()
    expect(await sumar(INICIAL, formulario({ iniciado: String(AHORA - 3 * 60 * 60 * 1000) }))).toEqual({ estado: 'error', codigo: 'vencido' })
    expect(estado.inserts).toEqual([])
  })

  it('un bot no gasta el cupo de la IP: después de 10 envíos del bot, la persona de esa IP pasa', async () => {
    const sumar = await accion()
    for (let i = 0; i < 10; i++) await sumar(INICIAL, formulario({ sitio: 'spam' }))
    expect(await sumar(INICIAL, formulario({}))).toEqual({ estado: 'enviado' })
    expect(estado.inserts).toHaveLength(1)
  })
})

describe('sumarLugarChicos: límite por IP', () => {
  it('5 pedidos por hora por IP; el 6.º es «limite» y no se guarda; otra IP pasa; a la hora se libera', async () => {
    const sumar = await accion()
    for (let i = 0; i < 5; i++) expect(await sumar(INICIAL, formulario({}))).toEqual({ estado: 'enviado' })
    expect(await sumar(INICIAL, formulario({}))).toEqual({ estado: 'error', codigo: 'limite' })
    expect(estado.inserts).toHaveLength(5)
    estado.ip = '200.2.2.2'
    expect(await sumar(INICIAL, formulario({}))).toEqual({ estado: 'enviado' })
    estado.ip = '200.1.1.1'
    vi.setSystemTime(AHORA + 60 * 60 * 1000 + 1)
    expect(await sumar(INICIAL, formulario({ iniciado: String(AHORA + 60 * 60 * 1000 - 30_000) }))).toEqual({ estado: 'enviado' })
  })

  it('los pedidos inválidos también gastan el cupo (el límite va antes de validar)', async () => {
    const sumar = await accion()
    for (let i = 0; i < 5; i++) await sumar(INICIAL, formulario({ nombre: '' }))
    expect(await sumar(INICIAL, formulario({}))).toEqual({ estado: 'error', codigo: 'limite' })
  })
})

describe('sumarLugarChicos: errores de la base', () => {
  it('la base devuelve error: «servidor» y el log lleva solo el código (nada de lo que escribió la persona)', async () => {
    estado.resultado = { error: { code: '23514', message: 'falló con persona@example.com' } }
    const sumar = await accion()
    expect(await sumar(INICIAL, formulario({ contacto: 'persona@example.com' }))).toEqual({ estado: 'error', codigo: 'servidor' })
    expect(errores).toHaveBeenCalledWith('[sumar-lugar-chicos] no se pudo guardar', '23514')
    const todo = JSON.stringify([...errores.mock.calls, ...logs.mock.calls])
    expect(todo).not.toContain('persona@example.com')
    expect(todo).not.toContain('Plaza')
    expect(todo).not.toContain('200.1.1.1')
  })

  it('el insert tira: «servidor», sin el error en el log', async () => {
    estado.resultado = 'tira'
    const sumar = await accion()
    expect(await sumar(INICIAL, formulario({ contacto: 'persona@example.com' }))).toEqual({ estado: 'error', codigo: 'servidor' })
    expect(errores).toHaveBeenCalledWith('[sumar-lugar-chicos] error inesperado')
    expect(JSON.stringify(errores.mock.calls)).not.toContain('persona@example.com')
  })
})
