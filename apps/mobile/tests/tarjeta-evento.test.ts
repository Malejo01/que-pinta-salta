// 28-q, punto 10 (F1, 28-f): lectura estática de que Inicio, Buscar y
// Favoritos usan `TarjetaEvento` (la tarjeta única, replicando la de la
// web) y no se quedaron con la fila vieja con un `Afiche` de 64×64 (el
// patrón de `app/cines.tsx`, que es a propósito y no tiene que copiarse a
// estas tres pantallas). Mismo estilo de detector con fixtures en memoria
// que `tests/iconos.test.ts` y `tests/compartir-ficha.test.ts`.
//
// R29, 29-h (integración 29-q, punto B): Inicio dejó de importar
// `TarjetaEvento` directo — 29-h sacó el uso de `app/(tabs)/index.tsx` y lo
// movió a `components/FilaCategoria.tsx` (las filas horizontales por
// categoría que pide ops/paridad-web-app.md §3.2 punto 5), que es quien
// ahora dibuja la tarjeta para cada evento de Inicio. El invariante real que
// este detector protege sigue siendo el mismo: que Inicio no vuelva al
// afiche chico de 64×64 de la fila vieja. Para seguir protegiéndolo con la
// nueva estructura, Inicio pasa a revisarse con una regla propia (usa
// `FilaCategoria`, que a su vez usa `TarjetaEvento`, en vez de
// `TarjetaEvento` directo) y se agrega una comprobación de que
// `FilaCategoria.tsx` es, en efecto, quien importa `TarjetaEvento` — así que
// si el día de mañana alguien pone un afiche chico en una lista de Inicio
// (en `index.tsx` o en `FilaCategoria.tsx`), alguna de las dos reglas falla.
// Buscar y Favoritos no cambiaron: siguen importando `TarjetaEvento` directo.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

const PANTALLAS_CON_TARJETA_DIRECTA = [
  ['app/(tabs)/buscar.tsx', 'Buscar'],
  ['app/(tabs)/favoritos.tsx', 'Favoritos'],
] as const

interface Violation {
  message: string
}

/**
 * Violaciones de una pantalla de lista de eventos que dibuja `TarjetaEvento`
 * directo (Buscar, Favoritos):
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

/**
 * Violaciones de Inicio: no dibuja `TarjetaEvento` directo (la mudó a
 * `FilaCategoria`), así que lo que tiene que comprobarse ahí es que usa
 * `FilaCategoria` para sus filas y que no tiene, él mismo, un afiche fijo de
 * 64×64 (por si alguien reintrodujera la fila vieja a mano, sin pasar por
 * `FilaCategoria` ni por `TarjetaEvento`).
 */
export function violacionesDeInicio(content: string): Violation[] {
  const violaciones: Violation[] = []

  const importaFilaCategoria = /import\s*\{[^}]*\bFilaCategoria\b[^}]*\}\s*from\s*['"]@\/components\/FilaCategoria['"]/.test(
    content
  )
  if (!importaFilaCategoria) {
    violaciones.push({ message: 'no importa FilaCategoria de @/components/FilaCategoria' })
  }

  const usaFilaCategoria = /<FilaCategoria\b/.test(content)
  if (!usaFilaCategoria) {
    violaciones.push({ message: 'no renderiza <FilaCategoria>' })
  }

  const tieneAficheChico =
    /width:\s*64\b[\s\S]{0,60}height:\s*64\b/.test(content) || /height:\s*64\b[\s\S]{0,60}width:\s*64\b/.test(content)
  if (tieneAficheChico) {
    violaciones.push({ message: 'tiene un afiche fijo de 64×64 (la fila vieja, antes de TarjetaEvento/FilaCategoria)' })
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

describe('violacionesDeInicio (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('acepta una pantalla que usa FilaCategoria y no tiene afiche de 64×64', () => {
    const content = `
      import { FilaCategoria } from '@/components/FilaCategoria'
      return <FilaCategoria categoria="cine" titulo="Cine" eventos={[]} alVerTodos={() => {}} />
    `
    expect(violacionesDeInicio(content)).toEqual([])
  })

  it('detecta cuando no importa FilaCategoria', () => {
    const content = `import { TarjetaEvento } from '@/components/TarjetaEvento'`
    const v = violacionesDeInicio(content)
    expect(v.some((x) => x.message.includes('no importa FilaCategoria'))).toBe(true)
  })

  it('detecta cuando no renderiza <FilaCategoria>', () => {
    const content = `import { FilaCategoria } from '@/components/FilaCategoria'`
    const v = violacionesDeInicio(content)
    expect(v.some((x) => x.message.includes('no renderiza <FilaCategoria>'))).toBe(true)
  })

  it('detecta un afiche de 64×64 reintroducido a mano', () => {
    const content = `
      import { FilaCategoria } from '@/components/FilaCategoria'
      return <FilaCategoria categoria="cine" titulo="Cine" eventos={[]} alVerTodos={() => {}} />
      const estilos = StyleSheet.create({ afiche: { width: 64, height: 64 } })
    `
    const v = violacionesDeInicio(content)
    expect(v.some((x) => x.message.includes('64×64'))).toBe(true)
  })
})

describe.each(PANTALLAS_CON_TARJETA_DIRECTA)('%s: usa TarjetaEvento, sin el afiche de 64×64 de la fila vieja', (ruta, _nombre) => {
  const content = readFileSync(`${MOBILE_ROOT}/${ruta}`, 'utf8')

  it('sin violaciones', () => {
    const violaciones = violacionesDeTarjeta(content)
    if (violaciones.length > 0) {
      throw new Error(`${ruta}: ${violaciones.map((v) => v.message).join('; ')}`)
    }
    expect(violaciones).toEqual([])
  })
})

// Inicio ya no importa TarjetaEvento directo (la mudó a FilaCategoria): se
// comprueba con su propia regla (usa FilaCategoria, sin afiche de 64×64) en
// vez de la de PANTALLAS_CON_TARJETA_DIRECTA.
describe('app/(tabs)/index.tsx: usa FilaCategoria para dibujar sus filas (TarjetaEvento se mudó ahí)', () => {
  const content = readFileSync(`${MOBILE_ROOT}/app/(tabs)/index.tsx`, 'utf8')

  it('sin violaciones', () => {
    const violaciones = violacionesDeInicio(content)
    if (violaciones.length > 0) {
      throw new Error(`app/(tabs)/index.tsx: ${violaciones.map((v) => v.message).join('; ')}`)
    }
    expect(violaciones).toEqual([])
  })
})

// Barrido: FilaCategoria (quien ahora dibuja la tarjeta para Inicio) tiene
// que importar TarjetaEvento y no tener, ella misma, un afiche de 64×64 — si
// no, el invariante quedaría sin nadie que lo proteja.
describe('components/FilaCategoria.tsx: usa TarjetaEvento, sin el afiche de 64×64 de la fila vieja', () => {
  const content = readFileSync(`${MOBILE_ROOT}/components/FilaCategoria.tsx`, 'utf8')

  it('sin violaciones', () => {
    const violaciones = violacionesDeTarjeta(content)
    if (violaciones.length > 0) {
      throw new Error(`components/FilaCategoria.tsx: ${violaciones.map((v) => v.message).join('; ')}`)
    }
    expect(violaciones).toEqual([])
  })
})
