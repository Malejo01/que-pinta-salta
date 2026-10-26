// R67, 67-q: rutas de la app. Cubre `lib/rutas.ts` (rutaDeEvento,
// rutaPorPrefijo, esEventoReal), el bug F6 (las películas 2, 3 y 4 de la
// fila "Cine" abrían la ficha equivocada) por dato, y dos detectores por
// texto con su caso falso para que puedan fallar de verdad.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformMovie, type MovieForDisplay } from '@qps/core/home/transform'
import { esEventoReal, rutaDeEvento, rutaPorPrefijo } from '@/lib/rutas'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

const evento = { id: 'a1b2c3d4-0000-4000-8000-000000000001', isCinemaMovie: undefined, isInstagramFlyer: undefined, flyerId: undefined }

describe('rutaDeEvento', () => {
  it('evento común -> /evento/<id>', () => {
    expect(rutaDeEvento(evento)).toBe('/evento/a1b2c3d4-0000-4000-8000-000000000001')
  })

  it('película -> /pelicula/<uuid> sin el prefijo', () => {
    expect(rutaDeEvento({ id: 'movie-uuid-de-prueba', isCinemaMovie: true })).toBe('/pelicula/uuid-de-prueba')
  })

  it('flyer con flyerId -> /flyer/<flyerId>', () => {
    expect(rutaDeEvento({ id: 'ig-otro', isInstagramFlyer: true, flyerId: 'flyer-de-prueba' })).toBe('/flyer/flyer-de-prueba')
  })

  it('flyer sin flyerId -> /flyer/<id sin ig->', () => {
    expect(rutaDeEvento({ id: 'ig-flyer-9', isInstagramFlyer: true })).toBe('/flyer/flyer-9')
  })

  it('el prefijo solo se saca al principio, una vez', () => {
    expect(rutaDeEvento({ id: 'movie-movie-1', isCinemaMovie: true })).toBe('/pelicula/movie-1')
    expect(rutaDeEvento({ id: 'ig-ig-1', isInstagramFlyer: true })).toBe('/flyer/ig-1')
    expect(rutaDeEvento({ id: 'movie-x-movie-y', isCinemaMovie: true })).toBe('/pelicula/x-movie-y')
  })
})

describe('bug F6: cuatro películas como las arma la portada', () => {
  const base: Omit<MovieForDisplay, 'id' | 'slug' | 'title'> = {
    poster_url: null,
    showings: {},
    created_at: '2026-10-01T12:00:00.000Z',
  }
  const peliculas = [1, 2, 3, 4].map((n) =>
    transformMovie(
      { ...base, id: `00000000-0000-4000-8000-00000000000${n}`, slug: `pelicula-de-prueba-${n}`, title: `Película de Prueba ${n}` },
      '2026-10-24'
    )
  )

  it('cada película da /pelicula/<su id>, no solo la primera', () => {
    peliculas.forEach((p, i) => {
      expect(rutaDeEvento(p)).toBe(`/pelicula/00000000-0000-4000-8000-00000000000${i + 1}`)
    })
  })

  it('las cuatro rutas son distintas y ninguna es /evento/… ni /', () => {
    const rutas = peliculas.map((p) => rutaDeEvento(p))
    expect(new Set(rutas).size).toBe(4)
    for (const r of rutas) {
      expect(r.startsWith('/pelicula/')).toBe(true)
      expect(r.startsWith('/evento/')).toBe(false)
      expect(r).not.toBe('/')
    }
  })
})

describe('rutaPorPrefijo', () => {
  const UUID = 'a1b2c3d4-0000-4000-8000-000000000001'
  it('movie-<uuid> -> /pelicula/<uuid>', () => {
    expect(rutaPorPrefijo(`movie-${UUID}`)).toBe(`/pelicula/${UUID}`)
  })
  it('ig-<uuid> -> /flyer/<uuid>', () => {
    expect(rutaPorPrefijo(`ig-${UUID}`)).toBe(`/flyer/${UUID}`)
  })
  // El id llega de un deep link: detrás del prefijo solo se acepta un uuid
  // (lo mismo que exigen `/pelicula/[id]` y `/flyer/[id]`), nunca un pedazo
  // de ruta armado a mano.
  it.each([
    ['un uuid', UUID],
    ['movie- solo', 'movie-'],
    ['ig- solo', 'ig-'],
    ['vacío', ''],
    ['xmovie-1', 'xmovie-1'],
    ['MOVIE-1', 'MOVIE-1'],
    ['movie- con algo que no es uuid', 'movie-abc'],
    ['ig- con algo que no es uuid', 'ig-abc'],
    ['movie- con un pedazo de ruta', `movie-../cuenta`],
    ['movie- con uuid y algo más', `movie-${UUID}/x`],
  ])('%s -> null', (_n, id) => {
    expect(rutaPorPrefijo(id)).toBeNull()
  })
})

describe('esEventoReal', () => {
  it('evento común: true', () => {
    expect(esEventoReal({})).toBe(true)
    expect(esEventoReal({ isCinemaMovie: false, isInstagramFlyer: false })).toBe(true)
  })
  it('película: false', () => {
    expect(esEventoReal({ isCinemaMovie: true })).toBe(false)
  })
  it('flyer: false', () => {
    expect(esEventoReal({ isInstagramFlyer: true })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Detectores por texto
// ---------------------------------------------------------------------------

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** router.push( con un template literal que lleva /evento/ (sin pasar por rutaDeEvento). */
export function violacionesDeNavegacion(src: string): string[] {
  const c = sinComentarios(src)
  const v: string[] = []
  if (/router\.push\(\s*`[^`]*\/evento\//.test(c)) v.push('router.push con template /evento/')
  if (!/import\s*\{[^}]*\brutaDeEvento\b[^}]*\}\s*from\s*['"]@\/lib\/rutas['"]/.test(c)) {
    v.push('no importa rutaDeEvento de @/lib/rutas')
  }
  if (!/rutaDeEvento\(/.test(c)) v.push('no llama a rutaDeEvento(')
  return v
}

/** Capa transparente (absoluteFill dentro de un Pressable) y el replace de movie-. */
export function violacionesDeCapa(src: string): string[] {
  const c = sinComentarios(src)
  const v: string[] = []
  // Vuelta 1: antes se buscaba dentro de la etiqueta con [^>]*, que se cortaba
  // en el `>` de `() =>`. Ahora se prohíbe StyleSheet.absoluteFill en cualquier
  // lugar de esos archivos (fuera de comentarios).
  if (/StyleSheet\.absoluteFill/.test(c)) {
    v.push('StyleSheet.absoluteFill (capa transparente)')
  }
  if (/replace\(\/\^movie-\//.test(c)) v.push("replace(/^movie-/ a mano")
  return v
}

describe('violacionesDeNavegacion (fixtures en memoria)', () => {
  const ok = `import { rutaDeEvento } from '@/lib/rutas'\nrouter.push(rutaDeEvento(evento))`

  it('acepta el fuente que pasa por rutaDeEvento', () => {
    expect(violacionesDeNavegacion(ok)).toEqual([])
  })
  it('detecta router.push con /evento/ en un template', () => {
    const malo = `import { rutaDeEvento } from '@/lib/rutas'\nrouter.push(\`/evento/\${evento.id}\`)\nrutaDeEvento(x)`
    expect(violacionesDeNavegacion(malo)).toContain('router.push con template /evento/')
  })
  it('detecta la falta del import', () => {
    expect(violacionesDeNavegacion('router.push(x)')).toContain('no importa rutaDeEvento de @/lib/rutas')
  })
  it('ignora lo que está en comentarios', () => {
    const conComentario = `${ok}\n// router.push(\`/evento/\${evento.id}\`)`
    expect(violacionesDeNavegacion(conComentario)).toEqual([])
  })
})

describe('violacionesDeCapa (fixtures en memoria)', () => {
  it('acepta un fuente limpio', () => {
    expect(violacionesDeCapa('<Pressable onPress={abrir}><View /></Pressable>')).toEqual([])
  })
  it('detecta la capa transparente', () => {
    const malo = '<Pressable style={StyleSheet.absoluteFill} onPress={abrir} />'
    expect(violacionesDeCapa(malo)).not.toEqual([])
  })
  it('detecta el replace(/^movie-/', () => {
    expect(violacionesDeCapa("const id = item.id.replace(/^movie-/, '')")).not.toEqual([])
  })
  it('detecta la capa vieja de FilaCategoria (multilínea, con flecha en onPress)', () => {
    const viejo = [
      '<Pressable',
      '  onPress={() => router.push(`/pelicula/${evento.id.replace(/^movie-/, \'\')}`)}',
      '  style={StyleSheet.absoluteFill}',
      '  accessibilityRole="button"',
      '/>',
    ].join('\n')
    const v = violacionesDeCapa(viejo)
    expect(v).toContain('StyleSheet.absoluteFill (capa transparente)')
    expect(v).toContain('replace(/^movie-/ a mano')
  })
  it('detecta la capa vieja de favoritos (multilínea, con flecha en onPress)', () => {
    const viejo = [
      '<Pressable',
      '  accessibilityRole="button"',
      '  accessibilityLabel={item.title}',
      '  onPress={() => router.push(rutaDeFavorito(item))}',
      '  style={StyleSheet.absoluteFill}',
      '/>',
    ].join('\n')
    expect(violacionesDeCapa(viejo)).toContain('StyleSheet.absoluteFill (capa transparente)')
  })
  it('ignora absoluteFill en comentarios', () => {
    expect(violacionesDeCapa('// antes: style={StyleSheet.absoluteFill}\n<Pressable onPress={abrir} />')).toEqual([])
  })
})

/**
 * BotonCompartir solo dentro de la rama `esEventoReal(evento) ?`. R69, 69-a:
 * BotonFavorito ya no está guardado por `esEventoReal` (es por tipo y va
 * también en películas y flyers), pero tiene que seguir renderizándose.
 */
export function violacionesDeGuarda(src: string): string[] {
  const c = sinComentarios(src)
  const v: string[] = []
  const guarda = c.search(/esEventoReal\(\s*evento\s*\)\s*\?/)
  if (c.indexOf('<BotonFavorito') === -1) v.push('no renderiza <BotonFavorito')
  for (const boton of ['BotonCompartir']) {
    const uso = c.indexOf(`<${boton}`)
    if (uso === -1) {
      v.push(`no renderiza <${boton}`)
    } else if (guarda === -1 || guarda > uso) {
      v.push(`<${boton} fuera de la guarda esEventoReal(evento) ?`)
    }
  }
  return v
}

describe('violacionesDeGuarda (fixtures en memoria)', () => {
  it('acepta botones dentro de la rama esEventoReal', () => {
    const ok = `{esEventoReal(evento) ? (<View><BotonCompartir a={1} /><BotonFavorito a={1} /></View>) : null}`
    expect(violacionesDeGuarda(ok)).toEqual([])
  })
  it('acepta el corazón fuera de la guarda (R69: también en películas y flyers)', () => {
    const ok = `<BotonFavorito a={1} />{esEventoReal(evento) ? (<BotonCompartir a={1} />) : null}`
    expect(violacionesDeGuarda(ok)).toEqual([])
  })
  it('detecta Compartir sin la guarda', () => {
    const malo = `<View><BotonCompartir a={1} /><BotonFavorito a={1} /></View>`
    expect(violacionesDeGuarda(malo)).toEqual(['<BotonCompartir fuera de la guarda esEventoReal(evento) ?'])
  })
  it('detecta Compartir antes de la guarda', () => {
    const malo = `<BotonCompartir a={1} />{esEventoReal(evento) ? (<BotonCompartir a={1} />) : null}<BotonFavorito a={1} />`
    expect(violacionesDeGuarda(malo)).toEqual(['<BotonCompartir fuera de la guarda esEventoReal(evento) ?'])
  })
  it('un botón solo en un comentario no cuenta como uso', () => {
    const malo = `// <BotonFavorito />\n{esEventoReal(evento) ? (<BotonCompartir a={1} />) : null}`
    expect(violacionesDeGuarda(malo)).toEqual(['no renderiza <BotonFavorito'])
  })
})

// ---------------------------------------------------------------------------
// R69, 69-q (QPS-353): el corazón recibe el objetivo derivado, nunca el id crudo.
// ---------------------------------------------------------------------------
/** La etiqueta `<BotonFavorito ... />` (primera), o null. Sin `>` dentro de las props. */
function etiquetaBotonFavorito(c: string): string | null {
  return /<BotonFavorito\b[\s\S]*?\/>/.exec(c)?.[0] ?? null
}

/** TarjetaEvento: `const X = objetivoDeFavorito(evento)` y `<BotonFavorito objetivo={X} ...>`, sin `eventId=` ni `evento.id`. */
export function violacionesDeObjetivoTarjeta(src: string): string[] {
  const c = sinComentarios(src)
  const v: string[] = []
  if (!/import\s*\{[^}]*\bobjetivoDeFavorito\b[^}]*\}\s*from\s*['"]@\/lib\/rutas['"]/.test(c)) {
    v.push('no importa objetivoDeFavorito de @/lib/rutas')
  }
  const derivado = /const\s+(\w+)\s*=\s*objetivoDeFavorito\(\s*evento\s*\)/.exec(c)
  if (!derivado) v.push('no deriva el objetivo con objetivoDeFavorito(evento)')
  const etiqueta = etiquetaBotonFavorito(c)
  if (!etiqueta) return [...v, 'no renderiza <BotonFavorito']
  if (/\beventId\s*=/.test(etiqueta)) v.push('<BotonFavorito con eventId=')
  if (/\bevento\.id\b/.test(etiqueta)) v.push('<BotonFavorito con evento.id crudo')
  const objetivo = /\bobjetivo=\{\s*(\w+)\s*\}/.exec(etiqueta)
  if (!objetivo) v.push('<BotonFavorito sin objetivo={<variable>}')
  else if (derivado && objetivo[1] !== derivado[1]) v.push('<BotonFavorito no recibe el objetivo derivado')
  return v
}

/** Una ficha: `<BotonFavorito objetivo={{ tipo: '<tipo>', id: <registro>.id }} ...>`, sin `eventId=` ni otro tipo. */
export function violacionesDeObjetivoFicha(src: string, tipo: 'cinema' | 'flyer', registro: string): string[] {
  const c = sinComentarios(src)
  const v: string[] = []
  const etiqueta = etiquetaBotonFavorito(c)
  if (!etiqueta) return ['no renderiza <BotonFavorito']
  if (/\beventId\s*=/.test(etiqueta)) v.push('<BotonFavorito con eventId=')
  const m = /\bobjetivo=\{\{\s*tipo:\s*'(\w+)'\s*,\s*id:\s*([\w.]+)\s*\}\}/.exec(etiqueta)
  if (!m) return [...v, '<BotonFavorito sin objetivo={{ tipo, id }}']
  if (m[1] !== tipo) v.push(`el tipo es '${m[1]}', debería ser '${tipo}'`)
  if (m[2] !== `${registro}.id`) v.push(`el id es ${m[2]}, debería ser ${registro}.id`)
  return v
}

describe('violacionesDeObjetivoTarjeta / violacionesDeObjetivoFicha (fixtures en memoria)', () => {
  const tarjetaOk = [
    "import { esEventoReal, objetivoDeFavorito, rutaDeEvento } from '@/lib/rutas'",
    'const objetivoFavorito = objetivoDeFavorito(evento)',
    '{objetivoFavorito ? <BotonFavorito objetivo={objetivoFavorito} tamanio={32} fondo="oscuro" /> : null}',
  ].join('\n')

  it('acepta la tarjeta que pasa por objetivoDeFavorito', () => {
    expect(violacionesDeObjetivoTarjeta(tarjetaOk)).toEqual([])
  })
  it('rechaza eventId= en el corazón', () => {
    const malo = tarjetaOk.replace('objetivo={objetivoFavorito}', 'eventId={evento.id}')
    const v = violacionesDeObjetivoTarjeta(malo)
    expect(v).toContain('<BotonFavorito con eventId=')
    expect(v).toContain('<BotonFavorito con evento.id crudo')
  })
  it('rechaza el id crudo dentro de objetivo', () => {
    const malo = tarjetaOk.replace('objetivo={objetivoFavorito}', "objetivo={{ tipo: 'event', id: evento.id }}")
    expect(violacionesDeObjetivoTarjeta(malo)).toContain('<BotonFavorito con evento.id crudo')
  })
  it('rechaza un objetivo que no es el derivado', () => {
    const malo = tarjetaOk.replace('objetivo={objetivoFavorito}', 'objetivo={otro}')
    expect(violacionesDeObjetivoTarjeta(malo)).toContain('<BotonFavorito no recibe el objetivo derivado')
  })
  it('rechaza la tarjeta que no deriva ni importa objetivoDeFavorito', () => {
    const malo = '<BotonFavorito objetivo={objetivoFavorito} />'
    const v = violacionesDeObjetivoTarjeta(malo)
    expect(v).toContain('no importa objetivoDeFavorito de @/lib/rutas')
    expect(v).toContain('no deriva el objetivo con objetivoDeFavorito(evento)')
  })
  it('un <BotonFavorito solo en un comentario no cuenta', () => {
    expect(violacionesDeObjetivoTarjeta('// <BotonFavorito objetivo={x} />')).toContain('no renderiza <BotonFavorito')
  })

  const fichaOk = `<BotonFavorito objetivo={{ tipo: 'cinema', id: pelicula.id }} tamanio={40} fondo="muted" />`
  it('acepta la ficha con el tipo y el registro correctos', () => {
    expect(violacionesDeObjetivoFicha(fichaOk, 'cinema', 'pelicula')).toEqual([])
  })
  it('rechaza el tipo equivocado', () => {
    expect(violacionesDeObjetivoFicha(fichaOk.replace("'cinema'", "'event'"), 'cinema', 'pelicula')).toContain(
      "el tipo es 'event', debería ser 'cinema'"
    )
  })
  it('rechaza un id que no sale del registro cargado', () => {
    expect(violacionesDeObjetivoFicha(fichaOk.replace('pelicula.id', 'id'), 'cinema', 'pelicula')).toContain('el id es id, debería ser pelicula.id')
  })
  it('rechaza eventId=', () => {
    expect(violacionesDeObjetivoFicha('<BotonFavorito eventId={pelicula.id} />', 'cinema', 'pelicula')).toContain('<BotonFavorito con eventId=')
  })
})

describe('components/TarjetaEvento.tsx: el corazón recibe el objetivo derivado (QPS-353)', () => {
  const real = readFileSync(`${MOBILE_ROOT}/components/TarjetaEvento.tsx`, 'utf8')
  it('sin violaciones', () => {
    expect(violacionesDeObjetivoTarjeta(real)).toEqual([])
  })
  it('rotura en memoria: el corazón con eventId={evento.id} se detecta', () => {
    const roto = real.replace('objetivo={objetivoFavorito}', 'eventId={evento.id}')
    expect(roto).not.toBe(real)
    expect(violacionesDeObjetivoTarjeta(roto)).toContain('<BotonFavorito con eventId=')
  })
})

describe.each([
  ['app/pelicula/[id].tsx', 'cinema', 'pelicula'],
  ['app/flyer/[id].tsx', 'flyer', 'flyer'],
] as const)('%s: el corazón es de tipo %s (QPS-353)', (ruta, tipo, registro) => {
  const real = readFileSync(`${MOBILE_ROOT}/${ruta}`, 'utf8')
  it('sin violaciones', () => {
    expect(violacionesDeObjetivoFicha(real, tipo, registro)).toEqual([])
  })
  it('rotura en memoria: el tipo cambiado a event se detecta', () => {
    const roto = real.replace(`tipo: '${tipo}'`, "tipo: 'event'")
    expect(roto).not.toBe(real)
    expect(violacionesDeObjetivoFicha(roto, tipo, registro)).not.toEqual([])
  })
})

describe('components/TarjetaEvento.tsx: botones solo en tarjetas de eventos reales', () => {
  it('sin violaciones', () => {
    const v = violacionesDeGuarda(readFileSync(`${MOBILE_ROOT}/components/TarjetaEvento.tsx`, 'utf8'))
    expect(v).toEqual([])
  })
})

describe.each(['components/TarjetaEvento.tsx', 'components/Hero.tsx'])('%s navega por rutaDeEvento', (ruta) => {
  it('sin violaciones', () => {
    const v = violacionesDeNavegacion(readFileSync(`${MOBILE_ROOT}/${ruta}`, 'utf8'))
    expect(v, `${ruta}: ${v.join('; ')}`).toEqual([])
  })
})

describe.each(['components/FilaCategoria.tsx', 'app/(tabs)/favoritos.tsx'])('%s sin capa transparente ni replace de movie-', (ruta) => {
  it('sin violaciones', () => {
    const v = violacionesDeCapa(readFileSync(`${MOBILE_ROOT}/${ruta}`, 'utf8'))
    expect(v, `${ruta}: ${v.join('; ')}`).toEqual([])
  })
})
