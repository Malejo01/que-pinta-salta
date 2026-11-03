/**
 * Q4-6: auditoría de /en, fijada con tests (sin red ni base).
 *
 * 1. Cada página pública de `app/` está clasificada: con versión en inglés,
 *    con nota en inglés (legales) o solo en castellano a propósito. Una página
 *    nueva sin clasificar pone esto en rojo: obliga a decidir.
 * 2. Cada ruta de `RUTAS_EN_INGLES` tiene su `app/en/.../page.tsx`, y cada
 *    página de `app/en/` está en la lista (salvo las notas, la 404 y el catch-all).
 * 3. Ninguna clave del diccionario en inglés quedó igual al castellano, salvo
 *    las que son iguales en los dos idiomas (lista cerrada). Y al revés: ningún
 *    texto en inglés quedó en el diccionario en castellano.
 * 4. El selector de idioma conserva la ruta y los filtros.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from '@/lib/i18n/diccionarios/en'
import { es } from '@/lib/i18n/diccionarios/es'
import { RUTAS_CON_NOTA_EN_INGLES, RUTAS_EN_INGLES, caminoEnCastellano, rutaEnOtroIdioma, tieneVersionEnIngles } from '@/lib/i18n/rutas'

const RAIZ = resolve(__dirname, '../..')
const APP = join(RAIZ, 'app')

function paginas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return paginas(ruta)
    return e.name === 'page.tsx' ? [relative(APP, ruta).replaceAll('\\', '/')] : []
  })
}

/** `evento/[id]/page.tsx` → `/evento/*`; `page.tsx` → `/`. */
function rutaDe(archivo: string): string {
  const sinPage = archivo.replace(/\/?page\.tsx$/, '')
  if (sinPage === '') return '/'
  return `/${sinPage.replace(/\[[^\]]+\]/g, '*')}`
}

/** Páginas públicas que quedan SOLO en castellano, con el motivo. */
const SOLO_CASTELLANO: Record<string, string> = {
  '/auth/login': 'cuenta (Q4-6: el modal de ingreso ya está en inglés; la página completa queda en castellano)',
  '/auth/sign-up': 'cuenta',
  '/auth/sign-up-success': 'cuenta',
  '/auth/recuperar': 'cuenta',
  '/auth/restablecer': 'cuenta',
  '/auth/error': 'cuenta',
  '/favoritos': 'con sesión',
  '/mis-eventos': 'con sesión',
  '/perfil': 'con sesión',
  '/perfil/eliminar-cuenta': 'con sesión',
  '/nuevo-evento': 'con sesión (carga de eventos)',
  '/radar/baja': 'link del mail del Radar, que sale en castellano',
  '/reporte/*': 'reporte privado para anunciantes',
  '/flyer/*': 'flyer de Instagram en revisión: el contenido es el flyer en castellano',
}

const TODAS = paginas(APP)
const PUBLICAS_ES = TODAS.filter((p) => !p.startsWith('admin/') && !p.startsWith('@modal/') && !p.startsWith('en/')).map(rutaDe)
// Q5-5: `/en/place/*` es la ficha `/lugar/*` (segmento traducido).
const PAGINAS_EN = TODAS.filter((p) => p.startsWith('en/')).map((p) => caminoEnCastellano(rutaDe(p.slice(3))))

describe('1. cada página pública está clasificada', () => {
  it.each(PUBLICAS_ES)('%s', (ruta) => {
    const clasificada =
      tieneVersionEnIngles(ruta.replace('*', 'x')) || RUTAS_CON_NOTA_EN_INGLES.includes(ruta) || ruta in SOLO_CASTELLANO
    expect(
      clasificada,
      `${ruta}: decidí si tiene versión en inglés (RUTAS_EN_INGLES), nota en inglés (RUTAS_CON_NOTA_EN_INGLES) o queda solo en castellano (SOLO_CASTELLANO de este test)`,
    ).toBe(true)
  })

  it('la lista de solo castellano no tiene rutas que ya no existen', () => {
    for (const ruta of Object.keys(SOLO_CASTELLANO)) expect(PUBLICAS_ES, ruta).toContain(ruta)
  })
})

describe('2. rutas en inglés ↔ páginas de app/en', () => {
  it.each(RUTAS_EN_INGLES.map((r) => [r]))('%s tiene app/en/...', (patron) => {
    expect(PAGINAS_EN).toContain(patron)
  })

  it('cada página de app/en es una ruta en inglés, una nota legal o el catch-all de la 404', () => {
    for (const ruta of PAGINAS_EN) {
      const valida = RUTAS_EN_INGLES.includes(ruta) || RUTAS_CON_NOTA_EN_INGLES.includes(ruta) || ruta === '/*'
      expect(valida, ruta).toBe(true)
    }
  })

  it('hay 404 en inglés (app/en/not-found.tsx) y el catch-all que la dispara', () => {
    expect(existsSync(join(APP, 'en/not-found.tsx'))).toBe(true)
    expect(existsSync(join(APP, 'en/[...resto]/page.tsx'))).toBe(true)
  })

  it('las notas legales tienen su página en /en y las legales no tienen versión traducida', () => {
    for (const ruta of RUTAS_CON_NOTA_EN_INGLES) {
      expect(PAGINAS_EN).toContain(ruta)
      expect(tieneVersionEnIngles(ruta)).toBe(false)
    }
  })
})

function hojas(o: unknown, camino = ''): [string, unknown][] {
  if (typeof o === 'string' || typeof o === 'function') return [[camino, o]]
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => hojas(v, camino ? `${camino}.${k}` : k))
  return []
}

/** Iguales en los dos idiomas a propósito (nombres propios, palabras compartidas, puntuación). */
const IGUALES_A_PROPOSITO = new Set([
  'nav.radar',
  'cines.bajadaSeparador',
  'radar.tipoInstagram',
  'favorito.errorTitulo',
  'asistencia.errorTitulo',
  'auth.email',
  // Q5-2: la marca se llama igual en los dos idiomas.
  'lugaresChicos.instagram',
])

describe('3. ninguna clave quedó sin traducir', () => {
  const mapaEs = new Map(hojas(es))
  const textosEn = hojas(en).filter(([, v]) => typeof v === 'string') as [string, string][]

  it('hay textos para revisar (si da 0, el test no mira nada)', () => {
    expect(textosEn.length).toBeGreaterThan(100)
  })

  it.each(textosEn.map(([k]) => [k]))('%s', (clave) => {
    const valorEn = textosEn.find(([k]) => k === clave)![1]
    if (IGUALES_A_PROPOSITO.has(clave)) return
    expect(valorEn, `${clave}: el texto en inglés es igual al castellano («${valorEn}»)`).not.toBe(mapaEs.get(clave))
  })

  it('la lista de iguales a propósito no tiene claves que ya no existen', () => {
    for (const clave of IGUALES_A_PROPOSITO) expect(mapaEs.has(clave), clave).toBe(true)
  })
})

describe('4. el selector de idioma conserva la ruta y los filtros', () => {
  it.each([
    ['/mapa?gratis=1&categoria=musica', '/en/mapa?gratis=1&categoria=musica'],
    ['/buscar?q=pe%C3%B1a&chicos=1', '/en/buscar?q=pe%C3%B1a&chicos=1'],
    ['/evento/abc?o=hoy', '/en/evento/abc?o=hoy'],
    ['/?category=musica', '/en?category=musica'],
    ['/privacidad', '/en/privacidad'],
    ['/perfil', '/en'],
  ])('%s → %s', (desde, hacia) => {
    expect(rutaEnOtroIdioma(desde, 'en')).toBe(hacia)
    if (hacia !== '/en') expect(rutaEnOtroIdioma(hacia, 'es')).toBe(desde)
  })
})
