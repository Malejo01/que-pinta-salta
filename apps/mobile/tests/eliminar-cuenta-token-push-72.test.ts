// R72, 72-q (QPS-335): `limpiarTrasEliminarCuenta` borra el token de push
// guardado en el teléfono. Sin red ni base: todo con dobles, un solo registro
// ordenado de eventos para poder afirmar el ORDEN.
//
// Cómo se pone en rojo:
//   - sacar el bloque `borrarItemSeguro(CLAVE_TOKEN_PUSH)` de lib/cuenta.ts -> "borra el token"
//   - mover ese bloque después del `signOut`                               -> "antes del signOut"
//   - cambiarlo por `SecureStore.deleteItemAsync(CLAVE_TOKEN_PUSH)` (solo la clave pelada) -> "borra con removeItem de secure-storage"
//   - sacar el try/catch alrededor                                         -> "si removeItem tira, no tira"
//   - llamar a `borrarTokenDeEsteTelefono` (delete de push_tokens)         -> "no toca el servidor"
//   - agregar un console.* con el error o la clave                         -> "no loguea el token"
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKEN_DE_PRUEBA = 'ExponentPushToken[token-de-prueba-evidente]'

const estado = vi.hoisted(() => ({
  eventos: [] as string[],
  removeItemError: null as unknown,
  froms: [] as string[],
}))

vi.mock('@/lib/secure-storage', () => ({
  getItem: vi.fn(async () => null),
  setItem: vi.fn(async () => {}),
  removeItem: vi.fn(async (clave: string) => {
    estado.eventos.push(`removeItem:${clave}`)
    if (estado.removeItemError) throw estado.removeItemError
  }),
}))

vi.mock('@/lib/sin-conexion/cache', () => ({
  borrarTodaLaCache: vi.fn(async () => {
    estado.eventos.push('cache')
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(async () => {
        estado.eventos.push('signOut')
      }),
    },
    from: (tabla: string) => {
      estado.froms.push(tabla)
      throw new Error(`supabase.from(${tabla}) no debería llamarse al limpiar la cuenta`)
    },
    rpc: () => {
      estado.froms.push('rpc')
      throw new Error('supabase.rpc no debería llamarse al limpiar la cuenta')
    },
  },
}))

vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    signOut: vi.fn(async () => {
      estado.eventos.push('google')
    }),
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async (clave: string) => {
    estado.eventos.push(`deleteItemAsync:${clave}`)
  }),
}))

// Para importar `lib/push/registro.ts` (comparar la constante) sin nativo.
vi.mock('expo-notifications', () => ({ AndroidImportance: { DEFAULT: 3 } }))
vi.mock('expo-constants', () => ({ default: { easConfig: {}, expoConfig: {} } }))
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openSettings: vi.fn() } }))

import { removeItem } from '@/lib/secure-storage'
import { limpiarTrasEliminarCuenta } from '../lib/cuenta'
import { CLAVE_TOKEN_PUSH } from '../lib/push/clave-token'
import { CLAVE_TOKEN_PUSH as CLAVE_DESDE_REGISTRO } from '../lib/push/registro'

let consolas: Array<ReturnType<typeof vi.spyOn>>

beforeEach(() => {
  estado.eventos = []
  estado.froms = []
  estado.removeItemError = null
  vi.mocked(removeItem).mockClear()
  consolas = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
})

afterEach(() => {
  for (const c of consolas) c.mockRestore()
})

describe('la clave', () => {
  it("es 'push-token' y registro.ts re-exporta la misma", () => {
    expect(CLAVE_TOKEN_PUSH).toBe('push-token')
    expect(CLAVE_DESDE_REGISTRO).toBe(CLAVE_TOKEN_PUSH)
  })
})

describe('limpiarTrasEliminarCuenta: el token de push', () => {
  it("borra el token con removeItem de secure-storage y la clave 'push-token'", async () => {
    await limpiarTrasEliminarCuenta(false)
    expect(removeItem).toHaveBeenCalledTimes(1)
    expect(removeItem).toHaveBeenCalledWith('push-token')
    // No con SecureStore pelado: eso dejaría los pedazos `push-token.n` / `.0`.
    expect(estado.eventos.some((e) => e.startsWith('deleteItemAsync:push-token'))).toBe(false)
  })

  it('lo borra antes del signOut', async () => {
    await limpiarTrasEliminarCuenta(false)
    const iToken = estado.eventos.indexOf('removeItem:push-token')
    const iSignOut = estado.eventos.indexOf('signOut')
    expect(iToken).toBeGreaterThanOrEqual(0)
    expect(iSignOut).toBeGreaterThan(iToken)
  })

  it('si removeItem tira, la función no tira y sigue con signOut, Google y la bandera', async () => {
    estado.removeItemError = new Error(`no se pudo borrar ${TOKEN_DE_PRUEBA}`)
    await expect(limpiarTrasEliminarCuenta(true)).resolves.toBeUndefined()
    expect(estado.eventos).toContain('signOut')
    expect(estado.eventos).toContain('google')
    expect(estado.eventos).toContain('deleteItemAsync:qps.bienvenida.vista')
  })

  it('con entroConGoogle=false no llama a Google, y aun así borra token, sesión y bandera', async () => {
    await limpiarTrasEliminarCuenta(false)
    expect(estado.eventos).not.toContain('google')
    expect(estado.eventos).toEqual(['cache', 'removeItem:push-token', 'signOut', 'deleteItemAsync:qps.bienvenida.vista'])
  })

  it('no toca el servidor: ni from(push_tokens) ni rpc', async () => {
    await limpiarTrasEliminarCuenta(true)
    expect(estado.froms).toEqual([])
  })

  it('no loguea nada que contenga el token (ni cuando removeItem tira con el token en el mensaje)', async () => {
    estado.removeItemError = new Error(`falló con ${TOKEN_DE_PRUEBA}`)
    await limpiarTrasEliminarCuenta(true)
    const texto = consolas.flatMap((c) => c.mock.calls).map((args) => args.map(String).join(' ')).join('\n')
    expect(texto).not.toContain(TOKEN_DE_PRUEBA)
    expect(texto).not.toContain('ExponentPushToken')
  })

  it('no loguea nada en el camino feliz', async () => {
    await limpiarTrasEliminarCuenta(false)
    for (const c of consolas) expect(c).not.toHaveBeenCalled()
  })
})
