// 29-b (F14, ops/paridad-web-app.md §3.4): lectura estática del orden de
// `app/evento/[id].tsx` y de los `accessibilityLabel` de `BotonFavorito`.
// Mismo estilo de detector con fixtures en memoria que
// `tests/tarjeta-evento.test.ts` y `tests/compartir-ficha.test.ts`: no hay
// `@testing-library/react-native` en el repo, así que esto no monta nada,
// solo lee el código fuente.
//
// R47, tarea 47-f (QPS-197): el corazón y Compartir se mudaron de
// `accionesTitulo` (junto al título) a `FilaAccionesEvento` (debajo de los
// CTAs, donde antes estaba `BotonesAsistencia`). El archivo tiene un
// comentario de cabecera que menciona "accionesTitulo" y "FilaAccionesEvento"
// al explicar el cambio: hay que sacar los comentarios ANTES de buscar, si
// no el detector se mide contra el comentario y no contra el código real.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const FICHA_PATH = join(MOBILE_ROOT, 'app', 'evento', '[id].tsx')
const BOTON_FAVORITO_PATH = join(MOBILE_ROOT, 'components', 'BotonFavorito.tsx')

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto (mismo criterio que tests/asistencia-umbral.test.ts). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

describe('app/evento/[id].tsx: el orden de la ficha (ops/paridad-web-app.md §3.4, decisión 2; R47 QPS-197)', () => {
  const content = quitarComentarios(readFileSync(FICHA_PATH, 'utf8'))

  const idxFilaFecha = content.indexOf('nombre="Calendar"')
  const idxComoLlegar = content.indexOf('Como llegar')
  const idxComprarTickets = content.indexOf('Comprar tickets')
  const idxFilaAccionesEvento = content.indexOf('<FilaAccionesEvento')

  it('tiene la fila de fecha, los dos CTAs y FilaAccionesEvento (Guardar/Voy/Compartir)', () => {
    expect(idxFilaFecha).toBeGreaterThan(-1)
    expect(idxComoLlegar).toBeGreaterThan(-1)
    expect(idxComprarTickets).toBeGreaterThan(-1)
    expect(idxFilaAccionesEvento).toBeGreaterThan(-1)
  })

  it('"Como llegar" está antes que "Comprar tickets"', () => {
    expect(idxComoLlegar).toBeLessThan(idxComprarTickets)
  })

  it('FilaAccionesEvento (Guardar/Voy/Compartir) está después de los dos CTAs', () => {
    expect(idxFilaAccionesEvento).toBeGreaterThan(idxComoLlegar)
    expect(idxFilaAccionesEvento).toBeGreaterThan(idxComprarTickets)
  })

  it('no queda "Guardar" (el texto viejo del corazón, como CTA)', () => {
    expect(content).not.toMatch(/Guardar/)
  })

  it('no queda "Me interesa" ni "me_interesa" (modelo viejo, QPS-197)', () => {
    expect(content).not.toMatch(/Me interesa/i)
    expect(content).not.toMatch(/me_interesa/)
  })

  it('BotonFavorito ya no está en accionesTitulo: la ficha no lo usa directo (se mudó a FilaAccionesEvento)', () => {
    expect(content).not.toMatch(/<BotonFavorito\b/)
  })

  it('pide la variante 800 de la imagen (ops/paridad-web-app.md §3.4: como la web, no la 400 por defecto)', () => {
    expect(content).toMatch(/<Afiche[\s\S]{0,80}ancho=\{800\}/)
  })
})

describe('components/BotonFavorito.tsx: los dos accessibilityLabel (icono solo, sin texto "Guardar")', () => {
  const content = readFileSync(BOTON_FAVORITO_PATH, 'utf8')

  it('tiene accessibilityLabel "Agregar a favoritos"', () => {
    expect(content).toMatch(/Agregar a favoritos/)
  })

  it('tiene accessibilityLabel "Quitar de favoritos"', () => {
    expect(content).toMatch(/Quitar de favoritos/)
  })
})
