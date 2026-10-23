// Ronda 51, tarea 51-d: `cambiarPatrocinados` (lib/notificaciones.ts) — el
// interruptor "Avisos patrocinados" de Cuenta guarda al tocarlo, sin pasar
// por el resto del formulario de notificaciones. Mismo patrón de doble que
// `tests/notificaciones.test.ts` (nunca el cliente real: ni red, ni .env, ni
// base) más dos detectores de solo lectura sobre el texto real de
// `components/SeccionNotificaciones.tsx` (51-e necesita que
// `cambiarPatrocinados` y `guardar()` sigan siendo dos caminos distintos, y
// que el `userId` siga saliendo de `useSession()`).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID_SESION = 'usuario-de-sesion-1'

const estado = vi.hoisted(() => ({
  escrituraResultado: { error: null as unknown } as { error: unknown },
  arrojarEscritura: null as unknown,
  llamadas: { upsert: 0 },
  ultimoUpsert: null as unknown,
  ultimaOpcion: null as unknown,
}))

// `vi.mock` se eleva por encima de los imports estáticos: `lib/notificaciones`
// ya ve este doble al importar `@/lib/supabase`. Nunca el cliente real.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla !== 'notification_preferences') {
        throw new Error(`tabla inesperada en el doble de patrocinados: ${tabla}`)
      }
      const builder: Record<string, unknown> = {}
      builder.upsert = async (valores: unknown, opcion: unknown) => {
        estado.llamadas.upsert++
        estado.ultimoUpsert = valores
        estado.ultimaOpcion = opcion
        if (estado.arrojarEscritura) throw estado.arrojarEscritura
        return estado.escrituraResultado
      }
      return builder
    },
  },
}))

import { cambiarPatrocinados } from '../lib/notificaciones'

beforeEach(() => {
  estado.escrituraResultado = { error: null }
  estado.arrojarEscritura = null
  estado.llamadas = { upsert: 0 }
  estado.ultimoUpsert = null
  estado.ultimaOpcion = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// El upsert es exactamente user_id + sponsored, con onConflict: 'user_id'.
// ---------------------------------------------------------------------------
describe('cambiarPatrocinados: el upsert manda exactamente user_id y sponsored', () => {
  it('con true', async () => {
    const resultado = await cambiarPatrocinados(USER_ID_SESION, true)

    expect(resultado).toEqual({ ok: true })
    expect(estado.ultimoUpsert).toEqual({ user_id: USER_ID_SESION, sponsored: true })
    expect(Object.keys(estado.ultimoUpsert as object)).toHaveLength(2)
  })

  it('con false', async () => {
    const resultado = await cambiarPatrocinados(USER_ID_SESION, false)

    expect(resultado).toEqual({ ok: true })
    expect(estado.ultimoUpsert).toEqual({ user_id: USER_ID_SESION, sponsored: false })
    expect(Object.keys(estado.ultimoUpsert as object)).toHaveLength(2)
  })

  it('nunca manda radar_channel, favorite_reminders, follow_news, announcements, quiet_start ni quiet_end', async () => {
    await cambiarPatrocinados(USER_ID_SESION, true)

    const claves = Object.keys(estado.ultimoUpsert as object)
    for (const campoAjeno of [
      'radar_channel',
      'favorite_reminders',
      'follow_news',
      'announcements',
      'quiet_start',
      'quiet_end',
      'daily_cap',
    ]) {
      expect(claves).not.toContain(campoAjeno)
    }
  })

  it('el upsert va con onConflict: "user_id"', async () => {
    await cambiarPatrocinados(USER_ID_SESION, true)

    expect(estado.ultimaOpcion).toEqual({ onConflict: 'user_id' })
  })
})

// ---------------------------------------------------------------------------
// Error de la base: ok:false con mensaje en castellano.
// ---------------------------------------------------------------------------
describe('cambiarPatrocinados: error de la base', () => {
  it('un error de permisos (42501) da ok:false con mensaje en castellano, sin reventar', async () => {
    estado.escrituraResultado = { error: { code: '42501', message: 'permission denied' } }

    const resultado = await cambiarPatrocinados(USER_ID_SESION, true)

    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería ser ok')
    expect(typeof resultado.mensaje).toBe('string')
    expect(resultado.mensaje.length).toBeGreaterThan(0)
    // En castellano, no un código ni un mensaje crudo de Postgrest.
    expect(resultado.mensaje).not.toBe('permission denied')
    expect(resultado.mensaje).not.toContain('42501')
  })

  it('una excepción de red (en vez de un error de Postgrest) también da ok:false, sin reventar', async () => {
    estado.arrojarEscritura = new Error('fetch failed')

    const resultado = await cambiarPatrocinados(USER_ID_SESION, false)

    expect(resultado.ok).toBe(false)
  })

  it('la tabla no existe todavía (PGRST205): ok:false con el mensaje amable, no uno crudo', async () => {
    estado.escrituraResultado = { error: { code: 'PGRST205', message: 'Could not find the table' } }

    const resultado = await cambiarPatrocinados(USER_ID_SESION, true)

    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería ser ok')
    expect(resultado.mensaje).not.toContain('PGRST205')
    expect(resultado.mensaje).not.toContain('Could not find the table')
  })
})

// ---------------------------------------------------------------------------
// Sin configuración de Supabase.
// ---------------------------------------------------------------------------
describe('cambiarPatrocinados: sin configuración de Supabase', () => {
  it('ok:false, y no llega a construir ningún upsert', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { cambiarPatrocinados: cambiarSinConfig } = await import('../lib/notificaciones')

    const resultado = await cambiarSinConfig(USER_ID_SESION, true)

    expect(resultado.ok).toBe(false)
    expect(estado.llamadas.upsert).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Detectores de solo lectura sobre components/SeccionNotificaciones.tsx: dos
// caminos distintos (el interruptor nuevo vs. el botón "Guardar
// notificaciones"), y el userId sale de useSession().
// ---------------------------------------------------------------------------
const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC_SECCION_NOTIFICACIONES = readFileSync(
  `${MOBILE_ROOT}/components/SeccionNotificaciones.tsx`,
  'utf8',
)

describe('components/SeccionNotificaciones.tsx: cambiarPatrocinados y guardar() son dos caminos distintos', () => {
  it('importa cambiarPatrocinados de @/lib/notificaciones', () => {
    expect(SRC_SECCION_NOTIFICACIONES).toMatch(
      /import\s*\{[^}]*\bcambiarPatrocinados\b[^}]*\}\s*from\s*['"]@\/lib\/notificaciones['"]/,
    )
  })

  it('el Switch de "Avisos patrocinados" llama (directa o indirectamente) a cambiarPatrocinados en su onValueChange', () => {
    const idxFila = SRC_SECCION_NOTIFICACIONES.indexOf('<Texto>Avisos patrocinados</Texto>')
    const idxSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('<Switch', idxFila)
    const finSwitch = SRC_SECCION_NOTIFICACIONES.indexOf('/>', idxSwitch)
    expect(idxFila).toBeGreaterThan(-1)
    expect(idxSwitch).toBeGreaterThan(idxFila)

    const tramoSwitch = SRC_SECCION_NOTIFICACIONES.slice(idxSwitch, finSwitch + 2)
    expect(tramoSwitch).toMatch(/onValueChange\s*=\s*\{?\s*cambiarSponsored\b/)

    // La función que arma el onValueChange llama a cambiarPatrocinados.
    const idxFuncion = SRC_SECCION_NOTIFICACIONES.indexOf('async function cambiarSponsored')
    const idxFinFuncion = SRC_SECCION_NOTIFICACIONES.indexOf('\n  }', idxFuncion)
    const cuerpoFuncion = SRC_SECCION_NOTIFICACIONES.slice(idxFuncion, idxFinFuncion)
    expect(cuerpoFuncion).toContain('cambiarPatrocinados(')
  })

  it('guardar() NO llama a cambiarPatrocinados (son dos caminos distintos)', () => {
    const idxGuardar = SRC_SECCION_NOTIFICACIONES.indexOf('async function guardar()')
    const idxFinGuardar = SRC_SECCION_NOTIFICACIONES.indexOf('\n  }', idxGuardar)
    const cuerpoGuardar = SRC_SECCION_NOTIFICACIONES.slice(idxGuardar, idxFinGuardar)

    expect(cuerpoGuardar).not.toContain('cambiarPatrocinados(')
  })

  it('cambiarSponsored (el handler del interruptor) NO llama a guardarNotificaciones (no pasa por el botón de abajo)', () => {
    const idxFuncion = SRC_SECCION_NOTIFICACIONES.indexOf('async function cambiarSponsored')
    const idxFinFuncion = SRC_SECCION_NOTIFICACIONES.indexOf('\n  }', idxFuncion)
    const cuerpoFuncion = SRC_SECCION_NOTIFICACIONES.slice(idxFuncion, idxFinFuncion)

    expect(cuerpoFuncion).not.toContain('guardarNotificaciones(')
  })

  it('fixture de rotura: si guardar() llamara a cambiarPatrocinados, este detector SÍ lo encontraría', () => {
    const fixtureRoto = [
      'async function guardar() {',
      '  await cambiarPatrocinados(userId, sponsored)',
      '}',
    ].join('\n')
    const idxGuardar = fixtureRoto.indexOf('async function guardar()')
    const idxFinGuardar = fixtureRoto.indexOf('\n}', idxGuardar)
    const cuerpoGuardar = fixtureRoto.slice(idxGuardar, idxFinGuardar)
    expect(cuerpoGuardar).toContain('cambiarPatrocinados(')
  })
})

describe('components/SeccionNotificaciones.tsx: el userId de cambiarPatrocinados sale de useSession()', () => {
  it('el componente lee userId de useSession(), no de una prop ni de un parámetro', () => {
    expect(SRC_SECCION_NOTIFICACIONES).toMatch(
      /import\s*\{\s*useSession\s*\}\s*from\s*['"]@\/lib\/session['"]/,
    )
    expect(SRC_SECCION_NOTIFICACIONES).toMatch(/const\s*\{\s*session\s*\}\s*=\s*useSession\(\)/)
    expect(SRC_SECCION_NOTIFICACIONES).toMatch(/const\s+userId\s*=\s*session\?\.\s*user\.id\s*\?\?\s*null/)

    // SeccionNotificaciones no recibe props (ningún parámetro en su firma):
    // el único lugar de donde puede salir userId es ese useSession() local.
    expect(SRC_SECCION_NOTIFICACIONES).toMatch(/export function SeccionNotificaciones\(\)\s*\{/)
  })

  it('cambiarSponsored llama a cambiarPatrocinados con ese mismo userId (la variable, no session.user.id de nuevo ni otro identificador)', () => {
    const idxFuncion = SRC_SECCION_NOTIFICACIONES.indexOf('async function cambiarSponsored')
    const idxFinFuncion = SRC_SECCION_NOTIFICACIONES.indexOf('\n  }', idxFuncion)
    const cuerpoFuncion = SRC_SECCION_NOTIFICACIONES.slice(idxFuncion, idxFinFuncion)

    expect(cuerpoFuncion).toMatch(/cambiarPatrocinados\(\s*userId\s*,/)
  })

  it('fixture de rotura: si cambiarPatrocinados recibiera algo distinto de la variable userId, este detector SÍ lo encontraría', () => {
    const fixtureRoto = [
      'async function cambiarSponsored(nuevo) {',
      '  await cambiarPatrocinados(idDeOtroLado, nuevo)',
      '}',
    ].join('\n')
    expect(fixtureRoto).not.toMatch(/cambiarPatrocinados\(\s*userId\s*,/)
  })
})
