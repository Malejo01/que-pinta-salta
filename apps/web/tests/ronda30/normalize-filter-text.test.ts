/**
 * 30-q (cierre de la ronda 30), QPS-021: `/buscar`, la portada y la app
 * (mobile) tienen que resolver todas a la misma `normalizeFilterText` de
 * `packages/core/src/home/filters.ts`, ninguna con copia propia.
 *
 * Fase 2 (16/10, merge de la R29): la búsqueda de `/buscar` y de la app es
 * `buscarEventosPorTexto` (`packages/core/src/home/busqueda.ts`), que
 * normaliza con `normalizeFilterText` de `./filters`.
 *
 * - `/buscar` (app/buscar/buscar-content.tsx) y la app
 *   (apps/mobile/app/(tabs)/buscar.tsx) importan `buscarEventosPorTexto`.
 * - La portada (components/home-content.tsx) usa `filterEvents` del shim web,
 *   que internamente llama a `normalizeFilterText` de `@qps/core`.
 *
 * Sin red ni base: lectura de fuente con `fs` + llamada real a la función
 * importada por los dos caminos (shim vs. paquete directo) para confirmar
 * que es la misma referencia, no solo un resultado parecido.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeFilterText as normalizeDesdeShimWeb } from '@/lib/home/filters'
import { normalizeFilterText as normalizeDesdeCore } from '@qps/core/home/filters'
import { buscarEventosPorTexto } from '@qps/core/home/busqueda'
import type { DisplayEvent } from '@qps/core/home/types'

// apps/web/tests/ronda30 -> apps/web/tests -> apps/web
const ROOT_WEB = join(__dirname, '..', '..')
const readWeb = (relPath: string) => readFileSync(join(ROOT_WEB, relPath), 'utf8')

// apps/web -> apps -> apps/mobile
const ROOT_MOBILE = join(ROOT_WEB, '..', 'mobile')
const readMobile = (relPath: string) => readFileSync(join(ROOT_MOBILE, relPath), 'utf8')

// apps/web -> apps -> raíz -> packages/core
const readCore = (relPath: string) => readFileSync(join(ROOT_WEB, '..', '..', 'packages', 'core', 'src', relPath), 'utf8')

const SIN_COPIA_PROPIA = /normalize\(\s*["']NFD["']\s*\)/
const IMPORTA_BUSQUEDA_DE_CORE = /import\s*\{[^}]*\bbuscarEventosPorTexto\b[^}]*\}\s*from\s*["']@qps\/core\/home\/busqueda["']/
// Desde Q3 (C2), `/buscar` filtra con `filtrarCombinado` (texto + chips), que
// por dentro busca con `buscarEventosPorTexto` de `./busqueda`.
const IMPORTA_COMBINADO_DE_CORE = /import\s*\{[^}]*\bfiltrarCombinado\b[^}]*\}\s*from\s*[\"']@qps\/core\/home\/filtros-combinados[\"']/

describe('QPS-021: /buscar, la portada y la app usan la misma normalizeFilterText (packages/core/src/home/filters.ts)', () => {
  it('el shim de la web (lib/home/filters.ts) reexporta @qps/core/home/filters, no una copia', () => {
    const shim = readWeb('lib/home/filters.ts')
    expect(shim).toMatch(/export \* from ['"]@qps\/core\/home\/filters['"]/)
  })

  it('normalizeFilterText importada por el shim web y la importada directo de @qps/core son la misma función (no dos copias con el mismo nombre)', () => {
    expect(normalizeDesdeShimWeb).toBe(normalizeDesdeCore)
  })

  it('la búsqueda de core (home/busqueda.ts) usa normalizeFilterText de ./filters, sin normalización propia', () => {
    const source = readCore('home/busqueda.ts')
    expect(source).toMatch(/import\s*\{\s*normalizeFilterText\s*\}\s*from\s*["']\.\/filters["']/)
    expect(source).not.toMatch(SIN_COPIA_PROPIA)
  })

  it('/buscar (app/buscar/buscar-content.tsx) busca con filtrarCombinado de core (que usa buscarEventosPorTexto) y no filtra por su cuenta', () => {
    const source = readWeb('app/buscar/buscar-content.tsx')
    expect(source).toMatch(IMPORTA_COMBINADO_DE_CORE)
    // Un solo camino: ya no importa además `buscarEventosPorTexto` suelta.
    expect(source).not.toMatch(IMPORTA_BUSQUEDA_DE_CORE)
    expect(source).toMatch(/filtrarCombinado\(\s*itemsFiltrables,\s*\{[^}]*\btexto:\s*deferredSearchQuery\b[^}]*\}/)
    const combinado = readCore('home/filtros-combinados.ts')
    expect(combinado).toMatch(/import\s*\{\s*buscarEventosPorTexto\s*\}\s*from\s*["']\.\/busqueda["']/)
    expect(combinado).toMatch(/buscarEventosPorTexto\(eventos,\s*texto\)/)
    expect(source).not.toMatch(SIN_COPIA_PROPIA)
    expect(source).not.toMatch(/event\.title\.toLowerCase\(\)\.includes\(/)
  })

  it('la portada (components/home-content.tsx) usa filterEvents del shim web (que llama a normalizeFilterText de @qps/core), sin normalización propia', () => {
    const source = readWeb('components/home-content.tsx')
    expect(source).toMatch(/import \{[^}]*\bfilterEvents\b[^}]*\}\s*from\s*["']@\/lib\/home\/filters["']/)
    expect(source).not.toMatch(SIN_COPIA_PROPIA)
  })

  // R66 (66-b): la app ya no importa `buscarEventosPorTexto` suelta: filtra
  // texto + fecha + categoría + gratis con `filtrarCombinado`
  // (`packages/core/src/home/filtros-combinados.ts`), que la usa por dentro.
  // Se exigen los dos eslabones: la app importa `filtrarCombinado` de core, y
  // `filtros-combinados.ts` importa `buscarEventosPorTexto` de `./busqueda`,
  // ninguno con normalización propia.
  it('la app (apps/mobile/app/(tabs)/buscar.tsx) busca con core (filtrarCombinado → buscarEventosPorTexto), sin normalización propia', () => {
    const source = readMobile('app/(tabs)/buscar.tsx')
    expect(source).toMatch(/import\s*\{[^}]*\bfiltrarCombinado\b[^}]*\}\s*from\s*["']@qps\/core\/home\/filtros-combinados["']/)
    expect(source).not.toMatch(SIN_COPIA_PROPIA)

    const combinado = readCore('home/filtros-combinados.ts')
    expect(combinado).toMatch(/import\s*\{[^}]*\bbuscarEventosPorTexto\b[^}]*\}\s*from\s*["']\.\/busqueda["']/)
    expect(combinado).toMatch(/buscarEventosPorTexto\(/)
    expect(combinado).not.toMatch(SIN_COPIA_PROPIA)
  })

  it('filtrado real: "pena" encuentra "Peña" con la búsqueda de core (la de /buscar y la app)', () => {
    const pena = { id: 'p', title: 'Peña Folklórica', venue: 'Salón de prueba', description: '' } as DisplayEvent
    expect(buscarEventosPorTexto([pena], 'pena')).toEqual([pena])
  })

  it('filtrado real: "musica" encuentra "Música" con la normalizeFilterText importada directo de @qps/core', () => {
    expect(normalizeDesdeCore('Noche de Música en vivo')).toContain(normalizeDesdeCore('musica'))
  })
})
