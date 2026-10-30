/**
 * "Una sola regla" (R50, QPS-239/-240, tarea 50-q): barre apps/web/{app,
 * components,lib}, apps/mobile/{app,components,lib} y packages/core/src como
 * texto (sin ejecutar nada, sin red ni base) para que nadie reimplemente la
 * regla de destacados a mano.
 *
 * Tres detectores, cada uno con sus fixtures en memoria (demuestran que el
 * detector detecta de verdad lo que dice detectar) y su evasión documentada:
 *
 *   A. nadie compara `featured_until`/`featuredUntil` con una fecha a mano,
 *      salvo `packages/core/src/events/destacados.ts` (la única regla).
 *   B. nadie usa `is_featured` (columna legada, snake_case) ni un literal
 *      `isFeatured: true/false` hardcodeado para decidir qué se muestra,
 *      salvo la lista de excepciones documentada (escribir is_featured SIN
 *      leerlo para decidir, o un isFeatured fijo en entidades que nunca se
 *      destacan). Nota de alcance: leer `isFeatured` (el campo YA resuelto
 *      de `DisplayEvent`, p. ej. `event.isFeatured` en `event-card.tsx`) NO
 *      está prohibido — es, literalmente, el punto de que exista ese campo.
 *      Lo prohibido es la columna cruda `is_featured` y un `isFeatured`
 *      fijado a mano sin pasar por `estaDestacado()`.
 *   C. columnas privadas: ningún `select` de `apps/web/app`, de
 *      `apps/web/lib/data.ts` ni de `apps/mobile/lib` pide `featured_set_by`
 *      ni `featured_set_at`. Solo `apps/web/lib/admin/destacados-actions.ts`.
 *
 * Sin imports de otro `*.test.ts` (QPS-250): `sinComentarios` y el listador
 * de archivos son copias locales, mismo criterio que
 * `tests/components/insignia-destacado.test.ts`/`tests/asistencia/orden-ficha.test.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PUBLIC_EVENT_COLUMNS } from '@qps/core/events/public-select'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url)) // apps/web/
const REPO_ROOT = path.join(WEB_ROOT, '..', '..') // raíz del monorepo
const MOBILE_ROOT = path.join(REPO_ROOT, 'apps', 'mobile')
const CORE_SRC_ROOT = path.join(REPO_ROOT, 'packages', 'core', 'src')

/** Lista recursiva de `.ts`/`.tsx` bajo `dirAbsoluto`, sin los propios `*.test.ts(x)`. */
function listarFuentes(dirAbsoluto: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dirAbsoluto, { withFileTypes: true })) {
    const abs = path.join(dirAbsoluto, entrada.name)
    if (entrada.isDirectory()) {
      resultado.push(...listarFuentes(abs))
    } else if (entrada.isFile() && /\.(ts|tsx)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      resultado.push(abs)
    }
  }
  return resultado
}

function relRepo(abs: string): string {
  return path.relative(REPO_ROOT, abs).replace(/\\/g, '/')
}

// Universo de archivos de producción que cubre esta tarea (sin tests).
const ARCHIVOS_WEB_APP = listarFuentes(path.join(WEB_ROOT, 'app'))
const ARCHIVOS_WEB_COMPONENTS = listarFuentes(path.join(WEB_ROOT, 'components'))
const ARCHIVOS_WEB_LIB = listarFuentes(path.join(WEB_ROOT, 'lib'))
const ARCHIVOS_MOBILE_APP = listarFuentes(path.join(MOBILE_ROOT, 'app'))
const ARCHIVOS_MOBILE_COMPONENTS = listarFuentes(path.join(MOBILE_ROOT, 'components'))
const ARCHIVOS_MOBILE_LIB = listarFuentes(path.join(MOBILE_ROOT, 'lib'))
const ARCHIVOS_CORE_SRC = listarFuentes(CORE_SRC_ROOT)

const TODOS_LOS_ARCHIVOS = [
  ...ARCHIVOS_WEB_APP,
  ...ARCHIVOS_WEB_COMPONENTS,
  ...ARCHIVOS_WEB_LIB,
  ...ARCHIVOS_MOBILE_APP,
  ...ARCHIVOS_MOBILE_COMPONENTS,
  ...ARCHIVOS_MOBILE_LIB,
  ...ARCHIVOS_CORE_SRC,
]

describe('sanity: el barrido encuentra archivos de verdad (si esto falla, los detectores de abajo pasarían por las razones equivocadas)', () => {
  it('cada raíz tiene al menos un archivo', () => {
    expect(ARCHIVOS_WEB_APP.length).toBeGreaterThan(0)
    expect(ARCHIVOS_WEB_COMPONENTS.length).toBeGreaterThan(0)
    expect(ARCHIVOS_WEB_LIB.length).toBeGreaterThan(0)
    expect(ARCHIVOS_MOBILE_APP.length).toBeGreaterThan(0)
    expect(ARCHIVOS_MOBILE_COMPONENTS.length).toBeGreaterThan(0)
    expect(ARCHIVOS_MOBILE_LIB.length).toBeGreaterThan(0)
    expect(ARCHIVOS_CORE_SRC.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// A. Nadie compara featured_until/featuredUntil con una fecha a mano.
// ===========================================================================

const RUTA_DESTACADOS_CORE = path.join(CORE_SRC_ROOT, 'events', 'destacados.ts') // la ÚNICA excepción

/**
 * `true` si `contenidoSinComentarios` compara `featured_until`/`featuredUntil`
 * con una fecha "a mano" (en vez de llamar a `estaDestacado()`/
 * `textoVenceDestacado()` de core, pasándole el campo como argumento).
 *
 * Patrones que delata:
 *   1. `new Date(... featured_until/featuredUntil ...)`: alguien construye
 *      su propia fecha a partir del campo, en vez de pasárselo crudo a
 *      `estaDestacado`.
 *   2. `featured_until`/`featuredUntil` seguido de `.getTime()` (con o sin
 *      el `new Date(...)` de encierro: ya cubierto por (1) en ese caso, pero
 *      cubre también una variante que ya tenía una fecha).
 *   3. `Date.parse(... featured_until/featuredUntil ...)`.
 *   4. una comparación `<`/`>`/`<=`/`>=` donde el campo aparece de un lado y,
 *      del otro, algo que huele a "el reloj" (`new Date`, `Date.now`,
 *      `ahora`, `now`): `featured_until > ahora`, `now() >= featuredUntil`.
 *
 * CÓMO SE EVADE (documentado a propósito, no es un descuido):
 *   - Guardar el campo en una variable con otro nombre ANTES de comparar:
 *     `const fu = event.featured_until; if (new Date(fu) > ahora) {...}` — el
 *     patrón (1) exige que el texto "featured" esté DENTRO de los paréntesis
 *     de `new Date(...)`; acá no está (está en la variable `fu`), así que no
 *     matchea. El patrón (4) tampoco: la comparación ocurre sobre `fu`, no
 *     sobre el nombre del campo.
 *   - Comparar contra una variable que no se llama "ahora"/"now" ni es
 *     `new Date`/`Date.now` (ej. `featured_until > limite`): el patrón (4)
 *     solo reconoce esas palabras del lado del reloj.
 *   - Comparación lexicográfica de strings ISO sin ningún `Date` de por
 *     medio en el texto (`event.featured_until > '2030-01-01'`): evade (1) y
 *     (3) porque no hay `new Date(`/`Date.parse(`, y evade (4) porque el
 *     literal no empieza con las palabras reconocidas.
 */
function comparaFechaAMano(contenidoSinComentarios: string): boolean {
  const c = contenidoSinComentarios
  const campo = '(featured_until|featuredUntil)'
  if (new RegExp(`new Date\\([^)\\n]*${campo}[^)\\n]*\\)`).test(c)) return true
  if (new RegExp(`${campo}\\s*\\)?\\s*\\.getTime\\(\\)`).test(c)) return true
  if (new RegExp(`Date\\.parse\\([^)\\n]*${campo}[^)\\n]*\\)`).test(c)) return true
  if (new RegExp(`${campo}\\b[^\\n;,]{0,20}[<>]=?\\s*(new Date|Date\\.now|ahora|now)\\b`).test(c)) return true
  if (new RegExp(`(new Date|Date\\.now|ahora|now)\\b[^\\n;,]{0,20}[<>]=?[^\\n;,]{0,20}${campo}\\b`).test(c)) return true
  return false
}

describe('comparaFechaAMano (fixtures en memoria: tiene que detectar de verdad, y fallar donde dice que falla)', () => {
  it('detecta new Date(evento.featured_until) > ahora', () => {
    expect(comparaFechaAMano('const vigente = new Date(evento.featured_until) > ahora')).toBe(true)
  })

  it('detecta new Date(evento.featuredUntil).getTime() > Date.now()', () => {
    expect(comparaFechaAMano('if (new Date(evento.featuredUntil).getTime() > Date.now()) {}')).toBe(true)
  })

  it('detecta Date.parse(evento.featured_until)', () => {
    expect(comparaFechaAMano('const t = Date.parse(evento.featured_until)')).toBe(true)
  })

  it('detecta event.featured_until > new Date().toISOString() (clock del lado derecho)', () => {
    expect(comparaFechaAMano('return event.featured_until > new Date().toISOString()')).toBe(true)
  })

  it('detecta ahora.getTime() >= new Date(x.featuredUntil).getTime() (clock del lado izquierdo)', () => {
    expect(comparaFechaAMano('ahora.getTime() >= new Date(x.featuredUntil).getTime()')).toBe(true)
  })

  it('NO confunde pasar el campo crudo a estaDestacado/textoVenceDestacado (el patrón sancionado)', () => {
    expect(comparaFechaAMano('estaDestacado(evento.featured_until, new Date())')).toBe(false)
    expect(comparaFechaAMano('textoVenceDestacado(featuredUntil, ahora)')).toBe(false)
  })

  it('NO confunde una asignación del campo (featuredUntil: event.featured_until ?? null)', () => {
    expect(comparaFechaAMano('featuredUntil: event.featured_until ?? null,')).toBe(false)
  })

  it('NO confunde pasar el campo como prop de JSX (featuredUntil={event.featured_until ?? null} />)', () => {
    expect(
      comparaFechaAMano('<ControlDestacado eventId={event.id} featuredUntil={event.featured_until ?? null} />'),
    ).toBe(false)
  })

  it('EVASIÓN DOCUMENTADA: guardar el campo en una variable con otro nombre antes de comparar', () => {
    const evasion = 'const fu = event.featured_until\nif (new Date(fu) > ahora) {}'
    expect(comparaFechaAMano(evasion)).toBe(false)
  })

  it('EVASIÓN DOCUMENTADA: comparar contra una variable que no se llama ahora/now', () => {
    const evasion = 'if (event.featured_until > limite) {}'
    expect(comparaFechaAMano(evasion)).toBe(false)
  })
})

describe('Detector A: nadie compara featured_until/featuredUntil con una fecha a mano (salvo events/destacados.ts)', () => {
  it.each(
    TODOS_LOS_ARCHIVOS.filter((abs) => abs !== RUTA_DESTACADOS_CORE).map(
      (abs) => [relRepo(abs), abs] as const,
    ),
  )('%s', (_label, abs) => {
    const contenido = sinComentarios(readFileSync(abs, 'utf8'))
    if (comparaFechaAMano(contenido)) {
      throw new Error(`${relRepo(abs)}: compara featured_until/featuredUntil con una fecha a mano`)
    }
    expect(comparaFechaAMano(contenido)).toBe(false)
  })

  it('events/destacados.ts SÍ compara (si no, el detector de arriba pasaría por las razones equivocadas)', () => {
    const contenido = sinComentarios(readFileSync(RUTA_DESTACADOS_CORE, 'utf8'))
    expect(comparaFechaAMano(contenido)).toBe(true)
  })
})

// ===========================================================================
// B. Nadie usa is_featured (crudo) ni un isFeatured fijo a mano para decidir
//    qué se muestra.
// ===========================================================================

/**
 * Excepciones documentadas, en DOS grupos:
 *
 * (1) escriben `is_featured` (columna legada) pero no lo leen para decidir
 *     nada — sigue vivo porque `merge_events()`, `unmerge_event()`, el
 *     índice `idx_events_featured` y `record_event_metric` todavía dependen
 *     de la columna (ver el comentario de `destacados-actions.ts` y el
 *     punto 9 de `ops/rondas/50-destacados/progreso.md`).
 * (2) fijan un `isFeatured` (camelCase, el campo YA resuelto) a mano, SIEMPRE
 *     en `false`, para entidades que por diseño nunca se destacan (flyers de
 *     Instagram, películas): no reimplementan la regla, solo la descartan.
 *
 * Las dos últimas filas son HALLAZGOS de esta tarea (50-q), NO estaban en la
 * lista del encargo de la ronda:
 *   - `lib/data.ts`: `getEvents({ featured: true })` sigue filtrando por el
 *     flag legado (`.eq('is_featured', true)`). Hoy no tiene ningún call
 *     site en la UI (se verificó con un `grep` de `getEvents(` en toda
 *     `apps/web`), pero si alguna vez alguien lo llama con `featured: true`,
 *     va a traer destacados VENCIDOS (is_featured sigue true hasta que un
 *     admin lo destoca a mano) y a perderse destacados nuevos si algún día
 *     is_featured deja de escribirse en paralelo. No es un bug activo (nadie
 *     lo llama hoy), pero es una trampa para quien lo use.
 *   - `packages/core/src/types.ts`: `Event.is_featured: boolean` es la
 *     declaración de tipo de la columna legada en la fila cruda —
 *     inevitable mientras la columna exista en la base y en
 *     `PUBLIC_EVENT_COLUMNS`; no decide nada por sí sola.
 *   - `packages/core/src/events/public-select.ts`: enumera `'is_featured'`
 *     dentro de `PUBLIC_EVENT_COLUMNS` — sigue siendo una columna pública
 *     (aunque legada), no una decisión de qué mostrar.
 *   - `lib/events-data.ts`: archivo de mocks (`mockEvents`) con
 *     `isFeatured: true` hardcodeado, SIN ningún importador real en el
 *     repo (se verificó con un `grep` de `mockEvents` en `apps/web`: el
 *     único archivo que lo menciona es él mismo). No decide nada porque no
 *     se ejecuta nunca, pero si algún día alguien lo importa por error, va a
 *     mostrar "destacados" falsos. Candidato a borrar.
 */
const EXCEPCIONES_IS_FEATURED: ReadonlyArray<{ archivo: string; motivo: string }> = [
  { archivo: 'apps/web/lib/ai/process-flyer-ai.ts', motivo: 'IA: inserta is_featured: false en eventos nuevos' },
  { archivo: 'apps/web/lib/recurrentes/generar.ts', motivo: 'eventos recurrentes generados: is_featured: false' },
  { archivo: 'apps/web/lib/scraper/parsers.ts', motivo: 'scraper: is_featured: false en filas nuevas' },
  { archivo: 'apps/web/lib/scraper/save-to-supabase.ts', motivo: 'scraper: is_featured: false en filas nuevas' },
  { archivo: 'apps/web/app/api/cron/scrape/run-scrape-job.ts', motivo: 'cron de scraping: is_featured: false en filas nuevas' },
  {
    archivo: 'apps/web/lib/admin/destacados-actions.ts',
    motivo: 'escribe is_featured true/false EN PARALELO con featured_until (merge_events, unmerge_event, el índice y record_event_metric siguen dependiendo de la columna)',
  },
  {
    archivo: 'apps/web/lib/admin-actions.ts',
    motivo: 'toggleEventFeatured (línea 285): sin llamadores a propósito, no se borró (ver progreso de la tarea 50-c)',
  },
  {
    archivo: 'apps/web/lib/data.ts',
    motivo: 'HALLAZGO 50-q: getEvents({ featured: true }) filtra .eq("is_featured", true); sin call site en la UI hoy, pero es una trampa si algún día se usa',
  },
  {
    archivo: 'packages/core/src/types.ts',
    motivo: 'HALLAZGO 50-q: declaración de tipo de la columna legada en la fila cruda (Event.is_featured: boolean); inevitable mientras exista en la base',
  },
  {
    archivo: 'packages/core/src/events/public-select.ts',
    motivo: 'HALLAZGO 50-q: enumera "is_featured" en PUBLIC_EVENT_COLUMNS; sigue siendo una columna pública (legada), no decide nada',
  },
  { archivo: 'apps/web/app/buscar/buscar-content.tsx', motivo: 'fija isFeatured: false a mano para flyers de Instagram y películas: no se destacan' },
  { archivo: 'packages/core/src/home/transform.ts', motivo: 'transformFlyer/transformMovie: isFeatured: false fijo (flyers y películas no se destacan)' },
  { archivo: 'packages/core/src/favoritos/armar.ts', motivo: 'mismo criterio que transform.ts para entidades que no son eventos regulares' },
  {
    archivo: 'apps/web/lib/events-data.ts',
    motivo: 'HALLAZGO 50-q: archivo de mocks (mockEvents) con isFeatured: true hardcodeado, sin ningún importador real en el repo (candidato a borrar)',
  },
]

/** `true` si `contenidoSinComentarios` lee/escribe is_featured crudo, o fija un isFeatured literal (true/false) a mano. */
function usaIsFeaturedCrudoOLiteral(contenidoSinComentarios: string): boolean {
  if (/\bis_featured\b/.test(contenidoSinComentarios)) return true
  if (/isFeatured\s*[:=]\s*(true|false)\b/.test(contenidoSinComentarios)) return true
  return false
}

describe('usaIsFeaturedCrudoOLiteral (fixtures en memoria)', () => {
  it('detecta is_featured crudo (lectura o escritura)', () => {
    expect(usaIsFeaturedCrudoOLiteral("query.eq('is_featured', true)")).toBe(true)
    expect(usaIsFeaturedCrudoOLiteral('is_featured: false,')).toBe(true)
  })

  it('detecta isFeatured: true/false hardcodeado', () => {
    expect(usaIsFeaturedCrudoOLiteral('isFeatured: false,')).toBe(true)
    expect(usaIsFeaturedCrudoOLiteral('isFeatured = true')).toBe(true)
  })

  it('NO confunde leer isFeatured ya resuelto (event.isFeatured, el patrón sancionado)', () => {
    expect(usaIsFeaturedCrudoOLiteral('<InsigniaDestacado visible={event.isFeatured} />')).toBe(false)
  })

  it('NO confunde calcularlo con estaDestacado (isFeatured: estaDestacado(event.featured_until, new Date()))', () => {
    expect(usaIsFeaturedCrudoOLiteral('isFeatured: estaDestacado(event.featured_until, new Date()),')).toBe(false)
  })

  it('NO confunde una declaración de tipo (isFeatured: boolean)', () => {
    expect(usaIsFeaturedCrudoOLiteral('isFeatured: boolean')).toBe(false)
  })

  it('EVASIÓN DOCUMENTADA: un literal guardado en una variable, no inline (const activo = true; ... isFeatured: activo)', () => {
    expect(usaIsFeaturedCrudoOLiteral('const activo = true\nitems.push({ isFeatured: activo })')).toBe(false)
  })

  it('EVASIÓN DOCUMENTADA: propiedad computada (sin el identificador is_featured ni "isFeatured:" literal)', () => {
    // ["is_fea" + "tured"]: true -- el texto "is_featured" nunca aparece junto en el archivo.
    expect(usaIsFeaturedCrudoOLiteral('const k = "is_fea" + "tured"; obj[k] = true')).toBe(false)
  })
})

describe('Detector B: nadie usa is_featured crudo ni un isFeatured fijo a mano (salvo la lista de excepciones)', () => {
  const rutasExcepcion = new Set(EXCEPCIONES_IS_FEATURED.map((e) => path.join(REPO_ROOT, e.archivo)))

  it('la lista de excepciones no creció (si este número cambia, hay que revisarla a mano, no subirlo sin mirar)', () => {
    expect(EXCEPCIONES_IS_FEATURED.length).toBe(14)
  })

  it('cada excepción documentada existe de verdad y sigue conteniendo lo que dice contener', () => {
    for (const excepcion of EXCEPCIONES_IS_FEATURED) {
      const abs = path.join(REPO_ROOT, excepcion.archivo)
      const contenido = sinComentarios(readFileSync(abs, 'utf8'))
      expect(usaIsFeaturedCrudoOLiteral(contenido)).toBe(true)
    }
  })

  it.each(TODOS_LOS_ARCHIVOS.map((abs) => [relRepo(abs), abs] as const))('%s', (label, abs) => {
    const contenido = sinComentarios(readFileSync(abs, 'utf8'))
    const encontrado = usaIsFeaturedCrudoOLiteral(contenido)
    const esExcepcion = rutasExcepcion.has(abs)

    if (encontrado && !esExcepcion) {
      throw new Error(`${label}: usa is_featured crudo o un isFeatured fijo a mano, y no está en la lista de excepciones`)
    }
    expect(encontrado).toBe(esExcepcion ? true : false)
  })
})

// ===========================================================================
// C. Columnas privadas: featured_set_by/featured_set_at.
// ===========================================================================

/**
 * `true` si alguno de los `.select(...)` del archivo PIDE (en el string
 * literal que recibe) `featured_set_by`/`featured_set_at`. A propósito NO es
 * "el archivo nombra la columna en cualquier lado": `apps/web/app/admin/destacados/page.tsx`
 * nombra `featured_set_at` (la tarea 50-b lo expone en el tipo
 * `DestacadoParaLista` y lo muestra en la UI del admin), pero no hace ningún
 * `select` — consume el dato que YA trajo `obtenerDestacados()`
 * (`lib/admin/destacados-actions.ts`, la única función que puede pedirlo).
 * Esa es una CUARTA excepción legítima que no estaba en la lista del encargo
 * (ver el reporte de la tarea): no es un `select`, es la UI consumiendo un
 * dato ya auditado.
 *
 * CÓMO SE EVADE: armar el string del `.select(...)` por fuera (en una
 * constante en otro módulo, o con un template literal interpolado
 * `` .select(`${COLUMNAS}`) ``): esta función solo mira el texto LITERAL que
 * recibe `.select(`, no lo que resuelve en runtime una variable.
 */
function pideColumnaPrivadaEnSelect(contenido: string): boolean {
  const regexSelect = /\.select\(\s*(['"`])([\s\S]*?)\1/g
  let match: RegExpExecArray | null
  while ((match = regexSelect.exec(contenido))) {
    if (/featured_set_by|featured_set_at/.test(match[2])) return true
  }
  return false
}

describe('pideColumnaPrivadaEnSelect (fixtures en memoria)', () => {
  it('detecta un .select(...) con las columnas privadas', () => {
    expect(pideColumnaPrivadaEnSelect(".select('id, title, featured_set_by, featured_set_at')")).toBe(true)
  })

  it('NO confunde nombrar la columna fuera de un .select (ej. un tipo o un JSX que la muestra)', () => {
    expect(pideColumnaPrivadaEnSelect('const x: { featured_set_at: string } = evento')).toBe(false)
    expect(pideColumnaPrivadaEnSelect('<span>{evento.featured_set_at}</span>')).toBe(false)
  })

  it('NO confunde un .select(PUBLIC_EVENT_SELECT) (variable, no string literal)', () => {
    expect(pideColumnaPrivadaEnSelect('.select(PUBLIC_EVENT_SELECT)')).toBe(false)
  })

  it('EVASIÓN DOCUMENTADA: armar el string por fuera y pasarlo interpolado', () => {
    const evasion = 'const COLUMNAS = `id, featured_set_by, featured_set_at`\n.select(`${COLUMNAS}`)'
    expect(pideColumnaPrivadaEnSelect(evasion)).toBe(false)
  })
})

describe('Detector C: columnas privadas (featured_set_by/featured_set_at)', () => {
  it('PUBLIC_EVENT_COLUMNS no las incluye', () => {
    expect(PUBLIC_EVENT_COLUMNS).not.toContain('featured_set_by')
    expect(PUBLIC_EVENT_COLUMNS).not.toContain('featured_set_at')
  })

  const RUTA_DESTACADOS_ACTIONS = path.join(WEB_ROOT, 'lib', 'admin', 'destacados-actions.ts')

  it('destacados-actions.ts SÍ las pide en un .select (si no, el detector de abajo no probaría nada)', () => {
    const contenido = sinComentarios(readFileSync(RUTA_DESTACADOS_ACTIONS, 'utf8'))
    expect(pideColumnaPrivadaEnSelect(contenido)).toBe(true)
  })

  // apps/web/app (completo), apps/web/lib/data.ts (solo ese archivo, no todo
  // lib/: lib/admin/destacados-actions.ts SÍ puede pedirlas) y
  // apps/mobile/lib (completo).
  const archivosAVerificar = [
    ...ARCHIVOS_WEB_APP,
    path.join(WEB_ROOT, 'lib', 'data.ts'),
    ...ARCHIVOS_MOBILE_LIB,
  ]

  it.each(archivosAVerificar.map((abs) => [relRepo(abs), abs] as const))('%s: no PIDE featured_set_by ni featured_set_at en un .select', (label, abs) => {
    const contenido = sinComentarios(readFileSync(abs, 'utf8'))
    if (pideColumnaPrivadaEnSelect(contenido)) {
      throw new Error(`${label}: pide featured_set_by/featured_set_at en un .select (columna privada de auditoría del panel)`)
    }
    expect(pideColumnaPrivadaEnSelect(contenido)).toBe(false)
  })
})
