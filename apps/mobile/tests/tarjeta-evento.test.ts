// 28-q, punto 10 (F1, 28-f): lectura estática de que Inicio, Buscar y
// Favoritos usan `TarjetaEvento` (la tarjeta única, replicando la de la
// web) y no se quedaron con la fila vieja con un `Afiche` de 64×64 (el
// patrón de `app/cines.tsx`, que es a propósito y no tiene que copiarse a
// estas tres pantallas). Mismo estilo de detector con fixtures en memoria
// que `tests/iconos.test.ts` y `tests/compartir-ficha.test.ts`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

const PANTALLAS = [
  ['app/(tabs)/index.tsx', 'Inicio'],
  ['app/(tabs)/buscar.tsx', 'Buscar'],
  ['app/(tabs)/favoritos.tsx', 'Favoritos'],
] as const

interface Violation {
  message: string
}

/**
 * Violaciones de una pantalla de lista de eventos:
 * - no importa `TarjetaEvento` de `@/components/TarjetaEvento`;
 * - tiene un afiche fijo de 64×64 (`width: 64` y `height: 64` juntos, en
 *   cualquier orden, en el mismo objeto de estilos): la fila vieja que
 *   `TarjetaEvento` tenía que reemplazar.
 */
export function violacionesDeTarjeta(content: string): Violation[] {
  const violaciones: Violation[] = []

  const importaTarjeta = /import\s*\{[^}]*\bTarjetaEvento\b[^}]*\}\s*from\s*['"]@\/components\/TarjetaEvento['"]/.test(
    content
  )
  if (!importaTarjeta) {
    violaciones.push({ message: 'no importa TarjetaEvento de @/components/TarjetaEvento' })
  }

  const tieneAficheChico =
    /width:\s*64\b[\s\S]{0,60}height:\s*64\b/.test(content) || /height:\s*64\b[\s\S]{0,60}width:\s*64\b/.test(content)
  if (tieneAficheChico) {
    violaciones.push({ message: 'tiene un afiche fijo de 64×64 (la fila vieja, antes de TarjetaEvento)' })
  }

  return violaciones
}

describe('violacionesDeTarjeta (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('acepta una pantalla que usa TarjetaEvento y no tiene afiche de 64×64', () => {
    const content = `
      import { TarjetaEvento } from '@/components/TarjetaEvento'
      const estilos = StyleSheet.create({ celda: { flex: 1, maxWidth: '50%' } })
    `
    expect(violacionesDeTarjeta(content)).toEqual([])
  })

  it('detecta cuando no importa TarjetaEvento', () => {
    const content = `import { Afiche } from '@/components/Afiche'`
    const v = violacionesDeTarjeta(content)
    expect(v.some((x) => x.message.includes('no importa TarjetaEvento'))).toBe(true)
  })

  it('detecta un afiche de 64×64 (width primero)', () => {
    const content = `
      import { TarjetaEvento } from '@/components/TarjetaEvento'
      const estilos = StyleSheet.create({ afiche: { width: 64, height: 64 } })
    `
    const v = violacionesDeTarjeta(content)
    expect(v.some((x) => x.message.includes('64×64'))).toBe(true)
  })

  it('detecta un afiche de 64×64 (height primero)', () => {
    const content = `
      import { TarjetaEvento } from '@/components/TarjetaEvento'
      const estilos = StyleSheet.create({ afiche: { height: 64, width: 64 } })
    `
    const v = violacionesDeTarjeta(content)
    expect(v.some((x) => x.message.includes('64×64'))).toBe(true)
  })

  it('no confunde un 64 cualquiera (lejos de la otra medida) con el afiche viejo', () => {
    const content = `
      import { TarjetaEvento } from '@/components/TarjetaEvento'
      const estilos = StyleSheet.create({ espaciado: { width: 64 }, otroValor: { fontSize: 64 } })
    `
    expect(violacionesDeTarjeta(content)).toEqual([])
  })
})

describe.each(PANTALLAS)('%s: usa TarjetaEvento, sin el afiche de 64×64 de la fila vieja', (ruta, _nombre) => {
  const content = readFileSync(`${MOBILE_ROOT}/${ruta}`, 'utf8')

  it('sin violaciones', () => {
    const violaciones = violacionesDeTarjeta(content)
    if (violaciones.length > 0) {
      throw new Error(`${ruta}: ${violaciones.map((v) => v.message).join('; ')}`)
    }
    expect(violaciones).toEqual([])
  })
})
