// Q4-8 (política de Play del 27/01/2027): la app pide solo la ubicación
// APROXIMADA. Detectores sin teléfono ni build: leen app.config.ts y el código.
//  1. app.config: ACCESS_FINE_LOCATION y ACCESS_BACKGROUND_LOCATION bloqueadas
//     (expo-location y MapLibre las declaran en sus manifiestos).
//  2. Nadie pide la precisión alta: ni `Accuracy.High/Highest/BestForNavigation`
//     ni los números 4/5/6 en `accuracy`, ni el helper de MapLibre que pide FINE.
//  3. Toda lectura de la posición pasa por lib/ubicacion.ts (precisión Balanced).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-location', () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  requestForegroundPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: vi.fn(async (o: { accuracy: number }) => ({ coords: { latitude: -24.78912, longitude: -65.41234, accuracy: o.accuracy } })),
}))

import config, { PERMISOS_BLOQUEADOS, plugins } from '../app.config'
import { PRECISION_UBICACION, redondearCoordenada, ubicacionAproximada } from '../lib/ubicacion'

const RAIZ = join(__dirname, '..')
const CARPETAS = ['app', 'components', 'lib']

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : archivos(ruta)
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : []
  })
}

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

const CODIGO = CARPETAS.flatMap((c) => archivos(join(RAIZ, c))).map((ruta) => ({
  ruta: relative(RAIZ, ruta).replaceAll('\\', '/'),
  texto: sinComentarios(readFileSync(ruta, 'utf8')),
}))

describe('1. app.config bloquea la ubicación precisa y la de segundo plano', () => {
  it('blockedPermissions tiene FINE y BACKGROUND', () => {
    expect(PERMISOS_BLOQUEADOS).toEqual(
      expect.arrayContaining(['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION']),
    )
    expect(config.android?.blockedPermissions).toEqual(PERMISOS_BLOQUEADOS)
  })

  it('no se agrega a mano ningún permiso de ubicación precisa', () => {
    expect(config.android?.permissions ?? []).not.toContain('android.permission.ACCESS_FINE_LOCATION')
    expect(config.android?.permissions ?? []).not.toContain('ACCESS_FINE_LOCATION')
  })

  it('expo-location sigue sin segundo plano', () => {
    const entrada = plugins({}).find((p) => Array.isArray(p) && p[0] === 'expo-location') as [string, Record<string, unknown>]
    expect(entrada[1]).toMatchObject({ isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false })
  })
})

describe('2. nadie pide la precisión alta', () => {
  it('recorrió el código (si da 0, el detector no mira nada)', () => {
    expect(CODIGO.length).toBeGreaterThan(50)
  })

  it.each([
    ['Accuracy.High', /Accuracy\.(High|Highest|BestForNavigation)\b/],
    ['accuracy: 4/5/6', /accuracy\s*:\s*[456]\b/],
    ['ACCESS_FINE_LOCATION fuera de app.config', /ACCESS_FINE_LOCATION/],
    ['el pedido de permisos de MapLibre (pide FINE)', /requestAndroidLocationPermissions/],
    ['PermissionsAndroid con ubicación', /PermissionsAndroid[\s\S]{0,200}LOCATION/],
  ])('%s', (_nombre, patron) => {
    const culpables = CODIGO.filter((a) => patron.test(a.texto)).map((a) => a.ruta)
    expect(culpables, `piden la ubicación precisa: ${culpables.join(', ')} (usá lib/ubicacion.ts)`).toEqual([])
  })
})

describe('3. la posición se lee solo desde lib/ubicacion.ts', () => {
  it('ningún otro archivo llama a getCurrentPositionAsync / watchPositionAsync / getLastKnownPositionAsync', () => {
    const culpables = CODIGO.filter(
      (a) => a.ruta !== 'lib/ubicacion.ts' && /\b(getCurrentPositionAsync|watchPositionAsync|getLastKnownPositionAsync)\b/.test(a.texto),
    ).map((a) => a.ruta)
    expect(culpables).toEqual([])
  })

  it('la precisión es Balanced (3) y la posición sale redondeada (~1 km)', async () => {
    expect(PRECISION_UBICACION).toBe(3)
    expect(redondearCoordenada(-24.78912)).toBe(-24.79)
    expect(await ubicacionAproximada()).toEqual({ ok: true, latitud: -24.79, longitud: -65.41 })
  })

  it('sin permiso: { ok: false } sin tirar', async () => {
    const Location = await import('expo-location')
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce({ status: 'denied' } as never)
    expect(await ubicacionAproximada()).toEqual({ ok: false, motivo: 'sin-permiso' })
  })
})
