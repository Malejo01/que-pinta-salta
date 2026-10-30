// 82-e: pendientes de la revisión del #137 (R81). Sin red ni módulos nativos.
//  1. El camino "pendiente tras login" (detector sobre el fuente).
//  2. La hoja de la campaña no reaparece si SecureStore no guarda.
//  3. "Activar" no apaga los patrocinados de una cuenta que ya tenía fila.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const almacen = vi.hoisted(() => ({
  valores: new Map<string, string>(),
  // 'tira': setItemAsync lanza; 'ignora': no lanza pero no guarda.
  escritura: 'ok' as 'ok' | 'tira' | 'ignora',
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (clave: string) => almacen.valores.get(clave) ?? null),
  setItemAsync: vi.fn(async (clave: string, valor: string) => {
    if (almacen.escritura === 'tira') throw new Error('SecureStore no disponible')
    if (almacen.escritura === 'ignora') return
    almacen.valores.set(clave, valor)
  }),
  deleteItemAsync: vi.fn(async (clave: string) => {
    almacen.valores.delete(clave)
  }),
}))

// Respaldo persistente (AsyncStorage): vive fuera del módulo, así que sobrevive
// a `vi.resetModules()` igual que sobrevive a un arranque en frío.
const respaldo = vi.hoisted(() => ({
  valores: new Map<string, string>(),
  falla: false,
  escrituras: 0,
}))

vi.mock('@/lib/sin-conexion/almacen', () => ({
  almacenPorDefecto: {
    leer: async (clave: string) => {
      if (respaldo.falla) throw new Error('AsyncStorage no disponible')
      return respaldo.valores.get(clave) ?? null
    },
    escribir: async (clave: string, valor: string) => {
      if (respaldo.falla) throw new Error('AsyncStorage no disponible')
      respaldo.escrituras += 1
      respaldo.valores.set(clave, valor)
    },
    borrar: async (clave: string) => {
      respaldo.valores.delete(clave)
    },
    claves: async () => [...respaldo.valores.keys()],
    borrarVarias: async () => {},
  },
}))

const supabaseDoble = vi.hoisted(() => ({
  fila: null as Record<string, unknown> | null,
  lecturaError: null as unknown,
  lecturaArroja: false,
  upserts: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (supabaseDoble.lecturaArroja) throw new Error('Network request failed')
            return { data: supabaseDoble.fila, error: supabaseDoble.lecturaError }
          },
        }),
      }),
      upsert: async (valores: Record<string, unknown>) => {
        supabaseDoble.upserts.push(valores)
        return { error: null }
      },
    }),
  },
}))

import { activarPreferenciasAlAceptar } from '../lib/notificaciones'

const leerFuente = (rutaRelativa: string) => readFileSync(fileURLToPath(new URL(`../${rutaRelativa}`, import.meta.url)), 'utf8')
const sinComentarios = (src: string) => src.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

beforeEach(() => {
  almacen.valores.clear()
  almacen.escritura = 'ok'
  respaldo.valores.clear()
  respaldo.falla = false
  respaldo.escrituras = 0
  supabaseDoble.fila = null
  supabaseDoble.lecturaError = null
  supabaseDoble.lecturaArroja = false
  supabaseDoble.upserts = []
})

describe('1. pendiente tras login (InvitacionTrasAccion)', () => {
  const codigo = sinComentarios(leerFuente('components/InvitacionAvisos.tsx'))
  const inicio = codigo.indexOf('avisosPendientesLogin()')
  const efecto = inicio === -1 ? '' : codigo.slice(inicio, codigo.indexOf('[userId, cargando, estado, sincronizado]'))

  it('encuentra el efecto', () => {
    expect(inicio).toBeGreaterThan(-1)
    expect(efecto.length).toBeGreaterThan(0)
  })

  it('`pendiente` sale de avisosPendientesLogin() y se pasa a accionTrasLogin (no un literal)', () => {
    expect(efecto).toMatch(/avisosPendientesLogin\(\)\.then\(async \(pendiente\) =>/)
    expect(efecto).toMatch(/accionTrasLogin\(\{\s*pendiente,/)
    expect(efecto).not.toMatch(/pendiente\s*:\s*(true|false)/)
  })

  it('activarRef.current() se llama una sola vez y solo si accion === "activar"', () => {
    expect([...codigo.matchAll(/activarRef\.current\(/g)]).toHaveLength(1)
    expect(efecto).toMatch(/if \(accion === 'activar'\) await activarRef\.current\(\)/)
    expect(efecto).toMatch(/const accion = accionTrasLogin\(/)
  })

  it('la bandera se borra antes de activar, y con accion "nada" se sale sin hacer nada', () => {
    const iNada = efecto.indexOf("if (accion === 'nada') return")
    const iBorrar = efecto.indexOf('await borrarAvisosPendientesLogin()')
    const iActivar = efecto.indexOf('activarRef.current()')
    expect(iNada).toBeGreaterThan(-1)
    expect(iBorrar).toBeGreaterThan(iNada)
    expect(iActivar).toBeGreaterThan(iBorrar)
  })
})

describe('2. campaña: SecureStore no guarda', () => {
  async function cargar() {
    vi.resetModules()
    return import('../lib/push/invitacion')
  }

  it.each(['tira', 'ignora'] as const)('escritura que %s: la lectura da "hecha" de esta versión', async (modo) => {
    const m = await cargar()
    almacen.escritura = modo
    await m.posponerCampania()
    expect(await m.leerRegistroCampania()).toEqual({ version: m.VERSION_CAMPANIA_AVISOS, hecha: true })
    expect(
      m.debeMostrarCampania({
        estado: 'sin-pedir',
        sincronizado: true,
        cargando: false,
        registro: await m.leerRegistroCampania(),
        ahora: Date.now(),
      })
    ).toBe(false)
  })

  it.each(['tira', 'ignora'] as const)('escritura que %s: un arranque nuevo lee "hecha" del respaldo persistente', async (modo) => {
    const m1 = await cargar()
    almacen.escritura = modo
    await m1.posponerCampania()
    expect(respaldo.valores.get(m1.CLAVE_CAMPANIA_AVISOS_RESPALDO)).toBe(
      JSON.stringify({ version: m1.VERSION_CAMPANIA_AVISOS, hecha: true })
    )
    // Arranque en frío: módulo nuevo (sin memoria), mismo almacenamiento.
    const m2 = await cargar()
    expect(await m2.leerRegistroCampania()).toEqual({ version: m2.VERSION_CAMPANIA_AVISOS, hecha: true })
  })

  it('SecureStore y AsyncStorage fallan: queda el respaldo en memoria del proceso', async () => {
    const m = await cargar()
    almacen.escritura = 'tira'
    respaldo.falla = true
    await m.posponerCampania()
    expect(await m.leerRegistroCampania()).toEqual({ version: m.VERSION_CAMPANIA_AVISOS, hecha: true })
  })

  it('respaldo ilegible (AsyncStorage falla al leer) y SecureStore vacío: null, no se inventa "hecha"', async () => {
    const m = await cargar()
    respaldo.falla = true
    expect(await m.leerRegistroCampania()).toBeNull()
  })

  it('respaldo de otra versión: no cuenta', async () => {
    const m = await cargar()
    respaldo.valores.set(m.CLAVE_CAMPANIA_AVISOS_RESPALDO, JSON.stringify({ version: 'otra', hecha: true }))
    expect(await m.leerRegistroCampania()).toBeNull()
  })

  it('SecureStore guarda bien: no se escribe el respaldo', async () => {
    const m = await cargar()
    await m.marcarCampaniaHecha()
    expect(respaldo.escrituras).toBe(0)
    expect(respaldo.valores.size).toBe(0)
  })

  it('la clave del respaldo no cae en los prefijos que se borran en masa', () => {
    const clave = 'qps.push.campania.respaldo'
    expect(clave.startsWith('qps:cache:')).toBe(false)
    expect(clave.startsWith('qps:busquedas:')).toBe(false)
  })

  it('escritura OK: no hay respaldo, se lee lo guardado', async () => {
    const m = await cargar()
    await m.posponerCampania(1000)
    expect(await m.leerRegistroCampania()).toEqual({
      version: m.VERSION_CAMPANIA_AVISOS,
      posponerHasta: 1000 + m.PLAZO_POSPONER_CAMPANIA_MS,
    })
  })

  it('sin guardar nada nunca: sigue siendo null (se puede preguntar)', async () => {
    const m = await cargar()
    expect(await m.leerRegistroCampania()).toBeNull()
  })
})

describe('3. activarPreferenciasAlAceptar y sponsored', () => {
  it('lectura OK y sin fila: sponsored false explícito', async () => {
    supabaseDoble.fila = null
    await activarPreferenciasAlAceptar('u1')
    expect(supabaseDoble.upserts[0]).toEqual({ user_id: 'u1', announcements: true, radar_channel: 'ambos', sponsored: false })
  })

  it('lectura OK y con fila: no se manda sponsored', async () => {
    supabaseDoble.fila = { radar_channel: 'push', sponsored: true }
    await activarPreferenciasAlAceptar('u1')
    expect(supabaseDoble.upserts[0]).toEqual({ user_id: 'u1', announcements: true, radar_channel: 'push' })
    expect(Object.keys(supabaseDoble.upserts[0])).not.toContain('sponsored')
  })

  it.each([
    ['error', () => { supabaseDoble.lecturaError = { code: '500', message: 'x' } }],
    ['excepción', () => { supabaseDoble.lecturaArroja = true }],
  ])('lectura con %s: sponsored false (ante la duda, nunca prender publicidad)', async (_n, provocar) => {
    supabaseDoble.fila = { radar_channel: 'push', sponsored: true }
    provocar()
    await activarPreferenciasAlAceptar('u1')
    expect(supabaseDoble.upserts[0]).toEqual({ user_id: 'u1', announcements: true, sponsored: false })
  })
})
