// Ronda 70, tarea 70-a (tests 70-q): la invitación a activar los avisos, una
// sola vez por teléfono. `lib/push/invitacion.ts` es puro salvo el acceso a
// SecureStore, que se carga con import() dentro de las funciones: acá va
// mockeado con un almacén en memoria (nunca el módulo nativo real, ni red).
//
// Qué se vigila: la regla `seMuestraInvitacion` (cada estado de push x vista),
// que la bandera se marque y no se repita, que una lectura que falla cuente
// como "ya vista" (nunca insistir), que una escritura que falla no rompa nada,
// y — con detectores de solo lectura sobre los componentes — que el Guardar/Voy
// invite solo si salió bien y que "Activar" marque la bandera ANTES de pedir el
// permiso (así, negar el permiso no vuelve a mostrar la tarjeta).
// `cambiarAvisosEquipo` (lib/notificaciones.ts) va al final: guarda solo
// `announcements`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const almacen = vi.hoisted(() => ({
  valores: new Map<string, string>(),
  falla: { lectura: false, escritura: false },
  llamadas: { get: [] as string[], set: [] as Array<[string, string]> },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (clave: string) => {
    almacen.llamadas.get.push(clave)
    if (almacen.falla.lectura) throw new Error('SecureStore no disponible')
    return almacen.valores.get(clave) ?? null
  }),
  setItemAsync: vi.fn(async (clave: string, valor: string) => {
    almacen.llamadas.set.push([clave, valor])
    if (almacen.falla.escritura) throw new Error('SecureStore no disponible')
    almacen.valores.set(clave, valor)
  }),
  deleteItemAsync: vi.fn(async (clave: string) => {
    almacen.valores.delete(clave)
  }),
}))

const supabaseDoble = vi.hoisted(() => ({
  upserts: [] as Array<{ valores: unknown; opciones: unknown; tabla: string }>,
  resultado: { error: null as unknown },
  arroja: null as unknown,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => ({
      upsert: async (valores: unknown, opciones: unknown) => {
        supabaseDoble.upserts.push({ valores, opciones, tabla })
        if (supabaseDoble.arroja) throw supabaseDoble.arroja
        return supabaseDoble.resultado
      },
    }),
  },
}))

import {
  CLAVE_INVITACION_AVISOS_VISTA,
  invitacionFueVista,
  invitarTrasAccion,
  marcarInvitacionVista,
  seMuestraInvitacion,
  suscribirCambioVista,
  suscribirTrasAccion,
} from '../lib/push/invitacion'
import { TEXTOS_PUSH, type EstadoPush } from '../lib/push/estado'
import { cambiarAvisosEquipo } from '../lib/notificaciones'

const leerFuente = (rutaRelativa: string) => readFileSync(fileURLToPath(new URL(`../${rutaRelativa}`, import.meta.url)), 'utf8')

beforeEach(() => {
  almacen.valores.clear()
  almacen.falla.lectura = false
  almacen.falla.escritura = false
  almacen.llamadas.get = []
  almacen.llamadas.set = []
  supabaseDoble.upserts = []
  supabaseDoble.resultado = { error: null }
  supabaseDoble.arroja = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// seMuestraInvitacion: cada estado x vista
// ---------------------------------------------------------------------------
describe('seMuestraInvitacion', () => {
  const ESPERADO_SIN_VER: Record<EstadoPush, 'activar' | 'entrar' | null> = {
    'sin-pedir': 'activar',
    'sin-sesion': 'entrar',
    pidiendo: null,
    denegado: null,
    bloqueado: null,
    'no-disponible': null,
    'error-registro': null,
    activo: null,
  }

  it('la tabla de arriba cubre TODOS los estados de push (si aparece uno nuevo, hay que decidirlo acá)', () => {
    expect(Object.keys(ESPERADO_SIN_VER).sort()).toEqual(Object.keys(TEXTOS_PUSH).sort())
  })

  it.each(Object.entries(ESPERADO_SIN_VER) as Array<[EstadoPush, 'activar' | 'entrar' | null]>)(
    'estado "%s" sin ver: %s',
    (estado, esperado) => {
      expect(seMuestraInvitacion({ estado, vista: false })).toBe(esperado)
    },
  )

  it.each(Object.keys(ESPERADO_SIN_VER) as EstadoPush[])('estado "%s" YA vista: nunca se muestra', (estado) => {
    expect(seMuestraInvitacion({ estado, vista: true })).toBeNull()
  })

  it('si la persona negó el permiso ("denegado") o lo bloqueó, no se vuelve a insistir', () => {
    expect(seMuestraInvitacion({ estado: 'denegado', vista: false })).toBeNull()
    expect(seMuestraInvitacion({ estado: 'bloqueado', vista: false })).toBeNull()
  })

  it('mientras carga la sesión no se muestra nada (ni "entrar" ni "activar")', () => {
    expect(seMuestraInvitacion({ estado: 'sin-sesion', vista: false, cargando: true })).toBeNull()
    expect(seMuestraInvitacion({ estado: 'sin-pedir', vista: false, cargando: true })).toBeNull()
  })

  it('"activar" espera la primera sincronización; "entrar" sin sesión no la necesita', () => {
    expect(seMuestraInvitacion({ estado: 'sin-pedir', vista: false, sincronizado: false })).toBeNull()
    expect(seMuestraInvitacion({ estado: 'sin-pedir', vista: false, sincronizado: true })).toBe('activar')
    expect(seMuestraInvitacion({ estado: 'sin-sesion', vista: false, cargando: false, sincronizado: false })).toBe('entrar')
  })

  it('con los avisos ya activos no se invita', () => {
    expect(seMuestraInvitacion({ estado: 'activo', vista: false })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// La bandera
// ---------------------------------------------------------------------------
describe('la bandera de "invitación vista"', () => {
  it('la clave es válida para SecureStore (letras, números, ".", "-" y "_")', () => {
    expect(CLAVE_INVITACION_AVISOS_VISTA).toMatch(/^[A-Za-z0-9._-]+$/)
  })

  it('sin nada guardado: no vista', async () => {
    expect(await invitacionFueVista()).toBe(false)
  })

  it('marcarla guarda "1" bajo la clave y después queda vista', async () => {
    await marcarInvitacionVista()
    expect(almacen.llamadas.set).toEqual([[CLAVE_INVITACION_AVISOS_VISTA, '1']])
    expect(await invitacionFueVista()).toBe(true)
  })

  it('solo el valor "1" cuenta como vista (otros valores guardados, no)', async () => {
    for (const valor of ['0', 'true', '', 'si']) {
      almacen.valores.set(CLAVE_INVITACION_AVISOS_VISTA, valor)
      expect(await invitacionFueVista(), `valor ${JSON.stringify(valor)}`).toBe(false)
    }
  })

  it('lee la clave de la invitación (no otra)', async () => {
    await invitacionFueVista()
    expect(almacen.llamadas.get).toEqual([CLAVE_INVITACION_AVISOS_VISTA])
  })

  it('una lectura que falla cuenta como "ya vista" (nunca insistir)', async () => {
    almacen.falla.lectura = true
    expect(await invitacionFueVista()).toBe(true)
  })

  it('con la lectura caída, ni siquiera un estado "sin-pedir" muestra la invitación', async () => {
    almacen.falla.lectura = true
    const vista = await invitacionFueVista()
    expect(seMuestraInvitacion({ estado: 'sin-pedir', vista })).toBeNull()
    expect(seMuestraInvitacion({ estado: 'sin-sesion', vista })).toBeNull()
  })

  it('una escritura que falla no tira (en el peor caso se vuelve a mostrar una vez) y igual avisa a los oyentes', async () => {
    almacen.falla.escritura = true
    const oyente = vi.fn()
    const baja = suscribirCambioVista(oyente)
    await expect(marcarInvitacionVista()).resolves.toBeUndefined()
    expect(oyente).toHaveBeenCalledTimes(1)
    expect(await invitacionFueVista()).toBe(false)
    baja()
  })
})

describe('no se repite después de marcarla', () => {
  it('recorrido: primera vez se muestra; se marca; la próxima apertura no (para cada estado que invitaba)', async () => {
    for (const estado of ['sin-pedir', 'sin-sesion'] as const) {
      almacen.valores.clear()
      const antes = seMuestraInvitacion({ estado, vista: await invitacionFueVista() })
      expect(antes).not.toBeNull()
      await marcarInvitacionVista()
      expect(seMuestraInvitacion({ estado, vista: await invitacionFueVista() })).toBeNull()
    }
  })

  it('marcarla dos veces es inocuo (sigue vista)', async () => {
    await marcarInvitacionVista()
    await marcarInvitacionVista()
    expect(await invitacionFueVista()).toBe(true)
  })

  it('la tarjeta y la hoja comparten la bandera: marcar una avisa a todos los oyentes', async () => {
    const tarjeta = vi.fn()
    const hoja = vi.fn()
    const bajaTarjeta = suscribirCambioVista(tarjeta)
    const bajaHoja = suscribirCambioVista(hoja)
    await marcarInvitacionVista()
    expect(tarjeta).toHaveBeenCalledTimes(1)
    expect(hoja).toHaveBeenCalledTimes(1)
    bajaTarjeta()
    bajaHoja()
  })

  it('un oyente dado de baja ya no se llama', async () => {
    const oyente = vi.fn()
    const baja = suscribirCambioVista(oyente)
    baja()
    await marcarInvitacionVista()
    expect(oyente).not.toHaveBeenCalled()
  })
})

describe('invitarTrasAccion / suscribirTrasAccion', () => {
  it('avisa a los oyentes, y uno dado de baja deja de recibirlo', () => {
    const a = vi.fn()
    const b = vi.fn()
    const bajaA = suscribirTrasAccion(a)
    const bajaB = suscribirTrasAccion(b)
    invitarTrasAccion()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    bajaA()
    invitarTrasAccion()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    bajaB()
  })

  it('invitar no toca el almacenamiento (la hoja decide después si corresponde)', () => {
    invitarTrasAccion()
    expect(almacen.llamadas.get).toEqual([])
    expect(almacen.llamadas.set).toEqual([])
  })

  it('sin oyentes no pasa nada', () => {
    expect(() => invitarTrasAccion()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Detectores de solo lectura sobre los componentes
// ---------------------------------------------------------------------------
describe('componentes: la invitación sale solo de un Guardar / Voy exitoso', () => {
  it('BotonFavorito: invita solo en la rama de marcar y solo si resultado.ok', () => {
    const src = leerFuente('components/BotonFavorito.tsx')
    const llamadas = src.match(/invitarTrasAccion\(\)/g) ?? []
    expect(llamadas).toHaveLength(1)
    expect(src).toMatch(/const resultado = await marcarFavorito\([^)]*\)\s*\n\s*if \(resultado\.ok\) invitarTrasAccion\(\)/)
    const iDesmarcar = src.indexOf('await desmarcarFavorito(')
    const iInvitar = src.indexOf('invitarTrasAccion()')
    expect(iDesmarcar).toBeGreaterThan(-1)
    // la rama de quitar (desmarcar) viene antes y no invita
    expect(iDesmarcar).toBeLessThan(iInvitar)
  })

  it('FilaAccionesEvento: invita al guardar con éxito y al marcar "Voy" (nunca al quitar, nunca con error)', () => {
    const src = leerFuente('components/FilaAccionesEvento.tsx')
    expect(src.match(/invitarTrasAccion\(\)/g) ?? []).toHaveLength(2)
    expect(src).toMatch(/if \(resultado\.ok\) \{\s*\n\s*invitarTrasAccion\(\)/)
    expect(src).toMatch(/if \(nuevoVoy\) invitarTrasAccion\(\)/)
  })

  it('InvitacionAvisos: "Activar" marca la bandera ANTES de pedir el permiso (negarlo no vuelve a mostrar la tarjeta)', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    const iMarcar = src.indexOf('await marcarInvitacionVista()')
    const iActivar = src.indexOf('await activar()')
    expect(iMarcar).toBeGreaterThan(-1)
    expect(iActivar).toBeGreaterThan(-1)
    expect(iMarcar).toBeLessThan(iActivar)
  })

  it('InvitacionAvisos: solo guarda announcements si el permiso quedó "activo" y hay sesión', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/if \(resultado === 'activo' && userId\)/)
    // R81 (81-b): el "Activar" guarda también el canal del Radar y deja los
    // patrocinados apagados (`activarPreferenciasAlAceptar`).
    expect(src).toMatch(/activarPreferenciasAlAceptar\(userId\)/)
  })

  it('InvitacionAvisos: la variante "entrar" lleva a /cuenta y NO marca la bandera al tocarla', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/variante === 'activar' \? \(\) => void activar\(\) : \(\) => router\.push\('\/cuenta'\)/)
  })

  it('InvitacionAvisos: la hoja de después de la acción solo se abre con la variante "activar"', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/seMuestraInvitacion\(\{ \.\.\.datosRef\.current, vista \}\) === 'activar'/)
  })

  it('InvitacionAvisos: la hoja abre con retraso, limpiado en el cleanup', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/setTimeout\(/)
    expect(src).toMatch(/clearTimeout\(temporizador\)/)
  })

  it('InvitacionAvisos: la tarjeta y la hoja esperan la sesión y la primera sincronización', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/seMuestraInvitacion\(\{ estado, vista, cargando, sincronizado \}\)/)
    expect(src).toMatch(/datosRef = useRef\(\{ estado, sincronizado, cargando \}\)/)
  })

  it('InvitacionAvisos: la hoja no envuelve el fondo con un botón (hermanos) y es modal para el lector de pantalla', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/accessibilityViewIsModal/)
    expect(src).toMatch(/style=\{StyleSheet\.absoluteFill\}[\s\S]*?accessible=\{false\}/)
    expect(src).not.toMatch(/style=\{estilos\.fondo\}\s*\n\s*onPress/)
  })

  it('InvitacionAvisos: tras Activar avisa el resultado y revisa `ok` de activarPreferenciasAlAceptar', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/guardado\.ok \? AVISO_AVISOS_ACTIVOS : AVISO_PREFERENCIA_NO_GUARDADA/)
    expect(src).toMatch(/AVISO_AVISOS_NO_ACTIVADOS/)
    expect(src).not.toMatch(/cambiarAvisosEquipo\([^)]*\)\.catch/)
  })

  it('el userId de "Activar" sale de la sesión, no de ningún parámetro', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/const userId = session\?\.user\.id \?\? null/)
  })

  it('sin ningún console.* en la invitación (ni en el helper)', () => {
    for (const ruta of ['components/InvitacionAvisos.tsx', 'lib/push/invitacion.ts']) {
      expect(leerFuente(ruta), ruta).not.toMatch(/console\.(log|warn|error|info|debug)\s*\(/)
    }
  })

  it('lib/push/invitacion.ts no importa React Native ni Expo de forma estática (solo import() dinámico de SecureStore)', () => {
    const src = leerFuente('lib/push/invitacion.ts')
    expect(src).not.toMatch(/^import .* from ['"](react-native|expo-[\w-]+)['"]/m)
    expect(src).toMatch(/await import\('expo-secure-store'\)/)
  })
})

// ---------------------------------------------------------------------------
// cambiarAvisosEquipo: solo la columna announcements
// ---------------------------------------------------------------------------
describe('cambiarAvisosEquipo', () => {
  const USER = 'usuario-de-sesion-1'

  it.each([true, false])('el upsert manda exactamente user_id y announcements (%s), con onConflict user_id', async (valor) => {
    const r = await cambiarAvisosEquipo(USER, valor)
    expect(r).toEqual({ ok: true })
    expect(supabaseDoble.upserts).toEqual([
      { tabla: 'notification_preferences', valores: { user_id: USER, announcements: valor }, opciones: { onConflict: 'user_id' } },
    ])
  })

  it('nunca manda las otras columnas (no pisa silencio, tope, patrocinados ni el resto)', async () => {
    await cambiarAvisosEquipo(USER, true)
    const claves = Object.keys(supabaseDoble.upserts[0].valores as object)
    for (const ajena of ['radar_channel', 'favorite_reminders', 'follow_news', 'sponsored', 'quiet_start', 'quiet_end', 'daily_cap']) {
      expect(claves).not.toContain(ajena)
    }
  })

  it('un error de la base devuelve ok:false con un mensaje, sin tirar', async () => {
    supabaseDoble.resultado = { error: { code: '42501', message: 'permiso denegado interno' } }
    const r = await cambiarAvisosEquipo(USER, true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.mensaje).not.toContain('interno')
  })

  it('una excepción de red devuelve ok:false, sin tirar', async () => {
    supabaseDoble.arroja = new Error('Network request failed')
    const r = await cambiarAvisosEquipo(USER, true)
    expect(r.ok).toBe(false)
  })
})
