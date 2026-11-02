/**
 * Las secciones `radar` y `anunciantes` de los diccionarios (78-b): mismas
 * claves en castellano e inglés, ningún texto vacío ni copiado del castellano,
 * castellano en voseo, productos del inglés para cada id del TARIFARIO real y
 * `errorServidor` en inglés por código de error de `lib/actions/radar.ts`
 * (sin filtrar el código crudo). Sin red ni base.
 */
import { describe, expect, it } from 'vitest'
import { TARIFARIO } from '@qps/core/publicidad/precios'
import { es } from '@/lib/i18n/diccionarios/es'
import { en } from '@/lib/i18n/diccionarios/en'

type Seccion = Record<string, unknown>
const SECCIONES = ['radar', 'anunciantes'] as const

/** Textos que pueden ser iguales en los dos idiomas (nombres propios). */
const IGUALES_PERMITIDOS = new Set<string>(['radar.tipoInstagram'])

/** Claves que son un catálogo (objeto) y no un texto: se revisan aparte. */
const CATALOGOS = new Set<string>(['anunciantes.productos'])

const ARGUMENTOS: Record<string, unknown[]> = {
  subtituloCuenta: ['usuario_de_prueba'],
  // Argumentos neutros para que los chequeos de idioma miren solo el texto del diccionario.
  dejarDeSeguir: ['X'],
  errorServidor: ['INVALID'],
  pruebaEnviada: [2],
  masDe: ['12'],
}

const claves = (seccion: Seccion) => Object.keys(seccion)

function textoDe(seccion: Seccion, clave: string): string {
  const valor = seccion[clave]
  if (typeof valor === 'string') return valor
  const args = ARGUMENTOS[clave]
  if (!args) throw new Error(`Falta ARGUMENTOS para la función ${clave}`)
  return (valor as (...a: unknown[]) => string)(...args)
}

const textuales = (nombre: (typeof SECCIONES)[number]) =>
  claves(es[nombre] as Seccion).filter((c) => !CATALOGOS.has(`${nombre}.${c}`))

describe.each(SECCIONES)('sección %s', (nombre) => {
  const seccionEs = es[nombre] as Seccion
  const seccionEn = en[nombre] as Seccion

  it('tiene las mismas claves en es y en, en el mismo orden', () => {
    expect(claves(seccionEn)).toEqual(claves(seccionEs))
    expect(claves(seccionEs).length).toBeGreaterThan(10)
  })

  it('cada clave es del mismo tipo (texto con texto, función con función, catálogo con catálogo)', () => {
    for (const clave of claves(seccionEs)) {
      expect(typeof seccionEn[clave], clave).toBe(typeof seccionEs[clave])
    }
  })

  it('ninguna función queda sin argumentos de prueba en este test (si se suma una, hay que cubrirla)', () => {
    for (const clave of claves(seccionEs)) {
      if (typeof seccionEs[clave] === 'function') expect(ARGUMENTOS, clave).toHaveProperty(clave)
    }
  })

  it('ningún texto es vacío, en ninguno de los dos idiomas', () => {
    for (const clave of textuales(nombre)) {
      expect(textoDe(seccionEs, clave).trim().length, `es.${nombre}.${clave}`).toBeGreaterThan(0)
      expect(textoDe(seccionEn, clave).trim().length, `en.${nombre}.${clave}`).toBeGreaterThan(0)
    }
  })

  it('ningún texto en inglés es idéntico al castellano (salvo nombres propios)', () => {
    for (const clave of textuales(nombre)) {
      if (IGUALES_PERMITIDOS.has(`${nombre}.${clave}`)) continue
      expect(textoDe(seccionEn, clave), `en.${nombre}.${clave}`).not.toBe(textoDe(seccionEs, clave))
    }
  })

  it('el inglés no arrastra palabras sueltas del castellano', () => {
    const CASTELLANO = /\b(evento|eventos|lugar|lugares|gratis|buscar|recibir|guardar|frecuencia|correo|cuenta|precios|vigentes|próximamente)\b/i
    for (const clave of textuales(nombre)) {
      expect(textoDe(seccionEn, clave), `en.${nombre}.${clave}`).not.toMatch(CASTELLANO)
    }
  })

  it('el castellano no tutea (voseo rioplatense)', () => {
    // «Prueba» como sustantivo («Enviar Correo de Prueba») no es tuteo; el imperativo en «tú» no lleva tilde.
    const TUTEO =
      /\b(tienes|quieres|puedes|debes|eres|tú|elige|busca|saca|mira|selecciona|quita|escribe|revisa|inténtalo|intenta|vuelve|haz|pulsa|ingresa|encuentra|descubre|suscríbete|decides|personaliza|recibe)\b/i
    for (const clave of textuales(nombre)) {
      expect(textoDe(seccionEs, clave), `es.${nombre}.${clave}`).not.toMatch(TUTEO)
    }
  })
})

describe('el castellano que ya existía no cambió', () => {
  it('radar: título y bajada de siempre, en voseo', () => {
    expect(es.radar.titulo).toBe('Mi Radar Salteño')
    expect(es.radar.bajada).toBe(
      'Vos decidís qué eventos ver y recibir. Suscribite a tus categorías, locales u organizadores favoritos de Instagram y recibí alertas a tu correo sin spam.',
    )
    expect(es.radar.frecuenciaPregunta).toBe('¿Cada cuánto querés recibir novedades?')
    expect(es.radar.listoTitulo).toBe('¡Ya estás en el Radar! 📧')
  })

  it('anunciantes: título y precios de siempre', () => {
    expect(es.anunciantes.titulo).toBe('Publicitá tu evento')
    expect(es.anunciantes.numerosTitulo).toBe('El sitio en números')
    expect(es.anunciantes.vigentesAntes + 'noviembre 2026' + es.anunciantes.vigentesDespues).toBe(
      'Vigentes noviembre 2026. Precios finales: no se les suma IVA.',
    )
    expect(es.anunciantes.masDe('12')).toBe('más de 12')
  })

  it('en castellano el mensaje del servidor manda: errorServidor no distingue códigos', () => {
    expect(es.radar.errorServidor('AUTH_REQUIRED')).toBe(es.radar.errorInesperado)
    expect(es.radar.errorServidor(undefined)).toBe(es.radar.errorInesperado)
  })
})

describe('anunciantes.productos', () => {
  const idsTarifario = TARIFARIO.map((p) => p.id)

  it('el inglés cubre todos los ids del TARIFARIO real, ni uno más ni uno menos', () => {
    expect(Object.keys(en.anunciantes.productos).sort()).toEqual([...idsTarifario].sort())
  })

  it('el castellano sale del tarifario real: mismo nombre y mismo «qué incluye»', () => {
    for (const p of TARIFARIO) {
      expect(es.anunciantes.productos[p.id]).toEqual({ nombre: p.nombre, queIncluye: p.queIncluye })
    }
  })

  it.each(idsTarifario)('%s: nombre y «qué incluye» no vacíos, en inglés y distintos del castellano', (id) => {
    const productosEn: Record<string, { nombre: string; queIncluye: string }> = en.anunciantes.productos
    const textoEn = productosEn[id]
    const textoEs = es.anunciantes.productos[id]
    expect(textoEn.nombre.trim().length).toBeGreaterThan(0)
    expect(textoEn.queIncluye.trim().length).toBeGreaterThan(0)
    expect(textoEn.nombre).not.toBe(textoEs.nombre)
    expect(textoEn.queIncluye).not.toBe(textoEs.queIncluye)
    expect(`${textoEn.nombre} ${textoEn.queIncluye}`).not.toMatch(/\b(destacado|semana|publicación|tu evento|mes|días)\b/i)
  })
})

describe('radar.errorServidor en inglés', () => {
  // Los códigos que devuelve lib/actions/radar.ts (updateRadarSettings).
  const CODIGOS = ['AUTH_REQUIRED', 'NO_EMAIL', 'INVALID', 'DB_ERROR'] as const

  it.each(CODIGOS)('%s: un texto en inglés que no muestra el código crudo', (codigo) => {
    const texto = en.radar.errorServidor(codigo)
    expect(texto.trim().length).toBeGreaterThan(10)
    expect(texto).not.toContain(codigo)
    expect(texto).not.toMatch(/_/)
    expect(texto).not.toBe(en.radar.errorServidor('CODIGO_INVENTADO'))
    expect(texto).not.toBe(es.radar.errorInesperado)
  })

  it('los cuatro textos son distintos entre sí', () => {
    const textos = CODIGOS.map((c) => en.radar.errorServidor(c))
    expect(new Set(textos).size).toBe(CODIGOS.length)
  })

  it('un código desconocido, vacío o ausente devuelve el genérico, sin filtrar el código', () => {
    const generico = en.radar.errorInesperado
    expect(en.radar.errorServidor('CODIGO_RARO_DE_PRUEBA')).toBe(generico)
    expect(en.radar.errorServidor('CODIGO_RARO_DE_PRUEBA')).not.toContain('CODIGO_RARO')
    expect(en.radar.errorServidor('')).toBe(generico)
    expect(en.radar.errorServidor(undefined)).toBe(generico)
    // Mayúsculas y minúsculas importan: el código llega exacto del servidor.
    expect(en.radar.errorServidor('invalid')).toBe(generico)
  })

  it('el mensaje de un error del servidor en castellano nunca se usa como código', () => {
    expect(en.radar.errorServidor('Tenés que iniciar sesión para configurar tu radar.')).toBe(en.radar.errorInesperado)
  })
})

describe('radar: plurales y funciones', () => {
  it('pruebaEnviada concuerda en número en inglés (1 update / N updates)', () => {
    expect(en.radar.pruebaEnviada(1)).toContain('1 update ')
    expect(en.radar.pruebaEnviada(0)).toContain('0 updates')
    expect(en.radar.pruebaEnviada(5)).toContain('5 updates')
  })

  it('subtituloCuenta y dejarDeSeguir incluyen el dato recibido', () => {
    expect(en.radar.subtituloCuenta('cuenta_de_prueba')).toContain('@cuenta_de_prueba')
    expect(es.radar.subtituloCuenta('cuenta_de_prueba')).toContain('@cuenta_de_prueba')
    expect(en.radar.dejarDeSeguir('@cuenta_de_prueba')).toBe('Unfollow @cuenta_de_prueba')
    expect(es.radar.dejarDeSeguir('@cuenta_de_prueba')).toBe('Dejar de seguir @cuenta_de_prueba')
  })
})
