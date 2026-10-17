// Ronda 41, tarea 41-c: `lib/push/estado.ts` y `lib/push/registro.ts`.
//
// Dobles de `expo-notifications`, `react-native` (`Platform`/`Linking`),
// `expo-constants`, `@/lib/supabase` y `expo-secure-store` (igual que
// `tests/secure-storage.test.ts` y `tests/notificaciones.test.ts`: nada de
// red, nada de base, nada de teléfono real). El token es siempre inventado
// (`ExponentPushToken[de-prueba-1]`).
//
// `registro.ts` usa por defecto el `@/lib/secure-storage` real (partir en
// pedazos y demás): acá se lo deja correr sobre un `expo-secure-store`
// falso, igual que hace `tests/secure-storage.test.ts` con el almacenamiento
// real de la app.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKEN_DE_PRUEBA = 'ExponentPushToken[de-prueba-1]'

// ---------------------------------------------------------------------------
// Estado compartido de los dobles. `vi.hoisted` porque los `vi.mock` de abajo
// se elevan por encima de este archivo y necesitan verlo ya armado.
// ---------------------------------------------------------------------------
const estado = vi.hoisted(() => ({
  platformOS: 'android' as string,
  permisoActual: { status: 'undetermined', canAskAgain: true, granted: false, expires: 'never' as const },
  permisoPedido: { status: 'granted', canAskAgain: true, granted: true, expires: 'never' as const },
  tokenResultado: { data: 'ExponentPushToken[de-prueba-1]' } as { data: string },
  tokenError: null as unknown,
  tokenNuncaResuelve: false,
  rpcError: null as unknown,
  ultimoRpcArgs: null as unknown,
  deleteRechaza: false,
  ultimoEqToken: null as unknown,
  llamadas: {
    getPermissionsAsync: 0,
    requestPermissionsAsync: 0,
    setNotificationChannelAsync: 0,
    getExpoPushTokenAsync: 0,
    rpc: 0,
    delete: 0,
    insert: 0,
    upsert: 0,
  },
}))

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => {
    estado.llamadas.getPermissionsAsync++
    return estado.permisoActual
  }),
  requestPermissionsAsync: vi.fn(async () => {
    estado.llamadas.requestPermissionsAsync++
    return estado.permisoPedido
  }),
  setNotificationChannelAsync: vi.fn(async () => {
    estado.llamadas.setNotificationChannelAsync++
    return null
  }),
  getExpoPushTokenAsync: vi.fn(async () => {
    estado.llamadas.getExpoPushTokenAsync++
    if (estado.tokenNuncaResuelve) return new Promise(() => {})
    if (estado.tokenError) throw estado.tokenError
    return estado.tokenResultado
  }),
  AndroidImportance: { DEFAULT: 3 },
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return estado.platformOS
    },
  },
  Linking: { openSettings: vi.fn(async () => {}) },
}))

vi.mock('expo-constants', () => ({
  default: {
    easConfig: { projectId: 'proyecto-de-prueba' },
    expoConfig: { extra: { eas: { projectId: 'proyecto-de-prueba' } } },
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async (_fn: string, args: unknown) => {
      estado.llamadas.rpc++
      estado.ultimoRpcArgs = args
      if (estado.rpcError) return { data: null, error: estado.rpcError }
      return { data: null, error: null }
    }),
    from: (tabla: string) => {
      if (tabla !== 'push_tokens') {
        throw new Error(`tabla inesperada en el doble de push: ${tabla}`)
      }
      const builder: Record<string, unknown> = {}
      builder.delete = () => builder
      builder.insert = vi.fn(() => {
        estado.llamadas.insert++
        throw new Error('insert no permitido en push_tokens (RLS no lo deja)')
      })
      builder.upsert = vi.fn(() => {
        estado.llamadas.upsert++
        throw new Error('upsert no permitido en push_tokens (RLS no lo deja)')
      })
      builder.eq = async (campo: string, valor: unknown) => {
        if (campo === 'token') estado.ultimoEqToken = valor
        estado.llamadas.delete++
        if (estado.deleteRechaza) throw new Error('network error')
        return { data: null, error: null }
      }
      return builder
    },
  },
}))

const almacenSeguro = new Map<string, string>()
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (clave: string) => (almacenSeguro.has(clave) ? almacenSeguro.get(clave)! : null)),
  setItemAsync: vi.fn(async (clave: string, valor: string) => {
    almacenSeguro.set(clave, valor)
  }),
  deleteItemAsync: vi.fn(async (clave: string) => {
    almacenSeguro.delete(clave)
  }),
}))

import { estadoDesdePermiso } from '../lib/push/estado'
import {
  CLAVE_TOKEN_PUSH,
  borrarTokenDeEsteTelefono,
  obtenerToken,
  registrarToken,
  sincronizarPush,
} from '../lib/push/registro'
import { TIMEOUT_RED_MS } from '../lib/red'

beforeEach(() => {
  estado.platformOS = 'android'
  estado.permisoActual = { status: 'undetermined', canAskAgain: true, granted: false, expires: 'never' }
  estado.permisoPedido = { status: 'granted', canAskAgain: true, granted: true, expires: 'never' }
  estado.tokenResultado = { data: TOKEN_DE_PRUEBA }
  estado.tokenError = null
  estado.tokenNuncaResuelve = false
  estado.rpcError = null
  estado.ultimoRpcArgs = null
  estado.deleteRechaza = false
  estado.ultimoEqToken = null
  estado.llamadas = {
    getPermissionsAsync: 0,
    requestPermissionsAsync: 0,
    setNotificationChannelAsync: 0,
    getExpoPushTokenAsync: 0,
    rpc: 0,
    delete: 0,
    insert: 0,
    upsert: 0,
  }
  almacenSeguro.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// estadoDesdePermiso: los cuatro casos.
// ---------------------------------------------------------------------------
describe('estadoDesdePermiso', () => {
  it('granted da activo', () => {
    expect(estadoDesdePermiso({ status: 'granted', canAskAgain: true })).toBe('activo')
    expect(estadoDesdePermiso({ status: 'granted', canAskAgain: false })).toBe('activo')
  })

  it('denied con canAskAgain da denegado', () => {
    expect(estadoDesdePermiso({ status: 'denied', canAskAgain: true })).toBe('denegado')
  })

  it('denied sin canAskAgain da bloqueado', () => {
    expect(estadoDesdePermiso({ status: 'denied', canAskAgain: false })).toBe('bloqueado')
  })

  it('undetermined da sin-pedir', () => {
    expect(estadoDesdePermiso({ status: 'undetermined', canAskAgain: true })).toBe('sin-pedir')
  })
})

// ---------------------------------------------------------------------------
// sincronizarPush({ preguntar: false }): nunca pregunta.
// ---------------------------------------------------------------------------
describe('sincronizarPush({ preguntar: false })', () => {
  it('con el permiso undetermined, no llama a requestPermissionsAsync y da sin-pedir', async () => {
    estado.permisoActual = { status: 'undetermined', canAskAgain: true, granted: false, expires: 'never' }

    const resultado = await sincronizarPush({ preguntar: false })

    expect(resultado).toBe('sin-pedir')
    expect(estado.llamadas.requestPermissionsAsync).toBe(0)
    expect(estado.llamadas.rpc).toBe(0)
  })

  it('con el permiso denegado (puede volver a preguntar), da denegado sin preguntar', async () => {
    estado.permisoActual = { status: 'denied', canAskAgain: true, granted: false, expires: 'never' }

    const resultado = await sincronizarPush({ preguntar: false })

    expect(resultado).toBe('denegado')
    expect(estado.llamadas.requestPermissionsAsync).toBe(0)
  })

  it('con el permiso bloqueado, da bloqueado sin preguntar', async () => {
    estado.permisoActual = { status: 'denied', canAskAgain: false, granted: false, expires: 'never' }

    const resultado = await sincronizarPush({ preguntar: false })

    expect(resultado).toBe('bloqueado')
    expect(estado.llamadas.requestPermissionsAsync).toBe(0)
  })

  it('con el permiso ya concedido (otra sesión, una reinstalación), registra sin preguntar nada', async () => {
    estado.permisoActual = { status: 'granted', canAskAgain: true, granted: true, expires: 'never' }

    const resultado = await sincronizarPush({ preguntar: false })

    expect(resultado).toBe('activo')
    expect(estado.llamadas.requestPermissionsAsync).toBe(0)
    expect(estado.llamadas.rpc).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Sin FCM: getExpoPushTokenAsync tira. No se reintenta, no llega a la RPC.
// ---------------------------------------------------------------------------
describe('sin FCM (Default FirebaseApp is not initialized)', () => {
  it('da no-disponible, cero llamadas a la RPC y una sola llamada al token (sin reintento)', async () => {
    estado.permisoActual = { status: 'granted', canAskAgain: true, granted: true, expires: 'never' }
    estado.tokenError = new Error('Default FirebaseApp is not initialized')

    const resultado = await sincronizarPush({ preguntar: false })

    expect(resultado).toBe('no-disponible')
    expect(estado.llamadas.getExpoPushTokenAsync).toBe(1)
    expect(estado.llamadas.rpc).toBe(0)
  })

  it('obtenerToken por sí solo tampoco tira: { ok: false }', async () => {
    estado.tokenError = new Error('Default FirebaseApp is not initialized')

    await expect(obtenerToken()).resolves.toEqual({ ok: false })
  })

  it('sin projectId (ni easConfig ni expoConfig.extra.eas), da no-disponible sin llamar al token', async () => {
    estado.tokenError = null
    const expoConstants = await import('expo-constants')
    const original = { ...(expoConstants.default as object) }
    Object.assign(expoConstants.default as object, { easConfig: null, expoConfig: { extra: {} } })

    const resultado = await obtenerToken()

    expect(resultado).toEqual({ ok: false })
    expect(estado.llamadas.getExpoPushTokenAsync).toBe(0)

    Object.assign(expoConstants.default as object, original)
  })

  it('en una plataforma que no es Android ni iOS, da no-disponible sin llamar al token', async () => {
    estado.platformOS = 'web'

    const resultado = await obtenerToken()

    expect(resultado).toEqual({ ok: false })
    expect(estado.llamadas.getExpoPushTokenAsync).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Timeout: el token que nunca llega.
// ---------------------------------------------------------------------------
describe('timeout del token', () => {
  it(`si getExpoPushTokenAsync nunca responde, a los ${TIMEOUT_RED_MS} ms da no-disponible`, async () => {
    estado.permisoActual = { status: 'granted', canAskAgain: true, granted: true, expires: 'never' }
    estado.tokenNuncaResuelve = true
    vi.useFakeTimers()

    const promesaResultado = sincronizarPush({ preguntar: false })
    await vi.advanceTimersByTimeAsync(TIMEOUT_RED_MS)
    const resultado = await promesaResultado

    expect(resultado).toBe('no-disponible')
    expect(estado.llamadas.rpc).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// El registro: RPC con p_token/p_platform, nunca user_id, nunca insert/upsert.
// ---------------------------------------------------------------------------
describe('registrarToken', () => {
  it('llama a la RPC con p_token y p_platform, y nunca con un user_id', async () => {
    const resultado = await registrarToken(TOKEN_DE_PRUEBA)

    expect(resultado).toBe('activo')
    expect(estado.llamadas.rpc).toBe(1)
    expect(estado.ultimoRpcArgs).toEqual({ p_token: TOKEN_DE_PRUEBA, p_platform: 'android' })
    expect(Object.keys(estado.ultimoRpcArgs as object)).not.toContain('user_id')
  })

  it('nunca hace un insert ni un upsert directo en push_tokens', async () => {
    await registrarToken(TOKEN_DE_PRUEBA)

    expect(estado.llamadas.insert).toBe(0)
    expect(estado.llamadas.upsert).toBe(0)
  })

  it('si sale bien, guarda el token en SecureStore', async () => {
    await registrarToken(TOKEN_DE_PRUEBA)

    expect(almacenSeguro.get(`${CLAVE_TOKEN_PUSH}.0`)).toBe(TOKEN_DE_PRUEBA)
  })

  it('si la RPC devuelve error, da error-registro, sin reintento', async () => {
    estado.rpcError = { code: '42501', message: 'permission denied' }

    const resultado = await registrarToken(TOKEN_DE_PRUEBA)

    expect(resultado).toBe('error-registro')
    expect(estado.llamadas.rpc).toBe(1)
  })

  it('si la RPC tira una excepción, da error-registro sin tirar hacia afuera', async () => {
    const supabaseDoble = (await import('@/lib/supabase')).supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
    supabaseDoble.rpc.mockImplementationOnce(async () => {
      estado.llamadas.rpc++
      throw new Error('network error')
    })

    await expect(registrarToken(TOKEN_DE_PRUEBA)).resolves.toBe('error-registro')
  })
})

// ---------------------------------------------------------------------------
// borrarTokenDeEsteTelefono: nunca tira.
// ---------------------------------------------------------------------------
describe('borrarTokenDeEsteTelefono', () => {
  it('borra por token y limpia SecureStore', async () => {
    await registrarToken(TOKEN_DE_PRUEBA) // deja el token guardado
    estado.llamadas.delete = 0

    const resultado = await borrarTokenDeEsteTelefono()

    expect(resultado).toBe('ok')
    expect(estado.llamadas.delete).toBe(1)
    expect(estado.ultimoEqToken).toBe(TOKEN_DE_PRUEBA)
    expect(almacenSeguro.has(`${CLAVE_TOKEN_PUSH}.n`)).toBe(false)
  })

  it('un error de red devuelve error y no tira, y de todas formas limpia SecureStore', async () => {
    await registrarToken(TOKEN_DE_PRUEBA)
    estado.deleteRechaza = true

    const resultado = await borrarTokenDeEsteTelefono()

    expect(resultado).toBe('error')
    expect(almacenSeguro.has(`${CLAVE_TOKEN_PUSH}.n`)).toBe(false)
  })

  it('sin token guardado, no llama a Supabase y da ok', async () => {
    const resultado = await borrarTokenDeEsteTelefono()

    expect(resultado).toBe('ok')
    expect(estado.llamadas.delete).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// El token nunca se loguea.
// ---------------------------------------------------------------------------
describe('el token nunca se loguea', () => {
  function textoDeTodasLasLlamadas(spy: ReturnType<typeof vi.spyOn>): string {
    return spy.mock.calls.map((llamada) => llamada.map((arg) => String(arg)).join(' ')).join('\n')
  }

  it('camino feliz: ninguna llamada a console.* lleva el token', async () => {
    const espiaLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const espiaWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const espiaError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await sincronizarPush({ preguntar: true })

    for (const espia of [espiaLog, espiaWarn, espiaError]) {
      expect(textoDeTodasLasLlamadas(espia)).not.toContain(TOKEN_DE_PRUEBA)
    }
  })

  it('con error de FCM: la falla se loguea a lo sumo con code/name, nunca con el token (que ni se obtuvo)', async () => {
    const errorDeFcm = new Error('Default FirebaseApp is not initialized')
    estado.tokenError = errorDeFcm
    estado.permisoActual = { status: 'granted', canAskAgain: true, granted: true, expires: 'never' }
    const espiaWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await sincronizarPush({ preguntar: false })

    expect(textoDeTodasLasLlamadas(espiaWarn)).not.toContain(TOKEN_DE_PRUEBA)
  })

  it('con la RPC fallando (token sí obtenido): el token tampoco aparece en ningún console.*', async () => {
    estado.rpcError = { code: '42501', message: 'permission denied' }
    const espiaLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const espiaWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const espiaError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resultado = await registrarToken(TOKEN_DE_PRUEBA)

    expect(resultado).toBe('error-registro')
    for (const espia of [espiaLog, espiaWarn, espiaError]) {
      expect(textoDeTodasLasLlamadas(espia)).not.toContain(TOKEN_DE_PRUEBA)
    }
  })
})
