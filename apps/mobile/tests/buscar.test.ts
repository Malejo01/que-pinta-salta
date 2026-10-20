// R29, 29-j (ops/paridad-web-app.md §3.5): `app/(tabs)/buscar.tsx` pasa de
// dos inputs (evento, lugar) a uno solo que busca en título, lugar y
// descripción (`buscarEventosPorTexto` de `@qps/core/home/busqueda`, la
// misma función — misma referencia, no una copia — que usa la equivalencia
// con la web en `apps/web/tests/core/busqueda.test.ts`), más "Solo gratis"
// (`soloGratis` de `@qps/core/home/filtros-extra`, ya en core desde R27/R26).
//
// Mismo estilo que el resto de la R29: fixtures inventados, sin red ni base,
// y para la UI, lectura estática del archivo (mismo patrón que
// `tests/tarjeta-evento.test.ts` y `tests/campo-texto.test.ts`).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buscarEventosPorTexto } from '@qps/core/home/busqueda'
import { soloGratis } from '@qps/core/home/filtros-extra'
import type { DisplayEvent } from '@qps/core/home/types'

const RUTA_BUSCAR = fileURLToPath(new URL('../app/(tabs)/buscar.tsx', import.meta.url))
const SRC_BUSCAR = readFileSync(RUTA_BUSCAR, 'utf8')

let autoId = 0
function evento(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  autoId += 1
  return {
    id: `evento-${autoId}`,
    slug: `evento-${autoId}`,
    title: `Evento ${autoId}`,
    venue: 'Lugar de Prueba',
    date: '2026-10-20',
    time: '21:00',
    category: 'recitales',
    categoryName: 'Recitales',
    price: 'confirmar',
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: '2026-10-20T21:00:00-03:00',
    isFeatured: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// La búsqueda única: título, lugar y descripción (mismo resultado que la
// función de la web — ver el test de equivalencia en
// apps/web/tests/core/busqueda.test.ts, que reimplementa el useMemo de
// buscar-content.tsx y lo compara contra esta misma función).
// ---------------------------------------------------------------------------
describe('buscarEventosPorTexto: encuentra por título, por lugar y por descripción', () => {
  const porTitulo = evento({ id: 'por-titulo', title: 'Festival de Folclore Salteño' })
  const porLugar = evento({ id: 'por-lugar', title: 'Función especial', venue: 'Teatro Provincial de Salta' })
  const porDescripcion = evento({
    id: 'por-descripcion',
    title: 'Noche de improvisación',
    description: 'Una peña con artistas invitados y empanadas salteñas',
  })
  const sinMatch = evento({ id: 'sin-match', title: 'Obra de teatro', venue: 'Sala Negra', description: 'Drama contemporáneo' })
  const eventos = [porTitulo, porLugar, porDescripcion, sinMatch]

  it('por título', () => {
    expect(buscarEventosPorTexto(eventos, 'folclore').map((e) => e.id)).toEqual(['por-titulo'])
  })

  it('por lugar', () => {
    expect(buscarEventosPorTexto(eventos, 'provincial').map((e) => e.id)).toEqual(['por-lugar'])
  })

  it('por descripción', () => {
    expect(buscarEventosPorTexto(eventos, 'empanadas').map((e) => e.id)).toEqual(['por-descripcion'])
  })

  it('sin coincidencias: []', () => {
    expect(buscarEventosPorTexto(eventos, 'xilófono')).toEqual([])
  })

  it('sin texto: []', () => {
    expect(buscarEventosPorTexto(eventos, '')).toEqual([])
  })

  it('sin distinguir mayúsculas/minúsculas', () => {
    expect(buscarEventosPorTexto(eventos, 'FOLCLORE').map((e) => e.id)).toEqual(['por-titulo'])
  })

  it('sin distinguir tildes (QPS-021, R30): "salteno" encuentra "Salteño" y "pena" encuentra "peña"', () => {
    expect(buscarEventosPorTexto(eventos, 'salteno').map((e) => e.id)).toEqual(['por-titulo'])
    expect(buscarEventosPorTexto(eventos, 'pena').map((e) => e.id)).toEqual(['por-descripcion'])
  })
})

// ---------------------------------------------------------------------------
// "Solo gratis" combinado con el texto: la misma composición que hace la
// pantalla (`soloGratis(buscarEventosPorTexto(eventos, texto))`).
// ---------------------------------------------------------------------------
describe('"Solo gratis" combinado con el texto', () => {
  const gratisConMatch = evento({ id: 'gratis-con-match', title: 'Recital gratuito en la plaza', price: 'gratis' })
  const pagoConMatch = evento({ id: 'pago-con-match', title: 'Recital pago en el estadio', price: 1500 })
  const gratisSinMatch = evento({ id: 'gratis-sin-match', title: 'Obra de teatro', price: 'gratis' })

  it('con texto y "Solo gratis": solo lo que matchea el texto Y es gratis', () => {
    const eventos = [gratisConMatch, pagoConMatch, gratisSinMatch]
    const filtrados = buscarEventosPorTexto(eventos, 'recital')
    const resultado = soloGratis(filtrados)
    expect(resultado.map((e) => e.id)).toEqual(['gratis-con-match'])
  })

  it('con texto, sin "Solo gratis": los dos "recital" (gratis y pago)', () => {
    const eventos = [gratisConMatch, pagoConMatch, gratisSinMatch]
    const filtrados = buscarEventosPorTexto(eventos, 'recital')
    expect(filtrados.map((e) => e.id).sort()).toEqual(['gratis-con-match', 'pago-con-match'])
  })

  it('"Solo gratis" sin texto: todos los gratis, sin filtrar por texto (la pantalla usa la lista completa)', () => {
    const eventos = [gratisConMatch, pagoConMatch, gratisSinMatch]
    const resultado = soloGratis(eventos)
    expect(resultado.map((e) => e.id).sort()).toEqual(['gratis-con-match', 'gratis-sin-match'])
  })
})

// ---------------------------------------------------------------------------
// Ícono por categoría: desde R29-q (integración de la tanda 3, punto D) el
// mapeo categoría -> ícono (con el mismo fallback que `getCategoryIcon` de
// la web) vive en un solo lugar, `iconoPorCategoria` de
// `components/Icono.tsx` — ya no hay una copia local acá. La equivalencia
// entrada por entrada contra la web vive en
// `tests/iconos.test.ts` ("ICONO_POR_CATEGORIA de Icono.tsx: el mismo mapeo
// que getCategoryIcon de la web"); lo que protege este bloque es que
// buscar.tsx de verdad delega en ese mapeo único en vez de tener el suyo.
// Lectura estática, igual que el resto de este archivo — importar buscar.tsx
// en runtime arrastra react-native y Vitest no lo puede parsear fuera de un
// entorno RN (mismo motivo por el que el resto de este archivo usa
// SRC_BUSCAR en vez de un import).
// ---------------------------------------------------------------------------
describe('iconoDeCategoria: buscar.tsx usa iconoPorCategoria de components/Icono.tsx (no un mapeo propio)', () => {
  it('importa iconoPorCategoria desde @/components/Icono', () => {
    expect(SRC_BUSCAR).toMatch(/import\s*\{[^}]*\biconoPorCategoria\b[^}]*\}\s*from\s*['"]@\/components\/Icono['"]/)
  })

  it('usa iconoPorCategoria(item.slug) en la tile de categoría (mismo fallback que la web)', () => {
    expect(SRC_BUSCAR).toMatch(/iconoPorCategoria\(item\.slug\)/)
  })
})

// ---------------------------------------------------------------------------
// Lectura estática: un solo campo de texto y TarjetaEvento en los resultados.
//
// 33-a (QPS-151) migró el campo de texto de buscar.tsx de un `<TextInput>`
// suelto a `<CampoTexto>` (el componente compartido que, adentro, tiene el
// `<TextInput>` de verdad — por eso ahora `SRC_BUSCAR` no tiene ningún
// `<TextInput\b` directo). Lo que el test de la R29 protegía no era "la
// palabra TextInput": era que en Buscar hay UN SOLO campo de texto, no dos
// (antes, uno para "evento" y otro para "lugar"; 29-j los unificó). Esa
// propiedad sigue valiendo igual, solo que ahora se expresa contando
// `<CampoTexto` en vez de `<TextInput`. `cantidadDeCamposDeTexto` suma las
// dos formas (`<CampoTexto` + `<TextInput` suelto) para que la rotura real
// —dos campos, sea con el componente viejo o el nuevo, en cualquier
// combinación— se siga detectando.
// ---------------------------------------------------------------------------

/**
 * Cantidad de campos de texto de entrada en un JSX: `<CampoTexto` (el
 * componente actual) más cualquier `<TextInput` suelto que quedara sin
 * migrar. Buscar tiene que tener exactamente uno.
 */
function cantidadDeCamposDeTexto(content: string): number {
  const campoTexto = content.match(/<CampoTexto\b/g) ?? []
  const textInputSuelto = content.match(/<TextInput\b/g) ?? []
  return campoTexto.length + textInputSuelto.length
}

describe('cantidadDeCamposDeTexto (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('un solo <CampoTexto>: 1 (caso sano)', () => {
    const content = `<CampoTexto label="Buscar" value={texto} onChangeText={setTexto} />`
    expect(cantidadDeCamposDeTexto(content)).toBe(1)
  })

  it('dos <CampoTexto> (ej.: "evento" y "lugar" sin unificar, como antes de 29-j): 2, tiene que fallar', () => {
    const content = [
      '<CampoTexto label="Evento" value={evento} onChangeText={setEvento} />',
      '<CampoTexto label="Lugar" value={lugar} onChangeText={setLugar} />',
    ].join('\n')
    expect(cantidadDeCamposDeTexto(content)).toBe(2)
  })

  it('un <CampoTexto> más un <TextInput> suelto (migración a medias): 2, tiene que fallar', () => {
    const content = [
      '<CampoTexto label="Buscar" value={texto} onChangeText={setTexto} />',
      '<TextInput placeholder="Lugar" value={lugar} onChangeText={setLugar} />',
    ].join('\n')
    expect(cantidadDeCamposDeTexto(content)).toBe(2)
  })
})

describe('buscar.tsx: lectura estática', () => {
  it('un solo <CampoTexto> y ningún <TextInput> suelto (33-a, QPS-151; antes de 29-j, dos: "evento" y "lugar")', () => {
    expect(cantidadDeCamposDeTexto(SRC_BUSCAR)).toBe(1)
    expect(SRC_BUSCAR.match(/<CampoTexto\b/g) ?? []).toHaveLength(1)
    expect(SRC_BUSCAR.match(/<TextInput\b/g) ?? []).toHaveLength(0)
  })

  it('el placeholder es el texto literal de la web', () => {
    expect(SRC_BUSCAR).toMatch(/placeholder="Buscar por evento, lugar o descripcion\.\.\."/)
  })

  it('usa TarjetaEvento (la grilla de resultados), no una fila propia', () => {
    expect(SRC_BUSCAR).toMatch(/import\s*\{\s*TarjetaEvento\s*\}\s*from\s*['"]@\/components\/TarjetaEvento['"]/)
    expect(SRC_BUSCAR).toMatch(/<TarjetaEvento\b/)
  })

  it('usa buscarEventosPorTexto de @qps/core/home/busqueda (no una regla propia)', () => {
    expect(SRC_BUSCAR).toMatch(
      /import\s*\{\s*buscarEventosPorTexto\s*\}\s*from\s*['"]@qps\/core\/home\/busqueda['"]/
    )
  })

  it('usa soloGratis de @qps/core/home/filtros-extra', () => {
    expect(SRC_BUSCAR).toMatch(/import\s*\{\s*soloGratis\s*\}\s*from\s*['"]@qps\/core\/home\/filtros-extra['"]/)
  })

  it('lee "categoria" de useLocalSearchParams (punto 5: "Ver todos" de la portada)', () => {
    expect(SRC_BUSCAR).toMatch(/useLocalSearchParams<\{\s*categoria\?:\s*string\s*\}>/)
  })

  it('el chip "Solo gratis" sigue (texto literal)', () => {
    expect(SRC_BUSCAR).toMatch(/Solo gratis/)
  })

  it('"Explorar por categoria" es el texto literal de la web', () => {
    expect(SRC_BUSCAR).toMatch(/Explorar por categoria/)
  })
})

// ---------------------------------------------------------------------------
// R60, 52-d: el banner de AdMob (BannerAnuncio) en el footer de las dos
// FlatList — NUNCA en el header (no va entre el buscador y la lista).
// ---------------------------------------------------------------------------
describe('BannerAnuncio: ListFooterComponent de las dos FlatList, nunca ListHeaderComponent', () => {
  it('importa BannerAnuncio de @/components/BannerAnuncio', () => {
    expect(SRC_BUSCAR).toMatch(/import\s*\{\s*BannerAnuncio\s*\}\s*from\s*['"]@\/components\/BannerAnuncio['"]/)
  })

  it('aparece dos veces con lugar="buscar"', () => {
    const apariciones = SRC_BUSCAR.match(/<BannerAnuncio\s+lugar="buscar"/g) ?? []
    expect(apariciones).toHaveLength(2)
  })

  it('las dos apariciones están en ListFooterComponent (no en ListHeaderComponent)', () => {
    const regexFooterConBanner = /ListFooterComponent=\{[^}]*BannerAnuncio[^}]*\}/g
    const footersConBanner = SRC_BUSCAR.match(regexFooterConBanner) ?? []
    expect(footersConBanner).toHaveLength(2)
  })

  it('ningún ListHeaderComponent de este archivo monta BannerAnuncio', () => {
    // Cada bloque `ListHeaderComponent={...}` de buscar.tsx (hay dos, uno por
    // FlatList) no contiene BannerAnuncio. Mismo estilo que
    // `cantidadDeCamposDeTexto`: una regex que no cruza al siguiente prop
    // (corta en el primer `}` de cierre del valor del prop, que en este
    // archivo es JSX simple sin llaves anidadas dentro de ListHeaderComponent).
    const regexHeader = /ListHeaderComponent=\{[\s\S]*?\n\s*\}\s*\n/g
    let m: RegExpExecArray | null
    let encontrados = 0
    while ((m = regexHeader.exec(SRC_BUSCAR))) {
      encontrados += 1
      expect(m[0]).not.toContain('BannerAnuncio')
    }
    expect(encontrados).toBe(2)
  })

  it('no le pasa sinConexion (comentario que explica por qué: esta pantalla no tiene caché/sin-conexión propio)', () => {
    expect(SRC_BUSCAR).not.toMatch(/<BannerAnuncio\s+lugar="buscar"\s+sinConexion/)
    expect(SRC_BUSCAR).toMatch(/no tiene ningún estado de caché\/sin conexión propio/)
  })

  // El hallazgo de la R52 (ux-ui, sobre la web, y acá se repite en la app):
  // una FlatList dibuja ListFooterComponent TAMBIÉN cuando `data` está
  // vacía, justo debajo de ListEmptyComponent. Con una búsqueda sin
  // resultados, el banner quedaría pegado abajo de "No se encontraron
  // eventos para...", en el peor lugar posible — por eso el footer tiene que
  // cortar a `null` cuando la lista está vacía.
  //
  // R60 (lead, segunda pasada de ux-ui): la lista vacía NO alcanzaba. La
  // cuenta de alturas para 360×800 da el banner arrancando a los ~453 dp con
  // 1 o 2 resultados (cabecera ~160 + título ~32 + una fila de la grilla de 2
  // columnas, 237 dp por el `aspectRatio: 2/3` de TarjetaEvento), contra un
  // área visible de ~649 dp: asoma sin scrollear igual que en la web de la
  // R52. Con 3 resultados ya son dos filas y el banner se va a los ~702 dp.
  // Por eso el corte es por CANTIDAD, con la constante con nombre.
  it('el footer de la lista de RESULTADOS corta por cantidad, con el mínimo en 3 (regla (a): con 1 o 2 resultados el banner asoma sin scrollear)', () => {
    expect(SRC_BUSCAR).toMatch(/RESULTADOS_MINIMOS_PARA_ANUNCIO\s*=\s*3\b/)
    expect(SRC_BUSCAR).toMatch(
      /ListFooterComponent=\{\s*resultadosMostrados\.length < RESULTADOS_MINIMOS_PARA_ANUNCIO \? null : <BannerAnuncio\s+lugar="buscar"\s*\/>\s*\}/
    )
  })

  it('el footer de la lista de CATEGORÍAS corta a null cuando estado.categorias está vacío', () => {
    expect(SRC_BUSCAR).toMatch(
      /ListFooterComponent=\{estado\.categorias\.length === 0 \? null : <BannerAnuncio\s+lugar="buscar"\s*\/>\}/
    )
  })

  // Prueba de rotura explícita: si alguien reescribe el footer sin la guarda
  // (`ListFooterComponent={<BannerAnuncio lugar="buscar" />}` liso, sin el
  // `? null :`), el banner queda SIEMPRE, también con la lista vacía — este
  // caso demuestra que la aserción de arriba SÍ puede ponerse en rojo.
  describe('(fixture: demuestra que el detector de la guarda puede fallar)', () => {
    const REGEX_GUARDA =
      /ListFooterComponent=\{\s*resultadosMostrados\.length < RESULTADOS_MINIMOS_PARA_ANUNCIO \? null : <BannerAnuncio\s+lugar="buscar"\s*\/>\s*\}/

    it('un footer sin guarda no matchea la regex de la guarda', () => {
      expect('ListFooterComponent={<BannerAnuncio lugar="buscar" />}').not.toMatch(REGEX_GUARDA)
    })

    it('la guarda vieja, que solo cortaba con la lista VACÍA, tampoco matchea (el arreglo de la R60 no se puede deshacer en silencio)', () => {
      const guardaVieja = 'ListFooterComponent={resultadosMostrados.length === 0 ? null : <BannerAnuncio lugar="buscar" />}'
      expect(guardaVieja).not.toMatch(REGEX_GUARDA)
    })
  })
})
