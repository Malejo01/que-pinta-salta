/**
 * 30-q (cierre de la ronda 30), QPS-021: `/buscar`, la portada y la app
 * (mobile) tienen que resolver todas a la misma `normalizeFilterText` de
 * `packages/core/src/home/filters.ts`, ninguna con copia propia.
 *
 * - `/buscar` (app/buscar/buscar-content.tsx) importa `normalizeFilterText`
 *   directo del shim web (`@/lib/home/filters`). Ya lo prueba
 *   `tests/buscar/buscar-tildes.test.ts` (30-e); este archivo no lo repite,
 *   suma la comparación cruzada con las otras dos rutas.
 * - La portada (components/home-content.tsx) usa `filterEvents` del mismo
 *   shim, que internamente llama a `normalizeFilterText` de `@qps/core`.
 * - La app (apps/mobile/app/(tabs)/buscar.tsx) importa `filterEvents`
 *   directo de `@qps/core/home/filters` (no tiene el alias `@/lib/home/...`
 *   de la web).
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

// apps/web/tests/ronda30 -> apps/web/tests -> apps/web
const ROOT_WEB = join(__dirname, '..', '..')
const readWeb = (relPath: string) => readFileSync(join(ROOT_WEB, relPath), 'utf8')

// apps/web -> apps -> apps/mobile
const ROOT_MOBILE = join(ROOT_WEB, '..', 'mobile')
const readMobile = (relPath: string) => readFileSync(join(ROOT_MOBILE, relPath), 'utf8')

const SIN_COPIA_PROPIA = /normalize\(\s*["']NFD["']\s*\)/

describe('QPS-021: /buscar, la portada y la app usan la misma normalizeFilterText (packages/core/src/home/filters.ts)', () => {
  it('el shim de la web (lib/home/filters.ts) reexporta @qps/core/home/filters, no una copia', () => {
    const shim = readWeb('lib/home/filters.ts')
    expect(shim).toMatch(/export \* from ['"]@qps\/core\/home\/filters['"]/)
  })

  it('normalizeFilterText importada por el shim web y la importada directo de @qps/core son la misma función (no dos copias con el mismo nombre)', () => {
    expect(normalizeDesdeShimWeb).toBe(normalizeDesdeCore)
  })

  it('/buscar (app/buscar/buscar-content.tsx) importa normalizeFilterText del shim web, sin normalización propia', () => {
    const source = readWeb('app/buscar/buscar-content.tsx')
    expect(source).toMatch(/import \{[^}]*\bnormalizeFilterText\b[^}]*\}\s*from\s*["']@\/lib\/home\/filters["']/)
    expect(source).not.toMatch(SIN_COPIA_PROPIA)
  })

  it('la portada (components/home-content.tsx) usa filterEvents del shim web (que llama a normalizeFilterText de @qps/core), sin normalización propia', () => {
    const source = readWeb('components/home-content.tsx')
    expect(source).toMatch(/import \{[^}]*\bfilterEvents\b[^}]*\}\s*from\s*["']@\/lib\/home\/filters["']/)
    expect(source).not.toMatch(SIN_COPIA_PROPIA)
  })

  it('la app (apps/mobile/app/(tabs)/buscar.tsx) importa filterEvents directo de @qps/core/home/filters, sin normalización propia', () => {
    const source = readMobile('app/(tabs)/buscar.tsx')
    expect(source).toMatch(/import \{[^}]*\bfilterEvents\b[^}]*\}\s*from\s*["']@qps\/core\/home\/filters["']/)
    expect(source).not.toMatch(SIN_COPIA_PROPIA)
  })

  it('filtrado real: "pena" encuentra "Peña" con la normalizeFilterText importada del shim web', () => {
    expect(normalizeDesdeShimWeb('Peña Folklórica')).toContain(normalizeDesdeShimWeb('pena'))
  })

  it('filtrado real: "musica" encuentra "Música" con la normalizeFilterText importada directo de @qps/core', () => {
    expect(normalizeDesdeCore('Noche de Música en vivo')).toContain(normalizeDesdeCore('musica'))
  })
})
