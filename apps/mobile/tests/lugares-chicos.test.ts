// Q5-4 · «Lugares para chicos» en la app: filtros (puros) y detectores
// estáticos (la ubicación nunca se pide desde esta pantalla, las columnas
// públicas, el acceso desde Inicio y Buscar con «Para chicos»).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-location', () => ({ Accuracy: { Balanced: 3 } }))

import { saltaWallClockToDate } from '@qps/core/date-format'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'
import {
  SIN_FILTROS_LUGARES,
  fechaVerificado,
  filtrarLugares,
  lugaresParaMostrar,
  rutaLugarChicos,
  subtituloLugar,
  textoConteoLugares,
} from '../lib/lugares-chicos'
import { COLUMNAS_PUBLICAS_LUGAR } from '@qps/core/lugares/permanentes'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')

function lugar(n: number, cambios: Partial<LugarChicosMapa> = {}): LugarChicosMapa {
  return {
    id: `f${n}`,
    venueId: `v${n}`,
    nombre: `Lugar ${n}`,
    direccion: `Calle ${n}`,
    slug: null,
    lat: -24.7883,
    lng: -65.4106,
    tipo: 'pelotero',
    descripcion: null,
    edadMin: null,
    edadMax: null,
    horarios: { version: 1, semana: { mar: [{ desde: '16:00', hasta: '20:30' }] } },
    acceso: 'pago',
    notaPrecio: null,
    techado: null,
    tieneRampa: null,
    tieneBanoAdaptado: null,
    tieneCambiador: null,
    telefono: null,
    web: null,
    instagram: null,
    verificadoAt: '2026-10-20T12:00:00Z',
    deOsm: false,
    ...cambios,
  }
}

const MARTES_17 = saltaWallClockToDate('2026-11-03T17:00:00')
const LUGARES = [
  lugar(1),
  lugar(2, { tipo: 'plaza_juegos', acceso: 'gratis', horarios: { version: 1, siempre_abierto: true, semana: {} }, lat: -24.75, lng: -65.4 }),
  lugar(3, { tipo: 'salon_juegos', horarios: { version: 1, solo_con_reserva: true, semana: {} } }),
]

describe('filtros', () => {
  it('por tipo, gratis y abierto ahora (con reserva no cuenta como abierto)', () => {
    expect(filtrarLugares(LUGARES, SIN_FILTROS_LUGARES, MARTES_17).map((l) => l.venueId)).toEqual(['v1', 'v2', 'v3'])
    expect(filtrarLugares(LUGARES, { ...SIN_FILTROS_LUGARES, tipo: 'plaza_juegos' }, MARTES_17).map((l) => l.venueId)).toEqual(['v2'])
    expect(filtrarLugares(LUGARES, { ...SIN_FILTROS_LUGARES, gratis: true }, MARTES_17).map((l) => l.venueId)).toEqual(['v2'])
    expect(filtrarLugares(LUGARES, { ...SIN_FILTROS_LUGARES, abiertoAhora: true }, MARTES_17).map((l) => l.venueId)).toEqual(['v1', 'v2'])
    const martes21 = saltaWallClockToDate('2026-11-03T21:00:00')
    expect(filtrarLugares(LUGARES, { ...SIN_FILTROS_LUGARES, abiertoAhora: true }, martes21).map((l) => l.venueId)).toEqual(['v2'])
  })
  it('con un origen, el más cerca primero y con la distancia en el subtítulo', () => {
    const r = lugaresParaMostrar(LUGARES, SIN_FILTROS_LUGARES, { tipo: 'barrio', id: 'x', nombre: 'X', lat: -24.75, lng: -65.4 }, MARTES_17)
    expect(r[0]!.venueId).toBe('v2')
    expect(subtituloLugar(r[0]!)).toMatch(/^Plaza con juegos · a \d+ m en línea recta$/)
    expect(subtituloLugar({ ...LUGARES[0]!, metros: null })).toBe('Pelotero')
  })
  it('textos', () => {
    expect(textoConteoLugares(0)).toBe('Ningún lugar con estos filtros')
    expect(textoConteoLugares(1)).toBe('1 lugar')
    expect(textoConteoLugares(4)).toBe('4 lugares')
    expect(fechaVerificado('2026-10-20T01:00:00Z')).toBe('19/10/2026')
    expect(rutaLugarChicos('v1')).toBe('/lugares-chicos/v1')
  })
})

describe('ubicación: solo si ya estaba concedida', () => {
  const lista = leer('app', 'lugares-chicos', 'index.tsx')
  const ficha = leer('app', 'lugares-chicos', '[id].tsx')
  it('la lista usa ubicacionSiYaConcedida y nunca pide el permiso', () => {
    expect(lista).toContain('ubicacionSiYaConcedida()')
    for (const prohibido of ['ubicacionAproximada', 'requestForegroundPermissionsAsync', 'expo-location', 'AsyncStorage', 'almacen']) {
      expect(lista, prohibido).not.toContain(prohibido)
      expect(ficha, prohibido).not.toContain(prohibido)
    }
  })
  it('ubicacionSiYaConcedida mira el permiso con get (no request)', () => {
    const u = leer('lib', 'ubicacion.ts')
    const cuerpo = u.slice(u.indexOf('export async function ubicacionSiYaConcedida'))
    expect(cuerpo).toContain('getForegroundPermissionsAsync')
    expect(cuerpo).not.toContain('requestForegroundPermissionsAsync')
  })
})

describe('datos y accesos', () => {
  it('pide solo columnas públicas (sin cargado_por ni verificado_por) y solo publicados', () => {
    const datos = leer('lib', 'datos', 'lugares-chicos.ts')
    expect(datos).toContain('`${COLUMNAS_PUBLICAS_LUGAR}, venue:venues!inner(name, address, slug, latitude, longitude, canonical_venue_id)`')
    expect(COLUMNAS_PUBLICAS_LUGAR).not.toMatch(/cargado_por|verificado_por|\*/)
    expect(datos).toContain(".eq('estado', 'publicado')")
  })
  it('Inicio y Buscar muestran el acceso con «Para chicos» prendido', () => {
    expect(leer('app', '(tabs)', 'index.tsx')).toContain('{paraChicos ? <AccesoLugaresChicos /> : null}')
    expect(leer('app', '(tabs)', 'buscar.tsx')).toMatch(/\{paraChicosActivo \? \(\s*<View style=\{estilos\.accesoLugaresEnLista\}>\s*<AccesoLugaresChicos \/>/)
  })
  it('«Cómo llegar» pasa por urlComoLlegar y los contactos por urlContactoLugar; OSM lleva su atribución', () => {
    const ficha = leer('app', 'lugares-chicos', '[id].tsx')
    expect(ficha).toContain('urlComoLlegar(')
    expect(ficha).toContain("urlContactoLugar(lugar.web, 'web')")
    expect(ficha).toContain('ATRIBUCION_OSM.es')
    expect(ficha).toContain('Con reserva')
  })
})
