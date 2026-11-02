// R82 / Q4-2: avisos sin sesión en la app. Sin red, sin base y sin teléfono:
// dobles de `expo-notifications`, `react-native`, `expo-constants`,
// `@/lib/supabase` y `expo-secure-store`; la API se inyecta (`deps.api`) o se
// prueba con un `fetch` falso.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKEN = 'ExponentPushToken[sin-sesion-1]'
const DEVICE = '0f8fad5b-d9cb-469f-a165-70867728950e'

const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: unknown }[],
  rpcError: null as unknown,
  rpcTira: false,
  borrados: 0,
  prefsFila: null as unknown,
  prefsError: null as unknown,
  upserts: [] as unknown[],
}))

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  setNotificationChannelAsync: vi.fn(async () => null),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: TOKEN })),
  AndroidImportance: { DEFAULT: 3 },
}))
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openSettings: vi.fn(async () => {}) } }))
vi.mock('expo-constants', () => ({ default: { easConfig: { projectId: 'p' }, expoConfig: { extra: { eas: { projectId: 'p' } } } } }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async (fn: string, args: unknown) => {
      estado.rpc.push({ fn, args })
      if (estado.rpcTira) throw new Error('red')
      return { data: true, error: estado.rpcError }
    }),
    from: (tabla: string) => {
      const b: Record<string, unknown> = {}
      b.delete = () => b
      b.select = () => b
      b.eq = (_c: string) => {
        if (tabla === 'push_tokens') {
          estado.borrados++
          return Promise.resolve({ data: null, error: null })
        }
        return b
      }
      b.maybeSingle = async () => ({ data: estado.prefsFila, error: estado.prefsError })
      b.upsert = async (v: unknown) => {
        estado.upserts.push(v)
        return { error: null }
      }
      return b
    },
  },
}))
const almacen = new Map<string, string>()
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => (almacen.has(k) ? almacen.get(k)! : null)),
  setItemAsync: vi.fn(async (k: string, v: string) => void almacen.set(k, v)),
  deleteItemAsync: vi.fn(async (k: string) => void almacen.delete(k)),
}))

import { cambiarPreferenciasAnonimas, registrarAnonimo, urlApi, URL_API_POR_DEFECTO } from '../lib/push/api'
import {
  CLAVE_TOKEN_PUSH,
  cambiarAvisosDeEsteTelefono,
  desvincularTokenDeEsteTelefono,
  registrarToken,
  sincronizarPush,
  type ApiPush,
} from '../lib/push/registro'
import { CLAVE_AVISOS_ANONIMOS, CLAVE_AVISOS_APAGAR_TRAS_BAJA, CLAVE_DEVICE_ID } from '../lib/push/clave-token'
import { avisosVisibles, leerAvisosAnonimos } from '../lib/push/dispositivo'
import { sembrarPreferenciasDeCuenta } from '../lib/notificaciones'
import { getItem, setItem } from '../lib/secure-storage'

function apiFalsa(opciones: { registro?: Awaited<ReturnType<ApiPush['registrarAnonimo']>>; prefs?: { ok: boolean } } = {}) {
  const llamadas: { fn: string; datos: Record<string, unknown> }[] = []
  const api: ApiPush = {
    registrarAnonimo: vi.fn(async (datos: Record<string, unknown>) => {
      llamadas.push({ fn: 'registrar', datos })
      return opciones.registro ?? { ok: true as const, deviceId: DEVICE, avisosEquipo: true, avisosPatrocinados: false }
    }) as unknown as ApiPush['registrarAnonimo'],
    cambiarPreferenciasAnonimas: vi.fn(async (datos: Record<string, unknown>) => {
      llamadas.push({ fn: 'preferencias', datos })
      return (opciones.prefs ?? { ok: true }) as { ok: true }
    }) as unknown as ApiPush['cambiarPreferenciasAnonimas'],
  }
  return { api, llamadas }
}

let avisos: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  almacen.clear()
  estado.rpc = []
  estado.rpcError = null
  estado.rpcTira = false
  estado.borrados = 0
  estado.prefsFila = null
  estado.prefsError = null
  estado.upserts = []
  avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  const texto = JSON.stringify(avisos.mock.calls)
  expect(texto).not.toContain('sin-sesion-1')
  expect(texto).not.toContain(DEVICE)
  vi.restoreAllMocks()
})

describe('lib/push/api', () => {
  it('URL por defecto, pisable solo con https', () => {
    expect(urlApi(undefined)).toBe(URL_API_POR_DEFECTO)
    expect(urlApi('https://preview.example.com/')).toBe('https://preview.example.com')
    expect(urlApi('http://inseguro.com')).toBe(URL_API_POR_DEFECTO)
    expect(urlApi('https://x.com/ruta')).toBe(URL_API_POR_DEFECTO)
  })

  it('registrarAnonimo arma el cuerpo y entiende las respuestas', async () => {
    const fetchFalso = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN, plataforma: 'android', idioma: 'es' })
      return new Response(JSON.stringify({ ok: true, registrado: true, deviceId: DEVICE, avisosEquipo: true, avisosPatrocinados: false }))
    })
    const r = await registrarAnonimo({ token: TOKEN, plataforma: 'android', idioma: 'es' }, fetchFalso as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, deviceId: DEVICE, avisosEquipo: true, avisosPatrocinados: false })
    expect(String(fetchFalso.mock.calls[0][0])).toBe(`${URL_API_POR_DEFECTO}/api/push/registrar`)
  })

  it.each([
    [new Response(JSON.stringify({ ok: true, registrado: false })), 'otro-dispositivo'],
    [new Response('{}', { status: 429 }), 'limite'],
    [new Response('{}', { status: 404 }), 'invalido'],
    [new Response('{}', { status: 500 }), 'servidor'],
  ])('registrarAnonimo nunca tira: %#', async (respuesta, motivo) => {
    const r = await registrarAnonimo({ token: TOKEN, plataforma: 'android', deviceId: DEVICE }, (async () => respuesta) as unknown as typeof fetch)
    expect(r).toEqual({ ok: false, motivo })
  })

  it('red caída: { ok: false, motivo: red } en las dos funciones', async () => {
    const roto = (async () => {
      throw new TypeError('Network request failed')
    }) as unknown as typeof fetch
    expect(await registrarAnonimo({ token: TOKEN, plataforma: 'ios' }, roto)).toEqual({ ok: false, motivo: 'red' })
    expect(await cambiarPreferenciasAnonimas({ token: TOKEN, deviceId: DEVICE, avisosEquipo: false }, roto)).toEqual({ ok: false, motivo: 'red' })
  })
})

describe('registrarToken / sincronizarPush sin sesión', () => {
  it('sin sesión: llama a la API y NO a la RPC; guarda deviceId, interruptores y token', async () => {
    const { api, llamadas } = apiFalsa()
    const r = await registrarToken(TOKEN, { api }, { conSesion: false })
    expect(r).toBe('activo')
    expect(llamadas.map((l) => l.fn)).toEqual(['registrar'])
    expect(estado.rpc).toEqual([])
    expect(await getItem(CLAVE_DEVICE_ID)).toBe(DEVICE)
    expect(await getItem(CLAVE_TOKEN_PUSH)).toBe(TOKEN)
    expect(JSON.parse((await getItem(CLAVE_AVISOS_ANONIMOS))!)).toEqual({ avisosEquipo: true, avisosPatrocinados: false })
  })

  it('manda el deviceId guardado en los registros siguientes', async () => {
    await setItem(CLAVE_DEVICE_ID, DEVICE)
    const { api, llamadas } = apiFalsa()
    await registrarToken(TOKEN, { api }, { conSesion: false })
    expect(llamadas[0].datos.deviceId).toBe(DEVICE)
  })

  it('sin sesión y la API falla (o token de otro dispositivo): error-registro', async () => {
    const { api } = apiFalsa({ registro: { ok: false, motivo: 'otro-dispositivo' } })
    expect(await registrarToken(TOKEN, { api }, { conSesion: false })).toBe('error-registro')
  })

  it('con sesión: primero la API (device_id) y después la RPC de vínculo', async () => {
    const orden: string[] = []
    const { api } = apiFalsa()
    ;(api.registrarAnonimo as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      orden.push('api')
      return { ok: true, deviceId: DEVICE, avisosEquipo: true, avisosPatrocinados: false }
    })
    const r = await registrarToken(TOKEN, { api })
    orden.push(...estado.rpc.map((x) => x.fn))
    expect(r).toBe('activo')
    expect(orden).toEqual(['api', 'register_push_token'])
  })

  it('con sesión, si la API falla igual registra por la RPC (como antes de la R82)', async () => {
    const { api } = apiFalsa({ registro: { ok: false, motivo: 'servidor' } })
    expect(await registrarToken(TOKEN, { api })).toBe('activo')
    expect(estado.rpc.map((x) => x.fn)).toEqual(['register_push_token'])
  })

  it('sincronizarPush({ preguntar: false, conSesion: false }) con permiso concedido registra sin cuenta', async () => {
    const { api, llamadas } = apiFalsa()
    expect(await sincronizarPush({ preguntar: false, conSesion: false }, { api })).toBe('activo')
    expect(llamadas.map((l) => l.fn)).toEqual(['registrar'])
  })
})

describe('eliminar la cuenta apaga los avisos de ese teléfono (decisión 6)', () => {
  it('con la marca, el registro sin cuenta apaga los dos interruptores y borra la marca', async () => {
    await setItem(CLAVE_AVISOS_APAGAR_TRAS_BAJA, '1')
    const { api, llamadas } = apiFalsa()
    await registrarToken(TOKEN, { api }, { conSesion: false })
    expect(llamadas[1]).toEqual({
      fn: 'preferencias',
      datos: { token: TOKEN, deviceId: DEVICE, avisosEquipo: false, avisosPatrocinados: false },
    })
    expect(await getItem(CLAVE_AVISOS_APAGAR_TRAS_BAJA)).toBeNull()
    expect(await leerAvisosAnonimos({ getItem, setItem, removeItem: async () => {} })).toEqual({
      avisosEquipo: false,
      avisosPatrocinados: false,
    })
  })

  it('si el apagado falla, la marca queda para el próximo arranque', async () => {
    await setItem(CLAVE_AVISOS_APAGAR_TRAS_BAJA, '1')
    const { api } = apiFalsa({ prefs: { ok: false } })
    await registrarToken(TOKEN, { api }, { conSesion: false })
    expect(await getItem(CLAVE_AVISOS_APAGAR_TRAS_BAJA)).toBe('1')
  })

  it('lib/cuenta.ts deja la marca al eliminar la cuenta y no borra el device_id', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../lib/cuenta.ts'), 'utf8')
    expect(src).toMatch(/guardarItemSeguro\(CLAVE_AVISOS_APAGAR_TRAS_BAJA, '1'\)/)
    expect(src).not.toMatch(/CLAVE_DEVICE_ID/)
  })
})

describe('desvincularTokenDeEsteTelefono (cerrar sesión)', () => {
  it('llama a unlink_push_token con el token guardado y NO borra la fila ni el token', async () => {
    await setItem(CLAVE_TOKEN_PUSH, TOKEN)
    expect(await desvincularTokenDeEsteTelefono()).toBe('ok')
    expect(estado.rpc).toEqual([{ fn: 'unlink_push_token', args: { p_token: TOKEN } }])
    expect(estado.borrados).toBe(0)
    expect(await getItem(CLAVE_TOKEN_PUSH)).toBe(TOKEN)
  })

  it('si la RPC falla, cae al borrado de antes (teléfono compartido)', async () => {
    await setItem(CLAVE_TOKEN_PUSH, TOKEN)
    estado.rpcError = { code: 'PGRST202' }
    expect(await desvincularTokenDeEsteTelefono()).toBe('ok')
    expect(estado.borrados).toBe(1)
    expect(await getItem(CLAVE_TOKEN_PUSH)).toBeNull()
  })

  it('si la RPC tira, también cae al borrado y no tira', async () => {
    await setItem(CLAVE_TOKEN_PUSH, TOKEN)
    estado.rpcTira = true
    await expect(desvincularTokenDeEsteTelefono()).resolves.toBe('ok')
    expect(estado.borrados).toBe(1)
  })

  it('sin token guardado no llama a nada', async () => {
    expect(await desvincularTokenDeEsteTelefono()).toBe('ok')
    expect(estado.rpc).toEqual([])
  })
})

describe('cambiarAvisosDeEsteTelefono (interruptores de Cuenta sin sesión)', () => {
  it('manda token + deviceId guardados y guarda el estado nuevo', async () => {
    await setItem(CLAVE_TOKEN_PUSH, TOKEN)
    await setItem(CLAVE_DEVICE_ID, DEVICE)
    const { api, llamadas } = apiFalsa()
    const r = await cambiarAvisosDeEsteTelefono({ avisosPatrocinados: true }, { api })
    expect(r).toEqual({ ok: true, avisos: { avisosEquipo: true, avisosPatrocinados: true } })
    expect(llamadas[0].datos).toEqual({ token: TOKEN, deviceId: DEVICE, avisosPatrocinados: true })
  })

  it('sin registro previo (sin token o sin deviceId): { ok: false } sin llamar a la API', async () => {
    const { api, llamadas } = apiFalsa()
    expect(await cambiarAvisosDeEsteTelefono({ avisosEquipo: false }, { api })).toEqual({ ok: false })
    expect(llamadas).toEqual([])
  })
})

describe('sembrarPreferenciasDeCuenta (al entrar a la cuenta)', () => {
  const avisosTelefono = async () => ({ avisosEquipo: true, avisosPatrocinados: false })

  it('sin fila de preferencias: siembra con lo del teléfono', async () => {
    expect(await sembrarPreferenciasDeCuenta('u1', avisosTelefono)).toBe('sembradas')
    expect(estado.upserts).toEqual([{ user_id: 'u1', announcements: true, sponsored: false }])
  })

  it('con fila: no toca nada (mandan las de la cuenta)', async () => {
    estado.prefsFila = { user_id: 'u1' }
    expect(await sembrarPreferenciasDeCuenta('u1', avisosTelefono)).toBe('sin-cambios')
    expect(estado.upserts).toEqual([])
  })

  it('lectura que falla o sin estado del teléfono: no siembra', async () => {
    estado.prefsError = { code: 'x' }
    expect(await sembrarPreferenciasDeCuenta('u1', avisosTelefono)).toBe('sin-cambios')
    estado.prefsError = null
    expect(await sembrarPreferenciasDeCuenta('u1', async () => null)).toBe('sin-cambios')
    expect(estado.upserts).toEqual([])
  })
})

describe('AvisosSinSesion: qué muestran los interruptores', () => {
  it('sin permiso activo, los dos apagados; con permiso, lo guardado o equipo sí / patrocinados no', () => {
    expect(avisosVisibles(false, { avisosEquipo: true, avisosPatrocinados: true })).toEqual({ avisosEquipo: false, avisosPatrocinados: false })
    expect(avisosVisibles(true, null)).toEqual({ avisosEquipo: true, avisosPatrocinados: false })
    expect(avisosVisibles(true, { avisosEquipo: false, avisosPatrocinados: true })).toEqual({ avisosEquipo: false, avisosPatrocinados: true })
  })
})
