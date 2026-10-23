// R29, 29-h (ops/paridad-web-app.md §3.2): portada con la estructura de la
// web. No hay `@testing-library/react-native` en el repo (mismo motivo que
// `tests/ficha.test.ts`/`tests/tarjeta-evento.test.ts`): `app/(tabs)/index.tsx`,
// `components/Hero.tsx` y `components/FilaCategoria.tsx` importan React
// Native, así que no se pueden `import`ar acá — se leen como texto
// (`readFileSync`) para las comprobaciones estáticas, y las funciones puras
// que exportan (`seccionesPortada`, `eventosHero`) se re-testean con una
// copia local idéntica (mismo patrón que `usaBorderComoColorDeTexto` en
// `tests/base-visual.test.ts`), más un chequeo de texto que las mantiene en
// sincro con el archivo real.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { groupByCategory, selectTodayRow, type CategoryEventsRow } from '@qps/core/home/filters'
import { sortCategories } from '@qps/core/home/carousel'
import type { DisplayEvent } from '@qps/core/home/types'
import type { Category } from '@qps/core/types'
import { saltaWallClockToDate } from '@qps/core/date-format'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_PATH = join(MOBILE_ROOT, 'app', '(tabs)', 'index.tsx')
const HERO_PATH = join(MOBILE_ROOT, 'components', 'Hero.tsx')
const FILA_CATEGORIA_PATH = join(MOBILE_ROOT, 'components', 'FilaCategoria.tsx')
const PILLS_ATAJOS_PATH = join(MOBILE_ROOT, 'components', 'PillsAtajos.tsx')
const BANNER_RADAR_PATH = join(MOBILE_ROOT, 'components', 'BannerRadar.tsx')

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

function makeCategory(slug: string, name: string): Category {
  return { id: `cat-${slug}`, slug, name, color: null, icon: null, created_at: null }
}

let autoId = 0
function makeDisplayEvent(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  autoId += 1
  return {
    id: overrides.id ?? `evento-de-prueba-${autoId}`,
    slug: overrides.slug ?? `evento-de-prueba-${autoId}`,
    title: overrides.title ?? 'Evento de Prueba',
    venue: overrides.venue ?? 'Venue de Prueba',
    date: overrides.date ?? '2030-10-10',
    time: overrides.time ?? '21:00',
    category: overrides.category ?? 'boliches',
    categoryName: overrides.categoryName ?? 'Boliches',
    price: overrides.price ?? 'confirmar',
    image: overrides.image ?? '/placeholder.svg?height=600&width=400',
    description: overrides.description ?? '',
    address: overrides.address ?? '',
    startDateTime: overrides.startDateTime ?? salta('2030-10-10T21:00:00').toISOString(),
    isFeatured: overrides.isFeatured ?? false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// `seccionesPortada`: copia local idéntica a la de `app/(tabs)/index.tsx`
// (ver el comentario de arriba). `SeccionPortada`/la función en sí no se
// pueden importar del archivo real (es un componente de React Native), así
// que acá se re-testea esta copia, y más abajo se chequea con texto que la
// real tiene la misma regla de inserción (`indice === 1`).
// ---------------------------------------------------------------------------
type SeccionPortada =
  | { tipo: 'hoy'; eventos: DisplayEvent[] }
  | { tipo: 'categoria'; fila: CategoryEventsRow }
  | { tipo: 'banner-radar' }
  | { tipo: 'anuncio' }

const FILAS_MINIMAS_PARA_ANUNCIO = 2

function seccionesPortada(filas: CategoryEventsRow[], hoyEventos: DisplayEvent[]): SeccionPortada[] {
  const secciones: SeccionPortada[] = [{ tipo: 'hoy', eventos: hoyEventos }]
  let anuncioInsertado = false
  filas.forEach((fila, indice) => {
    secciones.push({ tipo: 'categoria', fila })
    if (indice === 1) secciones.push({ tipo: 'banner-radar' })
    if (indice === 3) {
      secciones.push({ tipo: 'anuncio' })
      anuncioInsertado = true
    }
  })
  if (!anuncioInsertado && filas.length >= FILAS_MINIMAS_PARA_ANUNCIO) secciones.push({ tipo: 'anuncio' })
  return secciones
}

describe('seccionesPortada (fixtures en memoria)', () => {
  const filas: CategoryEventsRow[] = [
    { category: 'boliches', title: 'Boliches', events: [makeDisplayEvent({ id: 'e1' })] },
    { category: 'penas', title: 'Peñas', events: [makeDisplayEvent({ id: 'e2' })] },
    { category: 'teatro', title: 'Teatro', events: [makeDisplayEvent({ id: 'e3' })] },
  ]
  const hoy = [makeDisplayEvent({ id: 'hoy-1' })]

  it('empieza con la sección "hoy"', () => {
    expect(seccionesPortada(filas, hoy)[0]).toEqual({ tipo: 'hoy', eventos: hoy })
  })

  it('conserva el orden y los ids de las filas de groupByCategory', () => {
    const secciones = seccionesPortada(filas, hoy)
    const categorias = secciones.filter((s) => s.tipo === 'categoria').map((s) => (s as { fila: CategoryEventsRow }).fila.category)
    expect(categorias).toEqual(['boliches', 'penas', 'teatro'])
  })

  it('el banner del Radar va justo después de la 2.ª fila (índice 1)', () => {
    const secciones = seccionesPortada(filas, hoy)
    // hoy(0), boliches(1), penas(2), banner(3), teatro(4)
    expect(secciones[3]).toEqual({ tipo: 'banner-radar' })
    expect(secciones[2]).toEqual({ tipo: 'categoria', fila: filas[1] })
    expect(secciones[4]).toEqual({ tipo: 'categoria', fila: filas[2] })
  })

  it('con una sola fila, no hay banner (nunca llega al índice 1)', () => {
    const unaFila = [filas[0]]
    const secciones = seccionesPortada(unaFila, hoy)
    expect(secciones.some((s) => s.tipo === 'banner-radar')).toBe(false)
  })

  it('con cero filas: solo "hoy", sin anuncio (R60 — con menos de 2 filas el banner quedaría arriba del pliegue)', () => {
    expect(seccionesPortada([], hoy)).toEqual([{ tipo: 'hoy', eventos: hoy }])
  })

  it('cuenta TODAS las filas de groupByCategory para la posición, no solo las que tienen eventos (igual que home-content.tsx)', () => {
    const conUnaVacia: CategoryEventsRow[] = [
      { category: 'boliches', title: 'Boliches', events: [makeDisplayEvent({ id: 'e1' })] },
      { category: 'ferias', title: 'Ferias', events: [] },
      { category: 'teatro', title: 'Teatro', events: [makeDisplayEvent({ id: 'e3' })] },
    ]
    const secciones = seccionesPortada(conUnaVacia, hoy)
    expect(secciones[3]).toEqual({ tipo: 'banner-radar' })
  })
})

// ---------------------------------------------------------------------------
// R60, 52-d: el banner de AdMob (`tipo: 'anuncio'`) después de la 4.ª fila
// (índice 3) — contando TODAS las filas, igual que el banner del Radar. Con
// menos de 4 filas (0 o 2), va al FINAL de la lista de secciones (diferencia
// deliberada con la web: un día flojo de agenda no se queda sin la sección
// del anuncio). En todos los casos, el banner del Radar NO se mueve (sigue
// después del índice 1).
// ---------------------------------------------------------------------------
describe('seccionesPortada: el banner de AdMob ("anuncio"), con 0/2/4/8 filas', () => {
  const hoy = [makeDisplayEvent({ id: 'hoy-1' })]

  function filas(cantidad: number): CategoryEventsRow[] {
    return Array.from({ length: cantidad }, (_, i) => ({
      category: `cat-${i}`,
      title: `Categoría ${i}`,
      events: [makeDisplayEvent({ id: `e-${i}` })],
    }))
  }

  // R60 (lead, hallazgo de ux-ui): con 0 o 1 filas NO hay anuncio. La cuenta
  // de alturas para 360×800 (la medida que fijó Mauro) da el banner
  // arrancando a los ~256 dp con 0 filas y a los ~582 dp con 1, contra un
  // área visible de ~649 dp: en los dos casos asoma sin scrollear, y eso
  // rompe la regla (a) ("ningún anuncio arriba del pliegue"). Con 2 filas, las
  // dos FilaCategoria (~326 dp cada una) lo empujan arriba de los 900 dp.
  it('0 filas: NO hay anuncio (quedaría arriba del pliegue)', () => {
    const secciones = seccionesPortada(filas(0), hoy)
    expect(secciones.map((s) => s.tipo)).toEqual(['hoy'])
  })

  it('1 fila: tampoco hay anuncio (el umbral es 2 filas, no "cualquier cosa menos vacío")', () => {
    const secciones = seccionesPortada(filas(1), hoy)
    expect(secciones.map((s) => s.tipo)).toEqual(['hoy', 'categoria'])
  })

  it('2 filas: el anuncio va al final (nunca llega al índice 3)', () => {
    const secciones = seccionesPortada(filas(2), hoy)
    expect(secciones.map((s) => s.tipo)).toEqual(['hoy', 'categoria', 'categoria', 'banner-radar', 'anuncio'])
    expect(secciones.at(-1)).toEqual({ tipo: 'anuncio' })
  })

  it('4 filas: el anuncio va justo después de la 4.ª fila (índice 3), no al final', () => {
    const secciones = seccionesPortada(filas(4), hoy)
    expect(secciones.map((s) => s.tipo)).toEqual([
      'hoy',
      'categoria', // fila 0
      'categoria', // fila 1
      'banner-radar',
      'categoria', // fila 2
      'categoria', // fila 3 (índice 3)
      'anuncio',
    ])
  })

  it('8 filas: el anuncio sigue después de la 4.ª fila (índice 3), con 4 filas más después de él', () => {
    const secciones = seccionesPortada(filas(8), hoy)
    const tipos = secciones.map((s) => s.tipo)
    const idxAnuncio = tipos.indexOf('anuncio')
    expect(idxAnuncio).toBeGreaterThan(-1)
    // Justo después de la 4.ª fila (fila de índice 3): antes del anuncio hay
    // exactamente 4 secciones "categoria" (más "hoy" y "banner-radar").
    const categoriasAntes = tipos.slice(0, idxAnuncio).filter((t) => t === 'categoria').length
    expect(categoriasAntes).toBe(4)
    // Y siguen filas después del anuncio (a diferencia del caso de 4 filas).
    expect(tipos.slice(idxAnuncio + 1).filter((t) => t === 'categoria').length).toBe(4)
  })

  it.each([0, 1, 2, 4, 8])('con %i filas, el banner del Radar no se mueve (sigue después del índice 1, si existe)', (cantidad) => {
    const secciones = seccionesPortada(filas(cantidad), hoy)
    const idxBanner = secciones.findIndex((s) => s.tipo === 'banner-radar')
    if (cantidad < 2) {
      expect(idxBanner).toBe(-1)
    } else {
      // El banner va justo después de la fila de índice 1: "hoy" + 2 filas.
      expect(idxBanner).toBe(3)
    }
  })
})

// ---------------------------------------------------------------------------
// Equivalencia: las filas que arma la portada son las de `groupByCategory`
// de core, en orden y con los ids — sobre un conjunto de eventos inventado,
// usando la función real (importada), no una reimplementación.
// ---------------------------------------------------------------------------
describe('equivalencia con groupByCategory/selectCarouselEvents de core', () => {
  const now = salta('2030-10-10T12:00:00')
  const categorias: Category[] = [makeCategory('boliches', 'Boliches'), makeCategory('penas', 'Peñas'), makeCategory('teatro', 'Teatro')]

  const eventos: DisplayEvent[] = [
    makeDisplayEvent({ id: 'b1', category: 'boliches', categoryName: 'Boliches' }),
    makeDisplayEvent({ id: 'b2', category: 'boliches', categoryName: 'Boliches' }),
    makeDisplayEvent({ id: 'p1', category: 'penas', categoryName: 'Peñas' }),
  ]

  it('groupByCategory ordena de más eventos a menos, y seccionesPortada conserva ese orden y esos ids', () => {
    const categoriasOrdenadas = sortCategories(categorias, eventos, now, [])
    const filas = groupByCategory(categoriasOrdenadas, eventos, null, null, now)
    const hoy = selectTodayRow(eventos, '2030-10-10', now)

    expect(filas.map((f) => f.category)).toEqual(['boliches', 'penas', 'teatro'])
    expect(filas[0].events.map((e) => e.id)).toEqual(['b1', 'b2'])
    expect(filas[1].events.map((e) => e.id)).toEqual(['p1'])

    const secciones = seccionesPortada(filas, hoy)
    const filasEnSecciones = secciones.filter((s): s is { tipo: 'categoria'; fila: CategoryEventsRow } => s.tipo === 'categoria')
    expect(filasEnSecciones.map((s) => s.fila.category)).toEqual(['boliches', 'penas', 'teatro'])
    expect(filasEnSecciones[0].fila.events.map((e) => e.id)).toEqual(['b1', 'b2'])
  })
})

// ---------------------------------------------------------------------------
// Lectura estática de `app/(tabs)/index.tsx`: usa `groupByCategory` de core
// (no define su propia agrupación), usa `selectCarouselEvents` para el
// hero, y la regla de inserción del banner del Radar coincide con la copia
// de más arriba.
// ---------------------------------------------------------------------------
describe('app/(tabs)/index.tsx: lectura estática', () => {
  const content = readFileSync(INDEX_PATH, 'utf8')

  it('importa groupByCategory de @qps/core/home/filters', () => {
    expect(content).toMatch(/import\s*\{[^}]*\bgroupByCategory\b[^}]*\}\s*from\s*['"]@qps\/core\/home\/filters['"]/)
  })

  it('no reimplementa el orden "por cantidad de eventos" de groupByCategory (sin un .sort propio con events.length)', () => {
    expect(content).not.toMatch(/\.sort\([^)]*events\.length/)
  })

  // La prueba de rotura 4 del plan de la R29 (reemplazar la llamada a
  // `groupByCategory` por un `.map()` propio que arma `{ category, events }`)
  // NO fallaba: importar la función y no reimplementar el `.sort` no alcanza,
  // porque la agrupación se puede rehacer sin ninguna de las dos cosas. Estos
  // dos casos cierran esa brecha.
  it('LLAMA a groupByCategory (no solo la importa)', () => {
    expect(content).toMatch(/\bgroupByCategory\s*\(/)
  })

  it('no arma las filas por su cuenta (sin un map que devuelva { category, events })', () => {
    expect(content).not.toMatch(/\.map\([^)]*\)\s*=>\s*\(?\s*\{[^}]*\bcategory\s*:[^}]*\bevents\s*:/s)
  })

  it('importa selectCarouselEvents de @qps/core/home/carousel y lo pasa a <Hero', () => {
    expect(content).toMatch(/import\s*\{[^}]*\bselectCarouselEvents\b[^}]*\}\s*from\s*['"]@qps\/core\/home\/carousel['"]/)
    expect(content).toMatch(/selectCarouselEvents\(/)
    expect(content).toMatch(/<Hero\s+eventos=\{/)
  })

  it('arma seccionesPortada con la misma regla de inserción del banner (indice === 1)', () => {
    const idx = content.indexOf('function seccionesPortada')
    expect(idx).toBeGreaterThan(-1)
    const cuerpo = content.slice(idx, content.indexOf('\n}', idx))
    expect(cuerpo).toMatch(/indice\s*===\s*1/)
  })

  it('"Hoy en Salta": el texto vacío de la web, completo, y "Ver esta semana"', () => {
    expect(content).toContain('Hoy no hay eventos cargados. Mirá qué viene en los próximos días.')
    expect(content).toContain('Ver esta semana')
  })

  it('deja constancia de lo que no se copia a propósito (Más filtros, el switch de flyers)', () => {
    expect(content).toMatch(/Más filtros/)
    expect(content).toMatch(/Mostrar flyers de redes/)
  })

  // R60, 52-d: el comentario de cabecera ya no dice que AdSense no tiene
  // equivalente en la app — ahora lo tiene (AdMob/BannerAnuncio). Esto
  // reemplaza la exigencia vieja de `/AdSense/` (que antes afirmaba lo
  // contrario de lo que pasa ahora).
  it('el comentario de cabecera dice que AdMob SÍ tiene equivalente (ya no que "ninguno de los tres" lo tiene)', () => {
    expect(content).toMatch(/AdMob/)
    expect(content).toMatch(/BannerAnuncio/)
    expect(content).not.toMatch(/ninguno de los tres tiene un/)
  })

  it('importa BannerAnuncio de @/components/BannerAnuncio y lo monta con lugar="inicio"', () => {
    expect(content).toMatch(/import\s*\{\s*BannerAnuncio\s*\}\s*from\s*['"]@\/components\/BannerAnuncio['"]/)
    expect(content).toMatch(/<BannerAnuncio\b[^>]*lugar="inicio"/)
  })

  it('seccionesPortada inserta el anuncio después de la 4.ª fila (indice === 3)', () => {
    const idx = content.indexOf('function seccionesPortada')
    expect(idx).toBeGreaterThan(-1)
    const cuerpo = content.slice(idx, content.indexOf('\n}', idx))
    expect(cuerpo).toMatch(/indice\s*===\s*3/)
  })

  // R60 (lead): la rama del respaldo —el anuncio al final cuando no se llegó
  // al índice 3— también tiene que estar fijada acá. Sin esto, la copia local
  // de más arriba podía seguir en verde con el archivo real cambiado en esa
  // rama (que es justo donde está la regla (a) de Mauro), porque el único
  // lazo con el archivo real era la comparación `indice === 3`.
  it('el respaldo del final exige un mínimo de filas, y el mínimo es 2', () => {
    expect(content).toMatch(/FILAS_MINIMAS_PARA_ANUNCIO\s*=\s*2\b/)
    const idx = content.indexOf('function seccionesPortada')
    const cuerpo = content.slice(idx, content.indexOf('\n}', idx))
    expect(cuerpo).toMatch(/!anuncioInsertado\s*&&\s*filas\.length\s*>=\s*FILAS_MINIMAS_PARA_ANUNCIO/)
  })

  it('no toca tests/base-visual.test.ts: nunca usa colors.border/colores.border como color de texto', () => {
    expect(content).not.toMatch(/\bcolor:\s*color(?:es|s)\.border\b/)
  })
})

// ---------------------------------------------------------------------------
// Hero: como mucho 6 eventos (`eventosHero`, copia local + chequeo estático).
// ---------------------------------------------------------------------------
function eventosHero(eventos: DisplayEvent[]): DisplayEvent[] {
  return eventos.slice(0, 6)
}

describe('eventosHero (copia local, fixtures en memoria)', () => {
  it('con 6 o menos, los deja todos', () => {
    const lista = [1, 2, 3].map((n) => makeDisplayEvent({ id: `h${n}` }))
    expect(eventosHero(lista)).toHaveLength(3)
  })

  it('con más de 6, corta en 6', () => {
    const lista = Array.from({ length: 9 }, (_, i) => makeDisplayEvent({ id: `h${i}` }))
    const resultado = eventosHero(lista)
    expect(resultado).toHaveLength(6)
    expect(resultado.map((e) => e.id)).toEqual(lista.slice(0, 6).map((e) => e.id))
  })
})

describe('components/Hero.tsx: lectura estática', () => {
  const content = readFileSync(HERO_PATH, 'utf8')

  it('corta en 6 (MAXIMO_EVENTOS = 6 y slice(0, MAXIMO_EVENTOS))', () => {
    expect(content).toMatch(/MAXIMO_EVENTOS\s*=\s*6/)
    expect(content).toMatch(/\.slice\(0,\s*MAXIMO_EVENTOS\)/)
  })

  it('avanza cada 5 s (INTERVALO_MS = 5000) con setInterval, y lo limpia (clearInterval) al desmontar', () => {
    expect(content).toMatch(/INTERVALO_MS\s*=\s*5000/)
    expect(content).toMatch(/setInterval\(/)
    expect(content).toMatch(/return\s*\(\)\s*=>\s*clearInterval\(/)
  })

  // 36-b (G1 del feedback del teléfono 2): este `it` cuidaba dos cosas —
  // que el `setInterval` del autoplay esté dentro de un `useEffect` que
  // depende de "indice" (se reinicia al deslizar), Y que el alto del Hero
  // fuera el `ALTO_HERO = 200` fijo de la R29. Lo segundo ahora afirma
  // justo lo contrario de lo que decidió la ronda (el alto fijo se fue a
  // propósito, a favor de `altoHero(altoVentana)` con `useWindowDimensions`,
  // ~60 % del alto de la ventana). Lo primero quedó cubierto, igual o más
  // estricto, en `tests/hero.test.ts` ("setInterval está dentro de un
  // useEffect" y "el efecto del intervalo depende de 'indice'... y de
  // 'slides.length'"), que además prueba el alto nuevo (`altoHero`, el
  // detector de que no queda ningún 200 fijo ni `Dimensions.get`). Se borra
  // de acá para no duplicar: el lugar de estas aserciones es `hero.test.ts`.

  it('el afiche: FlatList horizontal con pagingEnabled (deslizable, a diferencia de la web)', () => {
    expect(content).toMatch(/horizontal/)
    expect(content).toMatch(/pagingEnabled/)
  })

  it('no usa border como color de texto (lo tiene que sumar quien agregue este archivo a ARCHIVOS_NUEVOS_RONDA)', () => {
    expect(content).not.toMatch(/\bcolor:\s*color(?:es|s)\.border\b/)
  })
})

// ---------------------------------------------------------------------------
// PillsAtajos, FilaCategoria, BannerRadar: lectura estática de lo mínimo
// pedido por la tarea.
// ---------------------------------------------------------------------------
describe('components/PillsAtajos.tsx: lectura estática', () => {
  const content = readFileSync(PILLS_ATAJOS_PATH, 'utf8')

  it('los 4 atajos, en el orden de la web/D3', () => {
    expect(content).toMatch(/Hoy/)
    expect(content).toMatch(/Esta noche/)
    expect(content).toMatch(/Finde/)
    expect(content).toMatch(/Semana/)
    const orden = ['hoy', 'esta-noche', 'finde', 'semana'].map((id) => content.indexOf(`id: '${id}'`))
    expect(orden.every((i) => i > -1)).toBe(true)
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
  })

  it('la pill activa se desliza con Animated (spring)', () => {
    expect(content).toMatch(/Animated\.spring/)
  })

  it('no usa useRef(...).current para el Animated.Value (usa useState con inicializador perezoso)', () => {
    expect(content).not.toMatch(/useRef\([^)]*Animated\.Value/)
  })

  it('no usa border como color de texto', () => {
    expect(content).not.toMatch(/\bcolor:\s*color(?:es|s)\.border\b/)
  })
})

describe('components/FilaCategoria.tsx: lectura estática', () => {
  const content = readFileSync(FILA_CATEGORIA_PATH, 'utf8')

  it('devuelve null sin eventos (como CategoryRow de la web)', () => {
    expect(content).toMatch(/eventos\.length === 0\) return null/)
  })

  it('tiene el contador en una pill y "Ver todos"', () => {
    expect(content).toMatch(/pillContador/)
    expect(content).toMatch(/Ver todos/)
  })

  it('las tarjetas son 180×270 (ANCHO_TARJETA/ALTO_TARJETA)', () => {
    expect(content).toMatch(/ANCHO_TARJETA\s*=\s*180/)
    expect(content).toMatch(/ALTO_TARJETA\s*=\s*270/)
  })

  it('tocar una película (isCinemaMovie) abre /pelicula/<id>, sin el prefijo "movie-"', () => {
    expect(content).toMatch(/isCinemaMovie/)
    expect(content).toMatch(/\/pelicula\/\$\{evento\.id\.replace\(\/\^movie-\/, ''\)\}/)
  })

  it('no usa border como color de texto', () => {
    expect(content).not.toMatch(/\bcolor:\s*color(?:es|s)\.border\b/)
  })
})

describe('components/BannerRadar.tsx: lectura estática', () => {
  const content = readFileSync(BANNER_RADAR_PATH, 'utf8')

  it('el texto literal de la web, completo', () => {
    expect(content).toContain('¡No te pierdas ningún evento!')
    expect(content).toContain(
      'Elegí tus categorías favoritas y recibí la agenda del fin de semana directamente en tu correo.'
    )
    expect(content).toContain('Configurar mi Radar 📡')
  })

  it('el botón navega a /radar (la pestaña Radar)', () => {
    expect(content).toMatch(/router\.push\(\s*['"]\/radar['"]\s*\)/)
  })

  it('no usa border como color de texto', () => {
    expect(content).not.toMatch(/\bcolor:\s*color(?:es|s)\.border\b/)
  })
})

// ---------------------------------------------------------------------------
// Coordinación con 29-j: "Ver todos" de una fila de categoría navega a
// Buscar con `?categoria=<slug>` (mismo nombre de parámetro); el cine va a
// /cines en vez de a Buscar.
// ---------------------------------------------------------------------------
describe('"Ver todos" de una fila: Buscar con categoria=<slug>, o /cines para el cine', () => {
  const content = readFileSync(INDEX_PATH, 'utf8')

  // R66, 66-a: además de la categoría, "Ver todos" lleva el atajo elegido.
  it('navega a /buscar?categoria=<slug>&atajo=<atajo> para una categoría cualquiera', () => {
    expect(content).toMatch(
      /router\.push\(\s*`\/buscar\?categoria=\$\{encodeURIComponent\(catSlug\)\}&atajo=\$\{encodeURIComponent\(atajo\)\}`\s*\)/
    )
  })

  it('el cine navega a /cines, no a /buscar', () => {
    const idx = content.indexOf("catSlug === 'cine'")
    expect(idx).toBeGreaterThan(-1)
    const bloque = content.slice(idx, idx + 200)
    expect(bloque).toMatch(/router\.push\(['"]\/cines['"]\)/)
  })
})
