// R69, 69-r1: arreglos de 69-a pedidos por ux-ui. Sin red ni base; detectores
// sobre el texto fuente (sin comentarios), cada uno probado también sobre una
// COPIA EN MEMORIA con la rotura aplicada (nunca se edita producción).
// Roturas probadas:
//   - el contenedor del badge sin borde derecho (el corazón lo tapa)
//   - el badge con `maxWidth` fijo en vez de `flexShrink: 1`
//   - la etiqueta del corazón sin el nombre
//   - la tarjeta o una ficha sin pasar `nombre` al corazón
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TARJETA_GAP_ACCIONES, TARJETA_MARGEN, TARJETA_TAMANIO_ACCION } from '../lib/accesibilidad'
import { en } from '../lib/i18n/diccionarios/en'
import { es } from '../lib/i18n/diccionarios/es'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

export function violacionesDeBadge(fuente: string): string[] {
  const c = sinComentarios(fuente)
  const v: string[] = []

  // El contenedor del badge lleva `right` en el JSX (según los botones que haya).
  if (!/<View style=\{\[estilos\.arriba,\s*\{\s*right:\s*[^}]+\}\s*\]\}/.test(c)) {
    v.push('el contenedor del badge (estilos.arriba) no tiene borde derecho')
  }
  const arriba = /arriba:\s*\{([^}]*)\}/.exec(c)
  if (!arriba) v.push('no hay estilos.arriba')
  else if (!/alignItems:\s*'flex-start'/.test(arriba[1])) v.push('estilos.arriba no es alignItems: flex-start')

  const badge = /\bbadge:\s*\{([^}]*)\}/.exec(c)
  if (!badge) v.push('no hay estilos.badge')
  else {
    if (!/flexShrink:\s*1\b/.test(badge[1])) v.push('el badge no tiene flexShrink: 1')
    if (/maxWidth/.test(badge[1])) v.push('el badge tiene un maxWidth fijo')
  }
  return v
}

export function violacionesDeEtiquetaFavorito(boton: string, usos: Record<string, string>): string[] {
  const c = sinComentarios(boton)
  const v: string[] = []
  if (!/nombre\?:\s*string/.test(c)) v.push('BotonFavorito no tiene la prop opcional nombre')
  // Q6-1: con el idioma de la app; los textos salen del diccionario
  // (`tarjeta.agregarFavorito` / `tarjeta.quitarFavorito`, que reciben el nombre).
  if (!/accessibilityLabel=\{etiquetaFavorito\(marcado,\s*nombre,\s*idioma\)\}/.test(c)) v.push('la etiqueta no sale de etiquetaFavorito(marcado, nombre)')
  const fn = /function etiquetaFavorito\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(c)
  if (!fn) v.push('no hay etiquetaFavorito')
  else {
    if (!/t\.agregarFavorito\(nombre \|\| undefined\)/.test(fn[1]) || es.tarjeta.agregarFavorito('X') !== 'Agregar X a favoritos') v.push('falta "Agregar <nombre> a favoritos"')
    if (!/t\.quitarFavorito\(nombre \|\| undefined\)/.test(fn[1]) || es.tarjeta.quitarFavorito('X') !== 'Quitar X de favoritos') v.push('falta "Quitar <nombre> de favoritos"')
    if (es.tarjeta.agregarFavorito() !== 'Agregar a favoritos' || es.tarjeta.quitarFavorito() !== 'Quitar de favoritos') v.push('falta la etiqueta sin nombre')
    if (en.tarjeta.agregarFavorito('X') !== 'Add X to favourites') v.push('falta el inglés')
  }
  for (const [archivo, fuente] of Object.entries(usos)) {
    if (!/<BotonFavorito[^>]*\bnombre=\{/.test(sinComentarios(fuente))) v.push(`${archivo} no pasa nombre a BotonFavorito`)
  }
  return v
}

describe('components/TarjetaEvento.tsx: el corazón no tapa el badge de categoría', () => {
  const real = leer('components', 'TarjetaEvento.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesDeBadge(real)).toEqual([])
  })

  it('rotura: sin borde derecho en el contenedor del badge', () => {
    const roto = real.replace('style={[estilos.arriba, { right: derechaArriba }]}', 'style={estilos.arriba}')
    expect(roto).not.toBe(real)
    expect(violacionesDeBadge(roto).length).toBeGreaterThan(0)
  })

  it('rotura: el badge con maxWidth fijo en vez de flexShrink', () => {
    const roto = real.replace('paddingVertical: 3, flexShrink: 1', 'paddingVertical: 3, maxWidth: 140')
    expect(roto).not.toBe(real)
    const v = violacionesDeBadge(roto)
    expect(v).toContain('el badge tiene un maxWidth fijo')
    expect(v).toContain('el badge no tiene flexShrink: 1')
  })

  it('el borde derecho coincide con las cuentas: 48 con el corazón solo, 86 con Compartir + corazón', () => {
    // 8 (margen) + n * 32 + (n - 1) * 6 + 8
    const c = sinComentarios(real)
    // R72, 72-c: la tarjeta toma las medidas de lib/accesibilidad (TARJETA_*).
    expect(c).toMatch(/const TAMANIO_ACCION = TARJETA_TAMANIO_ACCION\b/)
    expect(c).toMatch(/const GAP_ACCIONES = TARJETA_GAP_ACCIONES\b/)
    expect(c).toMatch(/const MARGEN_ARRIBA = TARJETA_MARGEN\b/)
    expect([TARJETA_TAMANIO_ACCION, TARJETA_GAP_ACCIONES, TARJETA_MARGEN]).toEqual([32, 6, 8])
    const derecha = (n: number) => (n <= 0 ? 8 : 8 + n * 32 + (n - 1) * 6 + 8)
    expect([derecha(0), derecha(1), derecha(2)]).toEqual([8, 48, 86])
  })
})

describe('BotonFavorito: la etiqueta dice qué se guarda', () => {
  const boton = leer('components', 'BotonFavorito.tsx')
  const usos = {
    'components/TarjetaEvento.tsx': leer('components', 'TarjetaEvento.tsx'),
    'app/pelicula/[id].tsx': leer('app', 'pelicula', '[id].tsx'),
    'app/flyer/[id].tsx': leer('app', 'flyer', '[id].tsx'),
  }

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesDeEtiquetaFavorito(boton, usos)).toEqual([])
  })

  it('rotura: la etiqueta ignora el nombre', () => {
    const roto = boton.replace('accessibilityLabel={etiquetaFavorito(marcado, nombre, idioma)}', "accessibilityLabel={marcado ? 'Quitar de favoritos' : 'Agregar a favoritos'}")
    expect(roto).not.toBe(boton)
    expect(violacionesDeEtiquetaFavorito(roto, usos).length).toBeGreaterThan(0)
  })

  it('rotura: la etiqueta con nombre sin el nombre', () => {
    // Q6-1: la rotura es dejar de pasarle el nombre al texto del diccionario.
    const roto = boton.replace('t.agregarFavorito(nombre || undefined)', 't.agregarFavorito()')
    expect(roto).not.toBe(boton)
    expect(violacionesDeEtiquetaFavorito(roto, usos)).toContain('falta "Agregar <nombre> a favoritos"')
  })

  it.each(Object.keys(usos))('rotura: %s sin pasar nombre', (archivo) => {
    const roto = { ...usos, [archivo]: usos[archivo as keyof typeof usos].replace(/ nombre=\{/, ' sinNombre={') }
    expect(roto[archivo as keyof typeof usos]).not.toBe(usos[archivo as keyof typeof usos])
    expect(violacionesDeEtiquetaFavorito(boton, roto)).toContain(`${archivo} no pasa nombre a BotonFavorito`)
  })

  it('la ficha de flyer marca el título como encabezado', () => {
    expect(sinComentarios(usos['app/flyer/[id].tsx'])).toMatch(/<Texto peso="bold" accessibilityRole="header"/)
  })
})
