// R81, 81-b: pedir los avisos al principio. Sin red ni módulos nativos:
// SecureStore y Supabase van con dobles en memoria.
//
// Qué se vigila: la regla pura de "cuándo mostrar" la campaña
// (`debeMostrarCampania`), qué hacer tras iniciar sesión (`accionTrasLogin`),
// la regla del canal del Radar, el upsert de `activarPreferenciasAlAceptar`
// (tres columnas, `sponsored: false`) y, por texto, que la Bienvenida no pida
// el permiso en frío.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const almacen = vi.hoisted(() => ({
  valores: new Map<string, string>(),
  falla: { lectura: false, escritura: false },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (clave: string) => {
    if (almacen.falla.lectura) throw new Error('SecureStore no disponible')
    return almacen.valores.get(clave) ?? null
  }),
  setItemAsync: vi.fn(async (clave: string, valor: string) => {
    if (almacen.falla.escritura) throw new Error('SecureStore no disponible')
    almacen.valores.set(clave, valor)
  }),
  deleteItemAsync: vi.fn(async (clave: string) => {
    almacen.valores.delete(clave)
  }),
}))

const supabaseDoble = vi.hoisted(() => ({
  canalActual: null as string | null,
  upserts: [] as { valores: Record<string, unknown>; opciones: unknown }[],
  error: null as unknown,
  lecturaError: null as unknown,
  lecturaArroja: false,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (supabaseDoble.lecturaArroja) throw new Error('Network request failed')
            return {
              data: supabaseDoble.canalActual === null ? null : { radar_channel: supabaseDoble.canalActual },
              error: supabaseDoble.lecturaError,
            }
          },
        }),
      }),
      upsert: async (valores: Record<string, unknown>, opciones: unknown) => {
        supabaseDoble.upserts.push({ valores, opciones })
        return { error: supabaseDoble.error }
      },
    }),
  },
}))

import {
  CLAVE_AVISOS_PENDIENTE_LOGIN,
  CLAVE_CAMPANIA_AVISOS,
  PLAZO_POSPONER_CAMPANIA_MS,
  VERSION_CAMPANIA_AVISOS,
  accionTrasLogin,
  avisosPendientesLogin,
  borrarAvisosPendientesLogin,
  debeMostrarCampania,
  leerRegistroCampania,
  marcarAvisosPendientesLogin,
  marcarCampaniaHecha,
  posponerCampania,
} from '../lib/push/invitacion'
import type { EstadoPush } from '../lib/push/estado'
import { activarPreferenciasAlAceptar, canalRadarAlAceptar } from '../lib/notificaciones'

const leerFuente = (rutaRelativa: string) => readFileSync(fileURLToPath(new URL(`../${rutaRelativa}`, import.meta.url)), 'utf8')

beforeEach(() => {
  almacen.valores.clear()
  almacen.falla.lectura = false
  almacen.falla.escritura = false
  supabaseDoble.canalActual = null
  supabaseDoble.upserts = []
  supabaseDoble.error = null
  supabaseDoble.lecturaError = null
  supabaseDoble.lecturaArroja = false
})

const AHORA = 1_800_000_000_000
const base = { estado: 'sin-pedir' as EstadoPush, sincronizado: true, cargando: false, registro: null, ahora: AHORA, version: '6' }

describe('debeMostrarCampania', () => {
  it('sin sesión, cargando o sin sincronizar: no', () => {
    expect(debeMostrarCampania({ ...base, estado: 'sin-sesion' })).toBe(false)
    expect(debeMostrarCampania({ ...base, cargando: true })).toBe(false)
    expect(debeMostrarCampania({ ...base, sincronizado: false })).toBe(false)
  })

  it('sin-pedir y denegado sin registro: sí', () => {
    expect(debeMostrarCampania({ ...base, estado: 'sin-pedir' })).toBe(true)
    expect(debeMostrarCampania({ ...base, estado: 'denegado' })).toBe(true)
  })

  it.each(['activo', 'bloqueado', 'no-disponible', 'pidiendo', 'error-registro'] as EstadoPush[])('estado %s: no', (estado) => {
    expect(debeMostrarCampania({ ...base, estado })).toBe(false)
  })

  it('misma versión hecha: no', () => {
    expect(debeMostrarCampania({ ...base, registro: { version: '6', hecha: true } })).toBe(false)
  })

  it('pospuesta: no antes de 7 días, sí desde los 7 días', () => {
    const hasta = AHORA + PLAZO_POSPONER_CAMPANIA_MS
    expect(PLAZO_POSPONER_CAMPANIA_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(debeMostrarCampania({ ...base, registro: { version: '6', posponerHasta: hasta }, ahora: hasta - 1 })).toBe(false)
    expect(debeMostrarCampania({ ...base, registro: { version: '6', posponerHasta: hasta }, ahora: hasta })).toBe(true)
  })

  it('versión nueva: sí, aunque la anterior estuviera hecha o pospuesta', () => {
    expect(debeMostrarCampania({ ...base, registro: { version: '5', hecha: true } })).toBe(true)
    expect(debeMostrarCampania({ ...base, registro: { version: '5', posponerHasta: AHORA + 1000 } })).toBe(true)
  })

  it('la versión de campaña es la 6', () => {
    expect(VERSION_CAMPANIA_AVISOS).toBe('6')
  })
})

describe('accionTrasLogin', () => {
  it('pendiente + sincronizado + sin-pedir o denegado: activar', () => {
    expect(accionTrasLogin({ pendiente: true, estado: 'sin-pedir', sincronizado: true })).toBe('activar')
    expect(accionTrasLogin({ pendiente: true, estado: 'denegado', sincronizado: true })).toBe('activar')
  })

  it('sin bandera: nada', () => {
    for (const estado of ['sin-pedir', 'activo', 'denegado'] as EstadoPush[]) {
      expect(accionTrasLogin({ pendiente: false, estado, sincronizado: true })).toBe('nada')
    }
  })

  it('pendiente + activo, bloqueado o no-disponible: solo borrar', () => {
    for (const estado of ['activo', 'bloqueado', 'no-disponible'] as EstadoPush[]) {
      expect(accionTrasLogin({ pendiente: true, estado, sincronizado: true })).toBe('borrar')
    }
  })

  it('sin sincronizar o en tránsito: todavía nada', () => {
    expect(accionTrasLogin({ pendiente: true, estado: 'sin-pedir', sincronizado: false })).toBe('nada')
    expect(accionTrasLogin({ pendiente: true, estado: 'pidiendo', sincronizado: true })).toBe('nada')
    expect(accionTrasLogin({ pendiente: true, estado: 'sin-sesion', sincronizado: true })).toBe('nada')
  })
})

describe('guardado en SecureStore', () => {
  it('las claves son válidas para SecureStore', () => {
    expect(CLAVE_CAMPANIA_AVISOS).toBe('qps.push.campania')
    expect(CLAVE_AVISOS_PENDIENTE_LOGIN).toBe('qps.push.pendiente-login')
  })

  it('sin nada guardado: registro null; hecha y pospuesta se leen de vuelta', async () => {
    expect(await leerRegistroCampania()).toBeNull()
    await marcarCampaniaHecha()
    expect(await leerRegistroCampania()).toEqual({ version: VERSION_CAMPANIA_AVISOS, hecha: true })
    await posponerCampania(AHORA)
    expect(await leerRegistroCampania()).toEqual({ version: VERSION_CAMPANIA_AVISOS, posponerHasta: AHORA + PLAZO_POSPONER_CAMPANIA_MS })
  })

  it('si la lectura falla o el contenido está roto, no se muestra (nunca insistir)', async () => {
    almacen.falla.lectura = true
    const registro = await leerRegistroCampania()
    expect(debeMostrarCampania({ ...base, registro, version: VERSION_CAMPANIA_AVISOS })).toBe(false)
    almacen.falla.lectura = false
    almacen.valores.set(CLAVE_CAMPANIA_AVISOS, '{no es json')
    expect(debeMostrarCampania({ ...base, registro: await leerRegistroCampania(), version: VERSION_CAMPANIA_AVISOS })).toBe(false)
  })

  it('si la escritura falla, no tira', async () => {
    almacen.falla.escritura = true
    await expect(marcarCampaniaHecha()).resolves.toBeUndefined()
    await expect(posponerCampania()).resolves.toBeUndefined()
    await expect(marcarAvisosPendientesLogin()).resolves.toBeUndefined()
  })

  it('la bandera pendiente se marca, se lee y se borra; si la lectura falla, es false', async () => {
    expect(await avisosPendientesLogin()).toBe(false)
    await marcarAvisosPendientesLogin()
    expect(await avisosPendientesLogin()).toBe(true)
    await borrarAvisosPendientesLogin()
    expect(await avisosPendientesLogin()).toBe(false)
    await marcarAvisosPendientesLogin()
    almacen.falla.lectura = true
    expect(await avisosPendientesLogin()).toBe(false)
  })
})

describe('regla del canal del Radar', () => {
  it('email -> ambos; push -> push; ambos -> ambos', () => {
    expect(canalRadarAlAceptar('email')).toBe('ambos')
    expect(canalRadarAlAceptar('push')).toBe('push')
    expect(canalRadarAlAceptar('ambos')).toBe('ambos')
  })

  it('sin valor o raro: ambos', () => {
    expect(canalRadarAlAceptar(null)).toBe('ambos')
    expect(canalRadarAlAceptar(undefined)).toBe('ambos')
    expect(canalRadarAlAceptar('sms')).toBe('ambos')
  })
})

describe('activarPreferenciasAlAceptar', () => {
  it.each([
    ['email', 'ambos'],
    ['push', 'push'],
    ['ambos', 'ambos'],
    [null, 'ambos'],
  ])('canal actual %s: upsert de solo tres columnas, con sponsored false', async (actual, esperado) => {
    supabaseDoble.canalActual = actual
    const r = await activarPreferenciasAlAceptar('usuario-1')
    expect(r).toEqual({ ok: true })
    expect(supabaseDoble.upserts).toEqual([
      {
        valores: { user_id: 'usuario-1', announcements: true, radar_channel: esperado, sponsored: false },
        opciones: { onConflict: 'user_id' },
      },
    ])
  })

  it.each([
    ['error de la lectura', () => { supabaseDoble.lecturaError = { code: '500', message: 'x' } }],
    ['excepción en la lectura', () => { supabaseDoble.lecturaArroja = true }],
  ])('%s: el upsert va SIN radar_channel (no pisa un push ya elegido)', async (_nombre, provocar) => {
    supabaseDoble.canalActual = 'push'
    provocar()
    const r = await activarPreferenciasAlAceptar('usuario-1')
    expect(r).toEqual({ ok: true })
    expect(supabaseDoble.upserts).toHaveLength(1)
    expect(supabaseDoble.upserts[0].valores).toEqual({ user_id: 'usuario-1', announcements: true, sponsored: false })
    expect(Object.keys(supabaseDoble.upserts[0].valores)).not.toContain('radar_channel')
  })

  it('un error de la base devuelve ok:false sin tirar', async () => {
    supabaseDoble.error = { code: '42501', message: 'interno' }
    const r = await activarPreferenciasAlAceptar('usuario-1')
    expect(r.ok).toBe(false)
  })
})

describe('detectores por texto', () => {
  it('bienvenida.tsx: activar() solo se llama dentro del handler del "Sí" (el permiso nunca en frío)', () => {
    const src = leerFuente('app/bienvenida.tsx')
    const llamadas = [...src.matchAll(/\bactivar\(\)/g)]
    expect(llamadas).toHaveLength(1)
    const iSi = src.indexOf('async function siAvisame')
    const iNo = src.indexOf('async function ahoraNo')
    expect(iSi).toBeGreaterThan(-1)
    expect(iNo).toBeGreaterThan(iSi)
    expect(llamadas[0].index).toBeGreaterThan(iSi)
    expect(llamadas[0].index).toBeLessThan(iNo)
  })

  it('bienvenida.tsx: el userId sale de la sesión y "Ahora no" no pide nada', () => {
    const src = leerFuente('app/bienvenida.tsx')
    expect(src).toMatch(/const userId = session\?\.user\.id \?\? null/)
    const iNo = src.indexOf('async function ahoraNo')
    const cuerpo = src.slice(iNo, src.indexOf('if (destino)'))
    expect(cuerpo).not.toMatch(/activar/)
  })

  // R81, 81-c: accesibilidad de la Bienvenida.
  it('bienvenida.tsx: ScrollView, títulos header con foco al cambiar de paso y Atrás que vuelve al paso 1', () => {
    const src = leerFuente('app/bienvenida.tsx').replace(/\r\n/g, '\n')
    const codigo = src.replace(/\/\/.*$/gm, '')
    // Contenido en un ScrollView que crece y centra (con la fuente grande los botones no se tapan).
    expect(codigo).toMatch(/<ScrollView[\s\S]*?contentContainerStyle=\{estilos\.contenedor\}/)
    expect(codigo).not.toMatch(/<View\b/)
    expect(codigo).toMatch(/contenedor:\s*\{\s*flexGrow: 1,[\s\S]*?justifyContent: 'center'/)
    // Los dos títulos son header y llevan la ref del foco.
    expect([...codigo.matchAll(/<Text ref=\{tituloRef\} accessibilityRole="header"/g)]).toHaveLength(2)
    expect(codigo).toMatch(/setAccessibilityFocus\(nodo\)[\s\S]*?\[destino\]\)/)
    // Atrás del sistema en el paso 2: vuelve al paso 1 y se da de baja al limpiar.
    expect(codigo).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'[\s\S]*?setDestino\(null\)/)
    expect(codigo).toMatch(/return \(\) => suscripcion\.remove\(\)/)
    // El logo decorativo no se lee; el color del botón sale del tema.
    expect(codigo).toMatch(/<Image[^>]*accessibilityElementsHidden[^>]*importantForAccessibility="no-hide-descendants"/)
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(codigo).toMatch(/color: colores\.primaryForeground/)
  })

  it('bienvenida.tsx: el texto del paso 2 no dice "lo que guardaste" y sin sesión avisa que se pide al entrar', () => {
    const src = leerFuente('app/bienvenida.tsx')
    expect(src).not.toMatch(/lo que guardaste/)
    expect(src).toMatch(/de lo que guardes/)
    expect(src).toMatch(/userId \? null : \([\s\S]*?Cuando entres a tu cuenta te lo pedimos\./)
  })

  it('el upsert del "al aceptar" manda sponsored: false', () => {
    const src = leerFuente('lib/notificaciones.ts')
    const i = src.indexOf('export async function activarPreferenciasAlAceptar')
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(i)).toMatch(/announcements: true, \.\.\.canal, sponsored: false/)
  })

  it('el "Activar" de la invitación usa activarPreferenciasAlAceptar y ya no cambiarAvisosEquipo', () => {
    const src = leerFuente('components/InvitacionAvisos.tsx')
    expect(src).toMatch(/activarPreferenciasAlAceptar\(userId\)/)
    expect(src).not.toMatch(/cambiarAvisosEquipo/)
  })

  it('lib/push/invitacion.ts sigue sin imports estáticos de React Native / Expo', () => {
    expect(leerFuente('lib/push/invitacion.ts')).not.toMatch(/^import .* from ['"](react-native|expo-[\w-]+)['"]/m)
  })
})
