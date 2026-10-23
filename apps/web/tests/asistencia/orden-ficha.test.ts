/**
 * Detector estático sobre el TEXTO de `components/event-detail-page.tsx` y
 * `components/event-modal-wrapper.tsx` (R47, tarea 47-c, QPS-199): el ♥ y
 * Compartir salieron del encabezado, la fila (`<FilaAccionesEvento`) quedó
 * debajo de "Comprar tickets", y `<BotonSeguir` vive junto al lugar.
 *
 * Despojamos los comentarios ANTES de buscar: si no, un comentario que
 * nombre un componente (por ejemplo, explicando por qué salió de ahí)
 * rompería el conteo. Ver `sinComentarios`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function leer(ruta: string): string {
  return readFileSync(`${WEB_ROOT}/${ruta}`, 'utf8')
}

/** Comentarios de línea y de bloque (también los de JSX) vaciados. */
function sinComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/** El recorte del código entre dos marcas, para acotar el detector a UN bloque y no a todo el archivo. */
function ancla(codigo: string, desde: string, hasta: string): string {
  const inicio = codigo.indexOf(desde)
  expect(inicio, `no se encontró "${desde}"`).toBeGreaterThanOrEqual(0)
  const fin = codigo.indexOf(hasta, inicio + desde.length)
  expect(fin, `no se encontró "${hasta}" después de "${desde}"`).toBeGreaterThan(inicio)
  return codigo.slice(inicio, fin)
}

const RUTA_FICHA = 'components/event-detail-page.tsx'
const RUTA_WRAPPER = 'components/event-modal-wrapper.tsx'

describe('event-detail-page.tsx (la ficha)', () => {
  const codigo = sinComentarios(leer(RUTA_FICHA))

  it('<FilaAccionesEvento aparece DESPUÉS de "Comprar tickets"', () => {
    const iComprar = codigo.indexOf('Comprar tickets')
    const iFila = codigo.indexOf('<FilaAccionesEvento')
    expect(iComprar).toBeGreaterThan(0)
    expect(iFila).toBeGreaterThan(iComprar)
  })

  it('<FavoriteButton y <ShareButton ya NO están en el bloque del título', () => {
    // Ancla: el bloque del título es el único <h1> de la ficha (desde la
    // etiqueta de apertura hasta el "{isAdmin &&" que sigue inmediatamente
    // después, antes de que arranque cualquier otra cosa). No usamos una
    // cadena como "FavoriteButton" sin acotar: esa palabra sigue existiendo
    // en el archivo (en `favorite-button.tsx` no, pero si alguien dejara un
    // <FavoriteButton más abajo por error, un detector sin ancla no lo
    // vería; y si buscáramos solo "ShareButton" sin acotar, el de la fila
    // nueva —correcto, vive ahí por la prop `compartir`— haría fallar el
    // test aunque el encabezado esté bien). Por eso se acota al bloque.
    const bloqueTitulo = ancla(codigo, '<h1', '{isAdmin')
    expect(bloqueTitulo).not.toMatch(/<FavoriteButton\b/)
    expect(bloqueTitulo).not.toMatch(/<ShareButton\b/)
  })

  it('<BotonSeguir está en el bloque del lugar (el <MapPin de la dirección)', () => {
    const bloqueLugar = ancla(codigo, '<MapPin', 'displayEvent.vibe')
    expect(bloqueLugar).toMatch(/<BotonSeguir\b/)
  })

  it('el ShareButton de la fila se le pasa a FilaAccionesEvento por la prop compartir', () => {
    expect(codigo).toMatch(/compartir=\{\s*<ShareButton/)
  })
})

describe('event-modal-wrapper.tsx (el modal interceptado)', () => {
  const codigo = sinComentarios(leer(RUTA_WRAPPER))

  it('<FilaAccionesEvento aparece DESPUÉS de "Comprar tickets"', () => {
    const iComprar = codigo.indexOf('Comprar tickets')
    const iFila = codigo.indexOf('<FilaAccionesEvento')
    expect(iComprar).toBeGreaterThan(0)
    expect(iFila).toBeGreaterThan(iComprar)
  })

  it('<FavoriteButton y <ShareButton ya NO están en el bloque del título', () => {
    // Mismo criterio que en la ficha: el <DialogTitle> es el único título
    // del modal, y "{isAdmin &&" es el bloque que sigue inmediatamente
    // después. Acotar evita que el <ShareButton de la fila (correcto, por
    // `compartir`) haga fallar un detector sin ancla.
    const bloqueTitulo = ancla(codigo, '<DialogTitle', '{isAdmin')
    expect(bloqueTitulo).not.toMatch(/<FavoriteButton\b/)
    expect(bloqueTitulo).not.toMatch(/<ShareButton\b/)
  })

  it('<BotonSeguir está en el bloque del lugar (el <MapPin de la dirección)', () => {
    const bloqueLugar = ancla(codigo, '<MapPin', 'displayEvent.vibe')
    expect(bloqueLugar).toMatch(/<BotonSeguir\b/)
  })

  it('el ShareButton de la fila se le pasa a FilaAccionesEvento por la prop compartir', () => {
    expect(codigo).toMatch(/compartir=\{\s*<ShareButton/)
  })
})
