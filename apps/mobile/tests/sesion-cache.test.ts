// R43, 43-d (plan `ops/rondas/43-sin-conexion/plan.md`, decisiones 8 y 9):
// `debeBorrarCacheFavoritos` y `reducirSesion` (lib/session/index.tsx), las
// dos puras. Mismo patrón que `tests/sesion.test.ts` para poder cargar
// `lib/session` sin React Native: `lib/session/index.tsx` importa
// `{ supabase }` de `../supabase`, que a su vez importa `react-native` y
// `react-native-url-polyfill/auto` — se mockea ese import para no
// arrastrarlos. `@supabase/supabase-js` sí se importa de verdad: es JS puro,
// sin nada nativo, y es justo lo que queremos probar de verdad (no un mock
// propio, ver la nota de la trampa más abajo).
import { describe, expect, it, vi } from 'vitest'
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'

vi.mock('../lib/supabase', () => ({ supabase: null }))

// Para controlar a mano, en el test de `esperarBorradoDeCache`, cuándo
// "termina" el borrado — sin depender de la velocidad real del doble de
// AsyncStorage. Ningún otro test de este archivo llama a
// `borrarCacheFavoritos` (son todos sobre funciones puras), así que
// mockearla para todo el archivo no les afecta.
vi.mock('../lib/sin-conexion/cache', () => ({ borrarCacheFavoritos: vi.fn() }))

import { borrarCacheFavoritos } from '../lib/sin-conexion/cache'
import {
  debeBorrarCacheFavoritos,
  dispararBorradoDeCacheFavoritos,
  esperarBorradoDeCache,
  reducirSesion,
  type EstadoSesion,
} from '../lib/session'

// ---------------------------------------------------------------------------
// Fixtures: nada de ids ni emails reales. `Session` tiene muchos más campos
// en la librería real (access_token, refresh_token, expires_in...), pero
// `reducirSesion` solo mira `session.user.id`, así que el fixture no los
// necesita.
// ---------------------------------------------------------------------------
function sesionDe(userId: string): Session {
  return { user: { id: userId } } as unknown as Session
}

const SESION_A = sesionDe('cuenta-a')
const SESION_B = sesionDe('cuenta-b')

/**
 * La trampa del encargo: `isAuthRetryableFetchError` (leído en
 * `node_modules/@supabase/auth-js/dist/module/lib/errors.js`) es
 * `isAuthError(error) && error.name === 'AuthRetryableFetchError'`, y
 * `isAuthError` exige `'__isAuthError' in error`. Un objeto plano
 * `{ name: 'AuthRetryableFetchError', status: 0 }` NO alcanza: hace falta
 * `__isAuthError: true` también.
 */
function errorDeAuthFixture(nombre: string, status: number) {
  return Object.assign(new Error(`fixture: ${nombre}`), { __isAuthError: true, name: nombre, status })
}

const ERROR_RETRYABLE = errorDeAuthFixture('AuthRetryableFetchError', 0)
const ERROR_NO_RETRYABLE = errorDeAuthFixture('AuthApiError', 400)

describe('isAuthRetryableFetchError sobre los fixtures de la ronda (@supabase/supabase-js, no un chequeo propio)', () => {
  it('reconoce el fixture con __isAuthError + name "AuthRetryableFetchError"', () => {
    expect(isAuthRetryableFetchError(ERROR_RETRYABLE)).toBe(true)
  })

  it('un AuthApiError (otro nombre) no es un error de red', () => {
    expect(isAuthRetryableFetchError(ERROR_NO_RETRYABLE)).toBe(false)
  })

  it('un objeto plano SIN __isAuthError no lo reconoce, aunque tenga el mismo "name" y "status"', () => {
    expect(isAuthRetryableFetchError({ name: 'AuthRetryableFetchError', status: 0 })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// debeBorrarCacheFavoritos: la tabla completa del encargo.
// ---------------------------------------------------------------------------
describe('debeBorrarCacheFavoritos', () => {
  it('undefined → A: false (todavía no se sabe quién era, no hay nada que borrar)', () => {
    expect(debeBorrarCacheFavoritos(undefined, 'cuenta-a')).toBe(false)
  })

  it('A → A: false (sigue siendo la misma cuenta)', () => {
    expect(debeBorrarCacheFavoritos('cuenta-a', 'cuenta-a')).toBe(false)
  })

  it('A → null: true (cerró sesión, o venció sin red y encima se cerró en otro lado)', () => {
    expect(debeBorrarCacheFavoritos('cuenta-a', null)).toBe(true)
  })

  it('A → B: true (cambió de cuenta)', () => {
    expect(debeBorrarCacheFavoritos('cuenta-a', 'cuenta-b')).toBe(true)
  })

  it('null → B: true (cubre una caché que volvió de un backup de Android)', () => {
    expect(debeBorrarCacheFavoritos(null, 'cuenta-b')).toBe(true)
  })

  it('null → null: false (sigue sin sesión)', () => {
    expect(debeBorrarCacheFavoritos(null, null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// debeBorrarCacheFavoritos con `{ cierreDeSesionExplicito: true }` (vuelta 1
// de revisión de 43-d): la EXCEPCIÓN a "previo === undefined → false", para
// un SIGNED_OUT real. El resto de la tabla, sin el parámetro (como arriba),
// queda exactamente igual.
// ---------------------------------------------------------------------------
describe('debeBorrarCacheFavoritos con cierreDeSesionExplicito', () => {
  it('undefined → null, con cierreDeSesionExplicito: true (el hueco que se tapa)', () => {
    expect(debeBorrarCacheFavoritos(undefined, null, { cierreDeSesionExplicito: true })).toBe(true)
  })

  it('undefined → null, SIN cierreDeSesionExplicito: sigue en false (el guard de siempre)', () => {
    expect(debeBorrarCacheFavoritos(undefined, null)).toBe(false)
  })

  it('null → null, con cierreDeSesionExplicito: true: sigue en false — ya se sabía que no había sesión', () => {
    expect(debeBorrarCacheFavoritos(null, null, { cierreDeSesionExplicito: true })).toBe(false)
  })

  it('A → null, con cierreDeSesionExplicito: true: sigue en true, como sin el parámetro', () => {
    expect(debeBorrarCacheFavoritos('cuenta-a', null, { cierreDeSesionExplicito: true })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// reducirSesion: la secuencia completa del encargo, encadenando el
// resultado de cada paso como "actual" del siguiente (igual que el provider
// real, que arrastra `estado` y el `useRef` de un evento al otro).
// ---------------------------------------------------------------------------
describe('reducirSesion', () => {
  const ESTADO_ARRANQUE: EstadoSesion = { session: null, cargando: true, sinConexion: false }

  it('carga inicial con un error de red: sinConexion queda en true y el usuario en undefined', () => {
    const resultado = reducirSesion(
      { estado: ESTADO_ARRANQUE, usuarioConocido: undefined },
      { tipo: 'carga-inicial', session: null, errorDeRed: isAuthRetryableFetchError(ERROR_RETRYABLE) },
    )

    expect(resultado.estado.sinConexion).toBe(true)
    expect(resultado.estado.session).toBeNull()
    expect(resultado.usuarioConocido).toBeUndefined()
    expect(resultado.borrarCacheFavoritos).toBe(false)
  })

  it('carga inicial con un error que NO es de red: no prende sinConexion', () => {
    const resultado = reducirSesion(
      { estado: ESTADO_ARRANQUE, usuarioConocido: undefined },
      { tipo: 'carga-inicial', session: null, errorDeRed: isAuthRetryableFetchError(ERROR_NO_RETRYABLE) },
    )

    expect(resultado.estado.sinConexion).toBe(false)
    expect(resultado.usuarioConocido).toBeNull()
    expect(resultado.borrarCacheFavoritos).toBe(false)
  })

  it('después de sinConexion, un TOKEN_REFRESHED con A apaga sinConexion y no borra', () => {
    const trasCargaInicial = reducirSesion(
      { estado: ESTADO_ARRANQUE, usuarioConocido: undefined },
      { tipo: 'carga-inicial', session: null, errorDeRed: true },
    )

    const resultado = reducirSesion(
      { estado: trasCargaInicial.estado, usuarioConocido: trasCargaInicial.usuarioConocido },
      { tipo: 'cambio', evento: 'TOKEN_REFRESHED', session: SESION_A },
    )

    expect(resultado.estado.sinConexion).toBe(false)
    expect(resultado.usuarioConocido).toBe('cuenta-a')
    expect(resultado.borrarCacheFavoritos).toBe(false)

    // Y desde ahí, un SIGNED_OUT (de la cuenta A a null) sí borra.
    const signedOut = reducirSesion(
      { estado: resultado.estado, usuarioConocido: resultado.usuarioConocido },
      { tipo: 'cambio', evento: 'SIGNED_OUT', session: null },
    )
    expect(signedOut.estado.sinConexion).toBe(false)
    expect(signedOut.usuarioConocido).toBeNull()
    expect(signedOut.borrarCacheFavoritos).toBe(true)

    // Y un SIGNED_IN posterior con B (otra cuenta) también borra.
    const signedInB = reducirSesion(
      { estado: resultado.estado, usuarioConocido: resultado.usuarioConocido },
      { tipo: 'cambio', evento: 'SIGNED_IN', session: SESION_B },
    )
    expect(signedInB.usuarioConocido).toBe('cuenta-b')
    expect(signedInB.borrarCacheFavoritos).toBe(true)
  })

  it('un INITIAL_SESSION con null después de sinConexion no lo apaga, y no borra', () => {
    const trasCargaInicial = reducirSesion(
      { estado: ESTADO_ARRANQUE, usuarioConocido: undefined },
      { tipo: 'carga-inicial', session: null, errorDeRed: true },
    )
    expect(trasCargaInicial.estado.sinConexion).toBe(true)

    const resultado = reducirSesion(
      { estado: trasCargaInicial.estado, usuarioConocido: trasCargaInicial.usuarioConocido },
      { tipo: 'cambio', evento: 'INITIAL_SESSION', session: null },
    )

    expect(resultado.estado.sinConexion).toBe(true)
    expect(resultado.usuarioConocido).toBeUndefined()
    expect(resultado.borrarCacheFavoritos).toBe(false)
  })

  it(
    'el hueco de la vuelta 1: un SIGNED_OUT DIRECTO después de sinConexion (sin TOKEN_REFRESHED/SIGNED_IN ' +
      'en el medio que confirme la cuenta primero) borra igual. Es exactamente el camino real: sin red al ' +
      'arrancar, se recupera la red y se toca "Cerrar sesión" ANTES de que el auto-refresh de supabase-js ' +
      'dispare algún evento con sesión — signOut() no necesita una sesión confirmada para emitir SIGNED_OUT. ' +
      'Si acá hubiera un TOKEN_REFRESHED/SIGNED_IN antes (como en el test de arriba), usuarioConocido ya no ' +
      'sería undefined al llegar el SIGNED_OUT y el guard de "previo === undefined" ni entraría en juego: ese ' +
      'camino no prueba este hueco.',
    () => {
      const trasCargaInicial = reducirSesion(
        { estado: ESTADO_ARRANQUE, usuarioConocido: undefined },
        { tipo: 'carga-inicial', session: null, errorDeRed: true },
      )
      expect(trasCargaInicial.usuarioConocido).toBeUndefined()

      const resultado = reducirSesion(
        { estado: trasCargaInicial.estado, usuarioConocido: trasCargaInicial.usuarioConocido },
        { tipo: 'cambio', evento: 'SIGNED_OUT', session: null },
      )

      expect(resultado.estado.sinConexion).toBe(false)
      expect(resultado.usuarioConocido).toBeNull()
      expect(resultado.borrarCacheFavoritos).toBe(true)
    },
  )

  it('una sesión no nula apaga sinConexion aunque el evento no sea SIGNED_OUT', () => {
    const trasCargaInicial = reducirSesion(
      { estado: ESTADO_ARRANQUE, usuarioConocido: undefined },
      { tipo: 'carga-inicial', session: null, errorDeRed: true },
    )

    const resultado = reducirSesion(
      { estado: trasCargaInicial.estado, usuarioConocido: trasCargaInicial.usuarioConocido },
      { tipo: 'cambio', evento: 'INITIAL_SESSION', session: SESION_A },
    )

    expect(resultado.estado.sinConexion).toBe(false)
    expect(resultado.usuarioConocido).toBe('cuenta-a')
    // undefined → A no borra (la tabla de debeBorrarCacheFavoritos).
    expect(resultado.borrarCacheFavoritos).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// esperarBorradoDeCache (vuelta 1 de revisión de 43-d, pedido de seguridad:
// 43-c la va a usar antes de leer la caché de favoritos, para no mostrarle
// a la cuenta B la caché que todavía no terminó de borrarse después de un
// cambio de sesión A → B). `borrarCacheFavoritos` está mockeada (ver el
// import de arriba) para controlar a mano cuándo "termina" el borrado, sin
// depender de la velocidad real del doble de AsyncStorage.
// ---------------------------------------------------------------------------
describe('esperarBorradoDeCache', () => {
  it('resuelve de inmediato si no hay ningún borrado en curso', async () => {
    await expect(esperarBorradoDeCache()).resolves.toBeUndefined()
  })

  it('espera a que termine un borrado disparado con dispararBorradoDeCacheFavoritos', async () => {
    let resolverBorrado: () => void = () => {}
    const borradoControlado = new Promise<void>((resolve) => {
      resolverBorrado = resolve
    })
    vi.mocked(borrarCacheFavoritos).mockReturnValueOnce(borradoControlado)

    dispararBorradoDeCacheFavoritos()

    let terminado = false
    const esperaDelBorrado = esperarBorradoDeCache().then(() => {
      terminado = true
    })

    // El borrado todavía no se resolvió: esperarBorradoDeCache no puede
    // haber terminado todavía (si esto fallara, `esperarBorradoDeCache`
    // estaría resolviendo sin esperar nada de verdad).
    await Promise.resolve()
    await Promise.resolve()
    expect(terminado).toBe(false)

    resolverBorrado()
    await esperaDelBorrado
    expect(terminado).toBe(true)
  })

  it('nunca rechaza, aunque el borrado en curso falle', async () => {
    // `dispararBorradoDeCacheFavoritos` ya envuelve el borrado real en un
    // `.catch(() => {})`, así que un rechazo acá nunca debería llegar a
    // `esperarBorradoDeCache`.
    vi.mocked(borrarCacheFavoritos).mockReturnValueOnce(Promise.reject(new Error('almacén roto')))

    dispararBorradoDeCacheFavoritos()

    await expect(esperarBorradoDeCache()).resolves.toBeUndefined()
  })
})
