// 46-q (Ronda 46, calidad de la app), punto 3 del encargo: los `hitSlop` de
// botones vecinos no se tienen que pisar. `BotonFavorito` y `BotonCompartir`
// (en la ficha del evento, `app/evento/[id].tsx`, y en la tarjeta,
// `components/TarjetaEvento.tsx`) ya tienen, en su propio código, el
// comentario "(46-c, para que lo revise 46-q)" con la cuenta hecha a mano —
// este test la vuelve a hacer con el `gap` LEÍDO del archivo real (no
// copiado del comentario) y con la MISMA regla de `hitSlopBotonAccion` que
// usan los dos componentes (no exportada — no son archivos de esta tarea:
// se verifica, aparte, que el texto de la función sigue siendo el mismo que
// se lee acá, para no quedar desincronizados en silencio).
//
// El Encabezado (logo + botón de usuario/"Ingresar") queda "para el
// teléfono": la fila es `justifyContent: 'space-between'`, sin un `gap`
// escrito — el espacio real entre los dos depende del ancho de la pantalla,
// no se puede leer del archivo (ver el reporte de la tarea).
//
// Usa `valorDeClaveDeEstilo` de `./a11y/hitslop-medidas` (un módulo SIN
// `.test.ts`, no recogido por `vitest.config.ts`): a propósito, para no
// importar NINGÚN `*.test.ts` desde acá — importar un `*.test.ts` hace que
// Vitest vuelva a ejecutar (y a contar) todos sus `describe`/`it` dentro de
// este archivo también (ver el comentario de cabecera de
// `tests/a11y/hitslop-medidas.ts` y el reporte de la tarea). Por lo mismo,
// el recorte de comentarios es una copia chica LOCAL (mismo criterio, y
// mismo patrón, que ya usan `tests/dimensions.test.ts` y
// `tests/scripts-fuera-del-bundle.test.ts`: cada detector trae la suya, no
// se comparte).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hitSlopPara } from '../lib/accesibilidad'
import { valorDeClaveDeEstilo } from './a11y/hitslop-medidas'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Recorte de comentarios línea por línea (mismo criterio que
 * `tests/dimensions.test.ts`/`tests/scripts-fuera-del-bundle.test.ts`): un
 * comentario de bloque deja la línea en blanco mientras dura, uno de línea
 * corta desde el `//`. */
function quitarComentarios(content: string): string {
  const lineasDeTexto = content.split('\n')
  const resultado: string[] = []
  let dentroDeBloqueComentario = false

  for (let linea of lineasDeTexto) {
    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) {
        resultado.push('')
        continue
      }
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    const inicioBloque = linea.indexOf('/*')
    if (inicioBloque !== -1 && linea.indexOf('*/', inicioBloque + 2) === -1) {
      linea = linea.slice(0, inicioBloque)
      dentroDeBloqueComentario = true
    }

    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    resultado.push(idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea))
  }

  return resultado.join('\n')
}

/** Mismo criterio que `hitSlopBotonAccion` que escriben, IDÉNTICO,
 * `components/BotonFavorito.tsx` y `components/BotonCompartir.tsx` (no
 * exportado ahí: no son archivos de esta tarea). Se reescribe acá, chico, y
 * el test de abajo ("la función real sigue con esta forma") es lo que evita
 * que los dos queden desincronizados sin que nadie lo note. */
function hitSlopBotonAccionEsperado(tamanio: number) {
  const base = hitSlopPara(tamanio)
  return tamanio <= 32 ? { ...base, left: 3, right: 3 } : base
}

describe('hitSlopBotonAccionEsperado (fixtures en memoria, el contrato que escriben BotonFavorito.tsx/BotonCompartir.tsx)', () => {
  it('40 (ficha): hitSlopPara(40) tal cual (4 en los 4 lados), SIN el recorte lateral', () => {
    expect(hitSlopBotonAccionEsperado(40)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 })
  })

  it('32 (tarjeta): left/right se bajan a 3 (el recorte), top/bottom quedan en el hitSlopPara(32) real', () => {
    const base = hitSlopPara(32)
    expect(hitSlopBotonAccionEsperado(32)).toEqual({ ...base, left: 3, right: 3 })
  })
})

/** La función `hitSlopBotonAccion` sigue teniendo la MISMA forma (`base` +
 * recorte lateral a 3 cuando `tamanio <= 32`) en el archivo real: si alguien
 * cambia el umbral, el recorte, o lo saca, este test lo nota (aunque el
 * número que resulte pueda seguir "andando" por casualidad). */
function tieneLaMismaFormaDeHitSlopBotonAccion(contenido: string): boolean {
  return /tamanio\s*<=\s*32\s*\?\s*\{\s*\.\.\.base,\s*left:\s*3,\s*right:\s*3\s*\}\s*:\s*base/.test(contenido)
}

describe.each(['components/BotonFavorito.tsx', 'components/BotonCompartir.tsx'] as const)(
  '%s: hitSlopBotonAccion sigue con la misma forma que este test espera',
  (archivo) => {
    it('el texto de la función coincide (base + recorte lateral a 3 cuando tamanio <= 32)', () => {
      const contenido = readFileSync(join(MOBILE_ROOT, ...archivo.split('/')), 'utf8')
      expect(
        tieneLaMismaFormaDeHitSlopBotonAccion(quitarComentarios(contenido)),
        `${archivo}: hitSlopBotonAccion cambió de forma — revisar a mano si el hitSlop de los botones vecinos sigue sin pisarse, y actualizar este test`,
      ).toBe(true)
    })
  },
)

/** El valor numérico de `gap` dentro del VALOR de una clave de estilo (ya
 * extraído con `valorDeClaveDeEstilo`, de `tests/a11y/hitslop-medidas.ts`:
 * no se copia esa función, se reusa). `null` si no hay un `gap` numérico
 * directo. */
function gapDe(valorEstilo: string): number | null {
  const m = valorEstilo.match(/\bgap\s*:\s*(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

describe('ficha del evento (app/evento/[id].tsx, estilos.accionesTitulo, tamanio 40): la suma de los dos hitSlop laterales no supera el gap', () => {
  it('gap leído del archivo + hitSlop de los dos botones enfrentados: no se pisan', () => {
    const contenido = quitarComentarios(readFileSync(join(MOBILE_ROOT, 'app', 'evento', '[id].tsx'), 'utf8'))
    const valorEstilo = valorDeClaveDeEstilo(contenido, 'accionesTitulo')
    expect(valorEstilo, 'no se encontró estilos.accionesTitulo en app/evento/[id].tsx').not.toBeNull()
    const gap = gapDe(valorEstilo as string)
    expect(gap, 'estilos.accionesTitulo no tiene un gap numérico directo').not.toBeNull()

    const hs = hitSlopBotonAccionEsperado(40)
    const sumaLateral = hs.left + hs.right
    expect(
      sumaLateral,
      `BotonFavorito (left ${hs.left}) + BotonCompartir (right ${hs.right}) = ${sumaLateral}, gap real = ${gap}`,
    ).toBeLessThanOrEqual(gap as number)
  })
})

describe('tarjeta de evento (components/TarjetaEvento.tsx, estilos.accionesArriba, tamanio 32): la suma de los dos hitSlop laterales no supera el gap', () => {
  it('gap leído del archivo + hitSlop de los dos botones enfrentados: no se pisan', () => {
    const contenido = quitarComentarios(readFileSync(join(MOBILE_ROOT, 'components', 'TarjetaEvento.tsx'), 'utf8'))
    const valorEstilo = valorDeClaveDeEstilo(contenido, 'accionesArriba')
    expect(valorEstilo, 'no se encontró estilos.accionesArriba en components/TarjetaEvento.tsx').not.toBeNull()
    const gap = gapDe(valorEstilo as string)
    expect(gap, 'estilos.accionesArriba no tiene un gap numérico directo').not.toBeNull()

    const hs = hitSlopBotonAccionEsperado(32)
    const sumaLateral = hs.left + hs.right
    expect(
      sumaLateral,
      `BotonCompartir (left ${hs.left}) + BotonFavorito (right ${hs.right}) = ${sumaLateral}, gap real = ${gap}`,
    ).toBeLessThanOrEqual(gap as number)
  })
})

// El Encabezado (logo a la izquierda, botón de usuario/"Ingresar" a la
// derecha, `justifyContent: 'space-between'`) NO tiene un `gap` escrito en
// el archivo: el espacio entre los dos depende del ancho real de la
// pantalla (layout), no de un número que se pueda leer acá. Se deja fuera
// del test (ver el reporte de la tarea, "para el teléfono") en vez de
// inventar un número.
describe('components/Encabezado.tsx: el espacio entre el logo y el botón de usuario no se puede leer del archivo (space-between, sin gap) — queda "para el teléfono"', () => {
  it('estilos.contenedor no tiene un gap numérico (confirma por qué este caso no entra al test de arriba)', () => {
    const contenido = quitarComentarios(readFileSync(join(MOBILE_ROOT, 'components', 'Encabezado.tsx'), 'utf8'))
    const valorEstilo = valorDeClaveDeEstilo(contenido, 'contenedor')
    expect(valorEstilo).not.toBeNull()
    expect(gapDe(valorEstilo as string)).toBeNull()
    expect(valorEstilo).toContain('space-between')
  })
})
