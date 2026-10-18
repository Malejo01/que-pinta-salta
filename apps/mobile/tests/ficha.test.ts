// 29-b (F14, ops/paridad-web-app.md §3.4): lectura estática del orden de
// `app/evento/[id].tsx` y de los `accessibilityLabel` de `BotonFavorito`.
// Mismo estilo de detector con fixtures en memoria que
// `tests/tarjeta-evento.test.ts` y `tests/compartir-ficha.test.ts`: no hay
// `@testing-library/react-native` en el repo, así que esto no monta nada,
// solo lee el código fuente.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const FICHA_PATH = join(MOBILE_ROOT, 'app', 'evento', '[id].tsx')
const BOTON_FAVORITO_PATH = join(MOBILE_ROOT, 'components', 'BotonFavorito.tsx')

describe('app/evento/[id].tsx: el orden de la ficha (ops/paridad-web-app.md §3.4, decisión 2 del apéndice del plan)', () => {
  const content = readFileSync(FICHA_PATH, 'utf8')

  const idxBotonFavorito = content.indexOf('<BotonFavorito')
  const idxBotonCompartir = content.indexOf('<BotonCompartir')
  const idxFilaFecha = content.indexOf('nombre="Calendar"')
  const idxComoLlegar = content.indexOf('Como llegar')
  const idxComprarTickets = content.indexOf('Comprar tickets')
  const idxBotonesAsistencia = content.indexOf('<BotonesAsistencia')

  it('tiene el corazón (BotonFavorito), BotonCompartir, la fila de fecha, los dos CTAs y Voy/Me interesa', () => {
    expect(idxBotonFavorito).toBeGreaterThan(-1)
    expect(idxBotonCompartir).toBeGreaterThan(-1)
    expect(idxFilaFecha).toBeGreaterThan(-1)
    expect(idxComoLlegar).toBeGreaterThan(-1)
    expect(idxComprarTickets).toBeGreaterThan(-1)
    expect(idxBotonesAsistencia).toBeGreaterThan(-1)
  })

  it('el corazón y BotonCompartir están antes que la fila de la fecha', () => {
    expect(idxBotonFavorito).toBeLessThan(idxFilaFecha)
    expect(idxBotonCompartir).toBeLessThan(idxFilaFecha)
  })

  it('"Como llegar" está antes que "Comprar tickets"', () => {
    expect(idxComoLlegar).toBeLessThan(idxComprarTickets)
  })

  it('"Voy / Me interesa" (BotonesAsistencia) está después de los dos CTAs', () => {
    expect(idxBotonesAsistencia).toBeGreaterThan(idxComoLlegar)
    expect(idxBotonesAsistencia).toBeGreaterThan(idxComprarTickets)
  })

  it('no queda "Guardar" (el texto viejo del corazón, como CTA)', () => {
    expect(content).not.toMatch(/Guardar/)
  })

  it('pide la variante 800 de la imagen (ops/paridad-web-app.md §3.4: como la web, no la 400 por defecto)', () => {
    expect(content).toMatch(/<Afiche[\s\S]{0,80}ancho=\{800\}/)
  })
})

// R42, 42-c: "Agregar al calendario" (BotonCalendario) va dentro de
// `estilos.ctas`, DESPUÉS de "Comprar tickets" (el bloque condicional) y
// ANTES de cerrar ese `View` — `<BotonesAsistencia>` ya estaba fuera de ese
// `View`, así que sigue después. Mismo estilo de detector con fixtures en
// memoria, sobre el archivo real; los casos de arriba (de 29-b) no se tocan.
describe('app/evento/[id].tsx: "Agregar al calendario" (BotonCalendario, R42 42-c)', () => {
  const content = readFileSync(FICHA_PATH, 'utf8')

  const idxComprarTickets = content.indexOf('Comprar tickets')
  const idxBotonCalendario = content.indexOf('<BotonCalendario')
  const idxBotonesAsistencia = content.indexOf('<BotonesAsistencia')

  it('tiene <BotonCalendario', () => {
    expect(idxBotonCalendario).toBeGreaterThan(-1)
  })

  it('<BotonCalendario está después de "Comprar tickets"', () => {
    expect(idxBotonCalendario).toBeGreaterThan(idxComprarTickets)
  })

  it('<BotonCalendario está antes de <BotonesAsistencia', () => {
    expect(idxBotonCalendario).toBeLessThan(idxBotonesAsistencia)
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
