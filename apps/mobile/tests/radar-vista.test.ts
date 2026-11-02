// Ronda 29, tarea 29-d: pruebas de `lib/radar-vista.ts` (puro) y, al final,
// un chequeo estático de que los 3 textos clave de `PantallaRadar.tsx`
// coinciden carácter por carácter con el archivo de la web de donde salen
// (mismo patrón de lectura con `fs` que `tests/base-visual.test.ts`).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buscarSeguibles,
  hayCambios,
  normalizarBusqueda,
  resumenRadar,
  type CuentaInstagramBuscable,
  type LugarBuscable,
} from '../lib/radar-vista'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const WEB_ROOT = join(MOBILE_ROOT, '..', 'web')

describe('normalizarBusqueda', () => {
  it('minúsculas y sin acentos: "Peñas" se encuentra con "penas"', () => {
    expect(normalizarBusqueda('Peñas')).toBe('penas')
  })

  it('minúsculas y sin acentos: "Ñandú" se encuentra con "nandu"', () => {
    expect(normalizarBusqueda('Ñandú')).toBe('nandu')
  })

  it('no cambia un texto ya en minúsculas y sin acentos', () => {
    expect(normalizarBusqueda('metro')).toBe('metro')
  })
})

const LUGARES: LugarBuscable[] = [
  { id: 'lugar-1', name: 'La Metro' },
  { id: 'lugar-2', name: 'Peñas del Norte' },
  { id: 'lugar-3', name: 'Ñandú Resto Bar' },
]

const CUENTAS: CuentaInstagramBuscable[] = [
  { id: 'cuenta-1', display_name: 'Sex Us Machina', username: 'sexusmachina' },
  { id: 'cuenta-2', display_name: 'Usina del Arte', username: 'usinadelarte' },
]

describe('buscarSeguibles: búsqueda unificada (lugares + Instagram), como la web', () => {
  it('encuentra "Peñas del Norte" buscando "penas" (sin acentos)', () => {
    const resultado = buscarSeguibles(LUGARES, CUENTAS, 'penas')
    expect(resultado).toEqual([{ tipo: 'lugar', id: 'lugar-2', nombre: 'Peñas del Norte' }])
  })

  it('encuentra "Ñandú Resto Bar" buscando "nandu" (sin acentos)', () => {
    const resultado = buscarSeguibles(LUGARES, CUENTAS, 'nandu')
    expect(resultado).toEqual([{ tipo: 'lugar', id: 'lugar-3', nombre: 'Ñandú Resto Bar' }])
  })

  it('una cuenta se encuentra por nombre', () => {
    const resultado = buscarSeguibles(LUGARES, CUENTAS, 'usina')
    expect(resultado).toEqual([
      { tipo: 'instagram', id: 'cuenta-2', nombre: 'Usina del Arte', usuario: 'usinadelarte' },
    ])
  })

  it('una cuenta se encuentra por @usuario (con o sin el "@")', () => {
    const conArroba = buscarSeguibles(LUGARES, CUENTAS, '@sexusmachina')
    const sinArroba = buscarSeguibles(LUGARES, CUENTAS, 'sexusmachina')
    expect(conArroba).toEqual([
      { tipo: 'instagram', id: 'cuenta-1', nombre: 'Sex Us Machina', usuario: 'sexusmachina' },
    ])
    expect(sinArroba).toEqual(conArroba)
  })

  it('texto vacío (o solo espacios): sin resultados', () => {
    expect(buscarSeguibles(LUGARES, CUENTAS, '')).toEqual([])
    expect(buscarSeguibles(LUGARES, CUENTAS, '   ')).toEqual([])
  })

  it('sin coincidencias: lista vacía', () => {
    expect(buscarSeguibles(LUGARES, CUENTAS, 'zzz-no-existe')).toEqual([])
  })

  it('máximo 6 resultados, aunque haya más coincidencias', () => {
    const muchosLugares: LugarBuscable[] = Array.from({ length: 10 }, (_, i) => ({
      id: `lugar-metro-${i}`,
      name: `Metro ${i}`,
    }))
    const resultado = buscarSeguibles(muchosLugares, [], 'metro')
    expect(resultado).toHaveLength(6)
  })

  it('"sin los ya elegidos": quien llama filtra las listas antes de pasarlas', () => {
    // Simula que "La Metro" (lugar-1) ya está seleccionado: PantallaRadar no
    // la incluye en `lugares` antes de llamar a buscarSeguibles.
    const lugaresSinElegidos = LUGARES.filter((l) => l.id !== 'lugar-1')
    const resultado = buscarSeguibles(lugaresSinElegidos, CUENTAS, 'metro')
    expect(resultado.find((r) => r.id === 'lugar-1')).toBeUndefined()
    expect(resultado).toEqual([])
  })

  it('resultado por defecto: max = 6', () => {
    const muchasCuentas: CuentaInstagramBuscable[] = Array.from({ length: 8 }, (_, i) => ({
      id: `cuenta-metro-${i}`,
      display_name: `Metro IG ${i}`,
      username: `metroig${i}`,
    }))
    expect(buscarSeguibles([], muchasCuentas, 'metro')).toHaveLength(6)
  })

  it('respeta un `max` explícito menor', () => {
    const resultado = buscarSeguibles(LUGARES, CUENTAS, 'a', 2)
    expect(resultado).toHaveLength(2)
  })
})

describe('resumenRadar: las 4 frecuencias', () => {
  it('weekly: "cada semana"', () => {
    expect(resumenRadar('weekly', 'mauro@qps.ar')).toBe('Tu Radar está activo: te llega cada semana a mauro@qps.ar')
  })

  it('biweekly: "cada 2 semanas"', () => {
    expect(resumenRadar('biweekly', 'mauro@qps.ar')).toBe(
      'Tu Radar está activo: te llega cada 2 semanas a mauro@qps.ar',
    )
  })

  it('monthly: "cada mes"', () => {
    expect(resumenRadar('monthly', 'mauro@qps.ar')).toBe('Tu Radar está activo: te llega cada mes a mauro@qps.ar')
  })

  it('disabled: "Tu Radar está pausado" (sin el email)', () => {
    expect(resumenRadar('disabled', 'mauro@qps.ar')).toBe('Tu Radar está pausado')
  })
})

describe('hayCambios', () => {
  const ORIGINAL = {
    email_frequency: 'weekly' as const,
    categoryIds: ['cat-1', 'cat-2'],
    venueIds: ['venue-1'],
    instagramAccountIds: [] as string[],
  }

  it('idéntico (mismo orden): sin cambios', () => {
    expect(hayCambios(ORIGINAL, { ...ORIGINAL })).toBe(false)
  })

  it('mismos ids en otro orden: sin cambios (compara como conjunto)', () => {
    expect(hayCambios(ORIGINAL, { ...ORIGINAL, categoryIds: ['cat-2', 'cat-1'] })).toBe(false)
  })

  it('cambia la frecuencia: hay cambios', () => {
    expect(hayCambios(ORIGINAL, { ...ORIGINAL, email_frequency: 'monthly' })).toBe(true)
  })

  it('se agrega una categoría: hay cambios', () => {
    expect(hayCambios(ORIGINAL, { ...ORIGINAL, categoryIds: ['cat-1', 'cat-2', 'cat-3'] })).toBe(true)
  })

  it('se quita un lugar: hay cambios', () => {
    expect(hayCambios(ORIGINAL, { ...ORIGINAL, venueIds: [] })).toBe(true)
  })

  it('se agrega una cuenta de Instagram: hay cambios', () => {
    expect(hayCambios(ORIGINAL, { ...ORIGINAL, instagramAccountIds: ['ig-1'] })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Los textos de la web, copiados literal (29-d): lectura estática de
// PantallaRadar.tsx y del archivo de la web de donde sale cada texto.
// ---------------------------------------------------------------------------
describe('Los textos de la web están copiados literal en PantallaRadar.tsx', () => {
  const PANTALLA_RADAR = readFileSync(join(MOBILE_ROOT, 'components', 'PantallaRadar.tsx'), 'utf8')
  const RADAR_PAGE = readFileSync(join(WEB_ROOT, 'app', 'radar', 'page.tsx'), 'utf8')
  // Desde la R78 los textos fijos de radar-form.tsx viven en el diccionario en
  // castellano (sección `radar` de lib/i18n/diccionarios/es.ts).
  const RADAR_FORM = readFileSync(join(WEB_ROOT, 'lib', 'i18n', 'diccionarios', 'es.ts'), 'utf8')

  it('"Mi Radar Salteño" (app/radar/page.tsx)', () => {
    expect(RADAR_PAGE).toContain('Mi Radar Salteño')
    expect(PANTALLA_RADAR).toContain('Mi Radar Salteño')
  })

  it('"Guardar Preferencias de Radar" (diccionario es, sección radar)', () => {
    expect(RADAR_FORM).toContain('Guardar Preferencias de Radar')
    expect(PANTALLA_RADAR).toContain('Guardar Preferencias de Radar')
  })

  it('"¡Ya estás en el Radar!" (diccionario es, sección radar)', () => {
    expect(RADAR_FORM).toContain('¡Ya estás en el Radar!')
    expect(PANTALLA_RADAR).toContain('¡Ya estás en el Radar!')
  })
})
