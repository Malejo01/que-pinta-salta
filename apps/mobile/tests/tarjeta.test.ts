// 29-b (F14, ops/paridad-web-app.md §3.3): lectura estática de que
// `TarjetaEvento` usa `BotonFavorito` y `BotonCompartir`, los dos en 32 con
// fondo oscuro (`bg-black/60`), y de que el `Pressable` de toda la tarjeta
// sigue navegando a la ficha. Mismo estilo de detector con fixtures en
// memoria que `tests/tarjeta-evento.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const content = readFileSync(join(MOBILE_ROOT, 'components', 'TarjetaEvento.tsx'), 'utf8')

describe('components/TarjetaEvento.tsx: usa BotonFavorito y BotonCompartir (ops/paridad-web-app.md §3.3)', () => {
  it('importa BotonFavorito de @/components/BotonFavorito', () => {
    expect(content).toMatch(/import\s*\{[^}]*\bBotonFavorito\b[^}]*\}\s*from\s*['"]@\/components\/BotonFavorito['"]/)
  })

  it('importa BotonCompartir de @/components/BotonCompartir', () => {
    expect(content).toMatch(/import\s*\{[^}]*\bBotonCompartir\b[^}]*\}\s*from\s*['"]@\/components\/BotonCompartir['"]/)
  })

  it('usa <BotonFavorito ... /> en el JSX', () => {
    expect(content).toMatch(/<BotonFavorito\b/)
  })

  it('usa <BotonCompartir ... /> en el JSX', () => {
    expect(content).toMatch(/<BotonCompartir\b/)
  })

  it('los dos en círculos de 32, con fondo oscuro (bg-black/60)', () => {
    expect(content).toMatch(/<BotonFavorito[^>]*tamanio=\{32\}/)
    expect(content).toMatch(/<BotonCompartir[^>]*tamanio=\{32\}/)
    expect(content).toMatch(/<BotonFavorito[^>]*fondo="oscuro"/)
    expect(content).toMatch(/<BotonCompartir[^>]*fondo="oscuro"/)
  })

  it('el Pressable de toda la tarjeta sigue navegando a la ficha (tocar el corazón o compartir no la abre)', () => {
    expect(content).toMatch(/router\.push\(`\/evento\/\$\{evento\.id\}`\)/)
  })
})
