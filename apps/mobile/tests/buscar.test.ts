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
// Lectura estática: un solo TextInput y TarjetaEvento en los resultados.
// ---------------------------------------------------------------------------
describe('buscar.tsx: lectura estática', () => {
  it('un solo <TextInput (ya no hay dos: "evento" y "lugar")', () => {
    const coincidencias = SRC_BUSCAR.match(/<TextInput\b/g) ?? []
    expect(coincidencias).toHaveLength(1)
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
