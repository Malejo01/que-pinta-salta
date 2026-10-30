// 49-f (QPS-246): el Hero no avanza solo con el lector de pantalla prendido
// (WCAG 2.2.2) y las diapositivas ganan dos acciones accesibles
// ("siguiente"/"anterior") para moverse sin depender del deslizamiento.
//
// `lib/hero-accesible.ts` es puro (sin `react-native`), así que
// `indiceTrasAccion` y `etiquetaDiapositiva` se prueban importándolo
// directamente, con fixtures en memoria. La parte que vive en
// `components/Hero.tsx` (que sí importa React Native y por eso no se puede
// `import`ar en un test, mismo motivo que `tests/hero.test.ts` y
// `tests/portada.test.ts`) se prueba con detectores sobre el texto del
// archivo real.
//
// QPS-250: no se importa un `*.test.ts` desde otro test. La función
// `sinComentarios` de `tests/hero.test.ts` se necesita también acá, así que
// se copia (no se pone en un módulo nuevo porque los archivos permitidos de
// esta tarea no incluyen uno): si el criterio de saneado cambia en un lado,
// hay que recordar actualizar el otro.
import { readFileSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACCIONES_HERO, etiquetaDiapositiva, indiceTrasAccion } from '@/lib/hero-accesible'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const HERO_PATH = join(MOBILE_ROOT, 'components', 'Hero.tsx')

// ---------------------------------------------------------------------------
// Copia idéntica de `sinComentarios` (`tests/hero.test.ts`): bloques
// `/* ... */` y comentarios de línea, cuidando no cortar por el `//` de una
// URL dentro de un comentario.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// ACCIONES_HERO
// ---------------------------------------------------------------------------
describe('ACCIONES_HERO', () => {
  it('tiene exactamente "siguiente" y "anterior", con sus etiquetas', () => {
    expect(ACCIONES_HERO).toEqual([
      { name: 'siguiente', label: 'Siguiente evento' },
      { name: 'anterior', label: 'Evento anterior' },
    ])
  })
})

// ---------------------------------------------------------------------------
// indiceTrasAccion
// ---------------------------------------------------------------------------
describe('indiceTrasAccion', () => {
  it('con total 0 no hay a dónde moverse: devuelve el índice tal cual, para "siguiente", "anterior" y una acción desconocida', () => {
    expect(indiceTrasAccion('siguiente', 0, 0)).toBe(0)
    expect(indiceTrasAccion('anterior', 0, 0)).toBe(0)
    expect(indiceTrasAccion('otra', 0, 0)).toBe(0)
  })

  it('con total 1 tampoco hay a dónde moverse: devuelve el índice tal cual', () => {
    expect(indiceTrasAccion('siguiente', 0, 1)).toBe(0)
    expect(indiceTrasAccion('anterior', 0, 1)).toBe(0)
    expect(indiceTrasAccion('otra', 0, 1)).toBe(0)
  })

  it('con 5 diapositivas, "siguiente" avanza una por una', () => {
    expect(indiceTrasAccion('siguiente', 0, 5)).toBe(1)
    expect(indiceTrasAccion('siguiente', 1, 5)).toBe(2)
    expect(indiceTrasAccion('siguiente', 3, 5)).toBe(4)
  })

  it('con 5 diapositivas, "anterior" retrocede una por una', () => {
    expect(indiceTrasAccion('anterior', 4, 5)).toBe(3)
    expect(indiceTrasAccion('anterior', 2, 5)).toBe(1)
    expect(indiceTrasAccion('anterior', 1, 5)).toBe(0)
  })

  it('da la vuelta completa en los dos bordes: de la última a la primera con "siguiente", y de la primera a la última con "anterior"', () => {
    expect(indiceTrasAccion('siguiente', 4, 5)).toBe(0)
    expect(indiceTrasAccion('anterior', 0, 5)).toBe(4)
  })

  it('una acción desconocida no mueve el índice, con total > 1', () => {
    expect(indiceTrasAccion('activate', 2, 5)).toBe(2)
    expect(indiceTrasAccion('', 0, 5)).toBe(0)
  })

  it('con un índice fuera de rango y una acción conocida, lo normaliza a [0, total) antes de moverse (no devuelve un índice inválido)', () => {
    expect(indiceTrasAccion('siguiente', 5, 5)).toBe(1) // 5 fuera de rango -> normaliza a 0 -> +1 = 1
    expect(indiceTrasAccion('siguiente', -1, 5)).toBe(0) // -1 normaliza a 4 -> +1 = 0
    expect(indiceTrasAccion('anterior', -1, 5)).toBe(3) // -1 normaliza a 4 -> -1 = 3
  })

  it('con un índice fuera de rango y una acción desconocida, lo deja igual de fuera de rango (no toma ninguna decisión de movimiento)', () => {
    expect(indiceTrasAccion('otra', 9, 5)).toBe(9)
    expect(indiceTrasAccion('otra', -3, 5)).toBe(-3)
  })
})

// ---------------------------------------------------------------------------
// etiquetaDiapositiva
// ---------------------------------------------------------------------------
describe('etiquetaDiapositiva', () => {
  it('con total 1, sin "1 de 1"', () => {
    expect(etiquetaDiapositiva('Feria de Diseño', 0, 1)).toBe('Feria de Diseño, ver detalles')
  })

  it('con total 2, el número leído es indice + 1 (base 1)', () => {
    expect(etiquetaDiapositiva('Feria de Diseño', 0, 2)).toBe('Feria de Diseño, ver detalles, 1 de 2')
    expect(etiquetaDiapositiva('Feria de Diseño', 1, 2)).toBe('Feria de Diseño, ver detalles, 2 de 2')
  })

  it('con total 5, en cualquier posición', () => {
    expect(etiquetaDiapositiva('Recital en el parque', 1, 5)).toBe('Recital en el parque, ver detalles, 2 de 5')
    expect(etiquetaDiapositiva('Recital en el parque', 4, 5)).toBe('Recital en el parque, ver detalles, 5 de 5')
  })
})

// ---------------------------------------------------------------------------
// Detectores sobre el archivo real de Hero.tsx (comentarios saneados antes
// de cualquier chequeo, mismo criterio que `tests/hero.test.ts`).
// ---------------------------------------------------------------------------
describe('components/Hero.tsx: el avance automático respeta el lector de pantalla (lectura estática)', () => {
  const crudo = readFileSync(HERO_PATH, 'utf8')
  const contenido = sinComentarios(crudo)

  it('consulta AccessibilityInfo.isScreenReaderEnabled al montar', () => {
    expect(contenido).toMatch(/AccessibilityInfo\.isScreenReaderEnabled\(\)/)
  })

  it('escucha el evento "screenReaderChanged" con AccessibilityInfo.addEventListener', () => {
    expect(contenido).toMatch(/AccessibilityInfo\.addEventListener\(\s*['"]screenReaderChanged['"]/)
  })

  it('limpia (remove) el suscriptor de "screenReaderChanged" cerca de donde se crea (cleanup del mismo useEffect)', () => {
    const idx = contenido.search(/AccessibilityInfo\.addEventListener\(\s*['"]screenReaderChanged['"]/)
    expect(idx).toBeGreaterThan(-1)
    const bloque = contenido.slice(idx, idx + 400)
    expect(bloque).toMatch(/\.remove\(\)/)
  })

  it('DiapositivaHero expone accessibilityActions y onAccessibilityAction', () => {
    expect(contenido).toMatch(/accessibilityActions=/)
    expect(contenido).toMatch(/onAccessibilityAction=/)
  })

  // El `setInterval` del autoplay tiene que salir del efecto ANTES de armarse
  // cuando el lector de pantalla está activo (WCAG 2.2.2). El detector busca,
  // entre el `useEffect(` que contiene ese `setInterval(` y el `setInterval(`
  // mismo, un `if (...)` con "lector" en la condición seguido de `return`.
  //
  // Límite conocido de esta forma de detectar: es un detector de texto, no
  // entiende el flujo real. Si alguien reescribe la guarda sin un `return`
  // temprano (por ejemplo, poniendo todo el cuerpo del efecto dentro de un
  // `if (!lectorActivo) { ... }` sin ningún `return` explícito antes del
  // `setInterval`), o renombra el estado a algo que no contenga la palabra
  // "lector", este detector no lo nota y daría un falso verde. Lo que sí
  // garantiza: que si la guarda está escrita con el patrón que hoy usa
  // `components/Hero.tsx` (un `return` temprano condicionado al estado del
  // lector, como ya hace el `if (slides.length <= 1) return undefined` de
  // al lado), no se puede borrar sin que este test se ponga en rojo.
  it('el setInterval del autoplay está condicionado al estado del lector de pantalla', () => {
    const idxSetInterval = contenido.indexOf('setInterval(')
    expect(idxSetInterval).toBeGreaterThan(-1)
    const idxUseEffect = contenido.lastIndexOf('useEffect(', idxSetInterval)
    expect(idxUseEffect).toBeGreaterThan(-1)
    const bloque = contenido.slice(idxUseEffect, idxSetInterval)
    expect(bloque).toMatch(/if\s*\([^)]*[Ll]ector[^)]*\)\s*return/)
  })
})
