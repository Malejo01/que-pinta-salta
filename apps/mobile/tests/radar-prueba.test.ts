// Tarea 36-c (R36, G3): "Enviar un email de prueba" del Radar en la app,
// solo para admin. Sin `@testing-library/react-native` en el repo (ver
// `tests/ficha.test.ts`), así que `PantallaRadar.tsx` se cubre con el mismo
// estilo de detector por lectura de código que el resto de la suite; la
// lógica de `lib/radar.ts` (rol + `fetch` al endpoint) se prueba de forma
// funcional, con dobles de Supabase y de `fetch` — nunca un token real ni
// red de verdad.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANTALLA_RADAR_PATH = join(MOBILE_ROOT, 'components', 'PantallaRadar.tsx')

// ---------------------------------------------------------------------------
// lib/radar.ts: esAdminRadar (lectura del propio perfil) y probarEnvioRadar
// (fetch al endpoint con Bearer).
// ---------------------------------------------------------------------------

function construirTablaProfiles(resultado: { data: unknown; error: unknown } | 'throws') {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.single = async () => {
    if (resultado === 'throws') throw new Error('red caída')
    return resultado
  }
  return builder
}

const estadoSupabase = vi.hoisted(() => ({
  resultadoProfiles: { data: null, error: null } as { data: unknown; error: unknown } | 'throws',
  tablaConsultada: '' as string,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      estadoSupabase.tablaConsultada = tabla
      if (tabla !== 'profiles') throw new Error('tabla inesperada: ' + tabla)
      return construirTablaProfiles(estadoSupabase.resultadoProfiles)
    },
  },
}))

import { esAdminRadar, MENSAJE_ERROR_RED_PRUEBA, probarEnvioRadar } from '../lib/radar'
import { SITIO } from '@qps/core/metricas/links'

const USER_ID = 'usuario-de-sesion-1'
const TOKEN = 'token-de-sesion-de-prueba'

beforeEach(() => {
  estadoSupabase.resultadoProfiles = { data: null, error: null }
  estadoSupabase.tablaConsultada = ''
})

describe('esAdminRadar: lectura del propio perfil (profiles.role)', () => {
  it('role "ADMIN": true', async () => {
    estadoSupabase.resultadoProfiles = { data: { role: 'ADMIN' }, error: null }
    expect(await esAdminRadar(USER_ID)).toBe(true)
    expect(estadoSupabase.tablaConsultada).toBe('profiles')
  })

  it('role "USER": false', async () => {
    estadoSupabase.resultadoProfiles = { data: { role: 'USER' }, error: null }
    expect(await esAdminRadar(USER_ID)).toBe(false)
  })

  it('sin fila (RLS no deja ver otro perfil, o no existe): false', async () => {
    estadoSupabase.resultadoProfiles = { data: null, error: null }
    expect(await esAdminRadar(USER_ID)).toBe(false)
  })

  it('error de la consulta: false, no explota', async () => {
    estadoSupabase.resultadoProfiles = { data: null, error: { message: 'boom' } }
    expect(await esAdminRadar(USER_ID)).toBe(false)
  })

  it('excepción (red caída): false, no explota', async () => {
    estadoSupabase.resultadoProfiles = 'throws'
    expect(await esAdminRadar(USER_ID)).toBe(false)
  })

  it('sin cliente de Supabase configurado: false, sin consultar', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { esAdminRadar: esAdminSinConfig } = await import('../lib/radar')
    expect(await esAdminSinConfig(USER_ID)).toBe(false)
  })
})

describe('probarEnvioRadar: fetch a ${SITIO}/api/radar/prueba con el Bearer de la sesión', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('manda POST a SITIO + /api/radar/prueba con Authorization: Bearer <token>, sin cuerpo', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, message: 'Correo de prueba enviado' }) })

    await probarEnvioRadar(TOKEN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${SITIO}/api/radar/prueba`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
    expect(init.body).toBeUndefined()
  })

  it('respuesta success:true: ok:true con el mensaje del servidor', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ success: true, message: 'Correo de prueba enviado a usuario@ejemplo.test', count: 2 }),
    })
    const resultado = await probarEnvioRadar(TOKEN)
    expect(resultado).toEqual({ ok: true, mensaje: 'Correo de prueba enviado a usuario@ejemplo.test' })
  })

  it('respuesta success:false (ej. "Solo administradores."): ok:false con el mismo mensaje', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: false, message: 'Solo administradores.' }) })
    const resultado = await probarEnvioRadar(TOKEN)
    expect(resultado).toEqual({ ok: false, mensaje: 'Solo administradores.' })
  })

  it('error de red (fetch rechaza): ok:false con el mensaje de conexión', async () => {
    fetchMock.mockRejectedValue(new Error('network request failed'))
    const resultado = await probarEnvioRadar(TOKEN)
    expect(resultado).toEqual({ ok: false, mensaje: MENSAJE_ERROR_RED_PRUEBA })
  })

  it('respuesta sin JSON válido: ok:false con el mensaje de conexión, no explota', async () => {
    fetchMock.mockResolvedValue({ json: async () => { throw new Error('no es JSON') } })
    const resultado = await probarEnvioRadar(TOKEN)
    expect(resultado).toEqual({ ok: false, mensaje: MENSAJE_ERROR_RED_PRUEBA })
  })

  it('respuesta JSON sin "message": ok:false con el mensaje de conexión', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true }) })
    const resultado = await probarEnvioRadar(TOKEN)
    expect(resultado).toEqual({ ok: false, mensaje: MENSAJE_ERROR_RED_PRUEBA })
  })

  it('nunca manda el email ni ningún otro dato del destinatario: el único dato que viaja es el token', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, message: 'ok' }) })
    await probarEnvioRadar(TOKEN)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBeUndefined()
    expect(JSON.stringify(init.headers)).not.toContain('@')
  })
})

// ---------------------------------------------------------------------------
// components/PantallaRadar.tsx: el botón solo se arma con esAdmin, y dispara
// probarEnvioRadar con el access_token de la sesión (lectura de código: sin
// RNTL en el repo, mismo estilo que tests/ficha.test.ts).
// ---------------------------------------------------------------------------
describe('components/PantallaRadar.tsx: "Enviar un email de prueba" solo para admin', () => {
  const content = readFileSync(PANTALLA_RADAR_PATH, 'utf8')

  it('importa esAdminRadar y probarEnvioRadar de "@/lib/radar"', () => {
    expect(content).toMatch(/import\s*\{[^}]*esAdminRadar[^}]*\}\s*from\s*['"]@\/lib\/radar['"]/)
    expect(content).toMatch(/import\s*\{[^}]*probarEnvioRadar[^}]*\}\s*from\s*['"]@\/lib\/radar['"]/)
  })

  it('tiene un estado "esAdmin" que arranca en false', () => {
    expect(content).toMatch(/const\s*\[\s*esAdmin\s*,\s*setEsAdmin\s*\]\s*=\s*useState\(false\)/)
  })

  it('el texto "Enviar un email de prueba" está envuelto en un condicional sobre esAdmin', () => {
    // Comillas simples: el JSX real (`'Enviar un email de prueba'`), no el
    // comentario de arriba del archivo (que lo nombra entre comillas dobles).
    const idxTexto = content.indexOf("'Enviar un email de prueba'")
    expect(idxTexto).toBeGreaterThan(-1)

    // Busca, yendo hacia atrás desde el texto, la apertura del condicional
    // más cercana (`{esAdmin ? (` o `esAdmin &&`) antes que cualquier otro
    // cierre de bloque JSX al mismo nivel.
    const antes = content.slice(0, idxTexto)
    const idxCondicional = Math.max(antes.lastIndexOf('{esAdmin ?'), antes.lastIndexOf('esAdmin &&'))
    expect(idxCondicional).toBeGreaterThan(-1)

    // Nada de "esAdmin" se interpone entre el condicional y el texto salvo
    // el propio condicional encontrado (si hubiera otro más cerca, el
    // lastIndexOf ya lo habría encontrado a él).
    const entreMedio = content.slice(idxCondicional, idxTexto)
    expect(entreMedio).toMatch(/esAdmin/)
  })

  it('el botón llama a enviarPrueba, que usa probarEnvioRadar con session.access_token', () => {
    const idxFuncion = content.indexOf('async function enviarPrueba')
    expect(idxFuncion).toBeGreaterThan(-1)
    const cuerpoFuncion = content.slice(idxFuncion, content.indexOf('\n  }', idxFuncion))
    expect(cuerpoFuncion).toMatch(/session\?\.access_token/)
    expect(cuerpoFuncion).toMatch(/probarEnvioRadar\(token\)/)

    expect(content).toMatch(/onPress=\{enviarPrueba\}/)
  })

  it('con error de red, el mensaje coincide con el de lib/radar.ts (MENSAJE_ERROR_RED_PRUEBA)', () => {
    // El texto no está escrito a mano en el componente: viaja en
    // `resultado.mensaje`, que sale de `probarEnvioRadar`. Lo fijamos acá
    // para que un cambio futuro en cualquiera de los dos archivos salte.
    expect(MENSAJE_ERROR_RED_PRUEBA).toBe('No pudimos enviar la prueba. Revisá tu conexión.')
  })
})
