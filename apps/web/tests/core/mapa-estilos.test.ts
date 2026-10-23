/**
 * `mapa/estilos.ts` (R54): las URL de OpenFreeMap, el origen de los tiles
 * (lo usa la CSP de 54-c) y `estiloSegunTema`. Fixtures fijas, sin red.
 */
import { describe, expect, it } from 'vitest'
import {
  ATRIBUCION_DATOS,
  ESTILO_MAPA,
  estiloSegunTema,
  ORIGEN_TILES,
  URL_COPYRIGHT_OSM,
} from '@qps/core/mapa/estilos'

describe('estilos del mapa', () => {
  it('las dos URL de estilo son las de OpenFreeMap (quick start)', () => {
    expect(ESTILO_MAPA.claro).toBe('https://tiles.openfreemap.org/styles/liberty')
    expect(ESTILO_MAPA.oscuro).toBe('https://tiles.openfreemap.org/styles/dark')
  })

  it('ORIGEN_TILES es el origen de las dos URL de estilo (lo usa la CSP)', () => {
    expect(ESTILO_MAPA.claro.startsWith(ORIGEN_TILES)).toBe(true)
    expect(ESTILO_MAPA.oscuro.startsWith(ORIGEN_TILES)).toBe(true)
  })

  it('estiloSegunTema: "dark" da el oscuro, "light" da el claro', () => {
    expect(estiloSegunTema('dark')).toBe(ESTILO_MAPA.oscuro)
    expect(estiloSegunTema('light')).toBe(ESTILO_MAPA.claro)
  })

  it('la atribución de datos y la licencia ODbL están declaradas', () => {
    expect(ATRIBUCION_DATOS).toBe('© colaboradores de OpenStreetMap')
    expect(URL_COPYRIGHT_OSM).toBe('https://www.openstreetmap.org/copyright')
  })
})
