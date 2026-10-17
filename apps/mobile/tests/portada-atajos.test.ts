// 36-a (G2 del feedback del teléfono, ops/rondas/36-feedback-telefono-2):
// Inicio pedía de nuevo eventos, categorías y cines en cada cambio de atajo
// (`cargarDatos` dependía de `atajo`) y pasaba por `Cargando`. Ahora pide una
// sola vez (`obtenerEventosVigentesParaInicio`) y el atajo se filtra en
// memoria con `eventoEnAtajo` de core.
//
// No hay `@testing-library/react-native` en el repo (mismo motivo que
// `tests/portada.test.ts`): `app/(tabs)/index.tsx` no se puede `import`ar
// acá, así que:
//   1. "Ninguna consulta al cambiar de atajo" se prueba con un detector
//      estático sobre el código fuente (`readFileSync`): el `useCallback` de
//      carga no depende de `atajo` (deps === []), el `useEffect` que dispara
//      la carga depende de `[cargarDatos, intento]` (nunca de `atajo`), y el
//      archivo ya no importa `obtenerEventosDeAtajo` (se borró).
//   2. "Equivalencia" se prueba contra las funciones reales de
//      `lib/datos/eventos.ts` y `@qps/core/home/atajos` (no una
//      reimplementación): se arma el mismo juego de filas que vería la base,
//      se llama a `obtenerEventosVigentesParaInicio` (con un doble de
//      Supabase) y se filtra en memoria igual que el `useMemo` de Inicio, y
//      el resultado se compara con una referencia calculada directamente
//      sobre las filas crudas (lo que hacía la vieja `obtenerEventosDeAtajo`:
//      `isVigente` + `eventoEnAtajo` sobre la fila, sin pasar por
//      `DisplayEvent`).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventoEnAtajo, type Atajo } from '@qps/core/home/atajos'
import { isVigente } from '@qps/core/events/vigencia'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_PATH = join(MOBILE_ROOT, 'app', '(tabs)', 'index.tsx')

const ATAJOS: Atajo[] = ['hoy', 'esta-noche', 'finde', 'semana']

// ---------------------------------------------------------------------------
// Parte 1: detector estático — ninguna consulta al cambiar de atajo.
// ---------------------------------------------------------------------------

/**
 * Comentarios de bloque y de línea vaciados, para que una mención de
 * `obtenerEventosDeAtajo` o de `atajo` dentro de un comentario no cuente
 * como código real. No hay "//" dentro de strings en las secciones que se
 * inspeccionan acá (confirmado a mano), así que la heurística alcanza.
 */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** Índice del `cierra` que balancea el `abre` en `idxApertura` (que ya es un `abre`). */
function indiceCierre(texto: string, idxApertura: number, abre: string, cierra: string): number {
  let profundidad = 0
  for (let i = idxApertura; i < texto.length; i++) {
    if (texto[i] === abre) profundidad++
    else if (texto[i] === cierra) {
      profundidad--
      if (profundidad === 0) return i
    }
  }
  return -1
}

/** Índice del `abre` que balancea el `cierra` en `idxCierre`, buscando hacia atrás. */
function indiceApertura(texto: string, idxCierre: number, abre: string, cierra: string): number {
  let profundidad = 0
  for (let i = idxCierre; i >= 0; i--) {
    if (texto[i] === cierra) profundidad++
    else if (texto[i] === abre) {
      profundidad--
      if (profundidad === 0) return i
    }
  }
  return -1
}

/**
 * El arreglo de dependencias (el `[...]` final, con corchetes) de la llamada
 * a `useCallback`/`useEffect` cuyo texto `marcador` (por ejemplo
 * `"useCallback("`) empieza en o después de `desde`. Usa conteo de paréntesis
 * balanceado (no una expresión regular que se pueda romper con paréntesis
 * anidados en el cuerpo), así que no alcanza con mover código de lugar para
 * evadirlo.
 */
function depsDe(texto: string, marcador: string, desde: number): string {
  const idxMarcador = texto.indexOf(marcador, desde)
  if (idxMarcador === -1) throw new Error(`no se encontró "${marcador}" desde el índice ${desde}`)

  const idxAperturaLlamada = idxMarcador + marcador.length - 1 // el '(' de la llamada
  if (texto[idxAperturaLlamada] !== '(') throw new Error(`"${marcador}" no termina en '('`)

  const idxCierreLlamada = indiceCierre(texto, idxAperturaLlamada, '(', ')')
  if (idxCierreLlamada === -1) throw new Error(`"${marcador}": paréntesis de la llamada sin cierre balanceado`)

  // El arreglo de deps es el último argumento: su ']' de cierre es el último
  // carácter no-espacio-ni-coma antes del ')' que cierra la llamada.
  let idxCierreDeps = idxCierreLlamada - 1
  while (idxCierreDeps > idxAperturaLlamada && /[\s,]/.test(texto[idxCierreDeps])) idxCierreDeps--
  if (texto[idxCierreDeps] !== ']') {
    throw new Error(`"${marcador}": el último argumento no es un arreglo de dependencias ([...])`)
  }

  const idxAperturaDeps = indiceApertura(texto, idxCierreDeps, '[', ']')
  if (idxAperturaDeps === -1) throw new Error(`"${marcador}": arreglo de deps sin apertura balanceada`)

  return texto.slice(idxAperturaDeps, idxCierreDeps + 1)
}

/**
 * Evasión encontrada en la pasada integral (R36): el barrido de más abajo, y
 * la búsqueda del efecto que llama a `cargarDatos().then(`, usaban
 * `indexOf('useEffect(', …)` — una cadena LITERAL. Un
 * `useLayoutEffect(() => { cargarDatos().then(setEstado) }, [atajo])`
 * (sumando `useLayoutEffect` al import de `'react'`) reintroduce el bug
 * entero (vuelve a pedir todo en cada cambio de atajo) sin que `indexOf`
 * lo note: `"useLayoutEffect("` no contiene `"useEffect("` como substring
 * (el "Layout" se mete en el medio). Por eso esta regex cubre las dos
 * formas — y, de paso, también `React.useEffect(`/`React.useLayoutEffect(`
 * (por si algún día este archivo deja de desestructurar los hooks de
 * `'react'`), aunque hoy `app/(tabs)/index.tsx` no usa ese estilo.
 */
const PATRON_EFECTO = /\b(?:React\.)?use(?:Effect|LayoutEffect)\(/g

/** Todas las llamadas a useEffect/useLayoutEffect (con o sin "React."), en orden, con su índice y el texto exacto del marcador (para pasarle a `depsDe`). */
function indicesDeEfectos(contenido: string): { idx: number; marcador: string }[] {
  return [...contenido.matchAll(PATRON_EFECTO)].map((m) => ({ idx: m.index, marcador: m[0] }))
}

describe('app/(tabs)/index.tsx: ninguna consulta al cambiar de atajo (detector estático)', () => {
  const crudo = readFileSync(INDEX_PATH, 'utf8')
  const contenido = sinComentarios(crudo)

  // Confirma que el detector mira contenido real (no vacío) antes de sacar
  // ninguna conclusión de lo que NO encuentra.
  it('el archivo se leyó (no está vacío) y sigue siendo el componente Inicio', () => {
    expect(contenido.length).toBeGreaterThan(500)
    expect(contenido).toMatch(/export default function Inicio\(\)/)
  })

  it('no importa (ni menciona) obtenerEventosDeAtajo: se borró, sin uso', () => {
    expect(contenido).not.toMatch(/\bobtenerEventosDeAtajo\b/)
  })

  it('importa obtenerEventosVigentesParaInicio de lib/datos/eventos (la carga nueva, sin Atajo)', () => {
    expect(contenido).toMatch(
      /import\s*\{[^}]*\bobtenerEventosVigentesParaInicio\b[^}]*\}\s*from\s*['"]@\/lib\/datos\/eventos['"]/
    )
  })

  it('importa eventoEnAtajo de @qps/core/home/atajos (el filtro se aplica en memoria con la función de core)', () => {
    expect(contenido).toMatch(/import\s*\{[^}]*\beventoEnAtajo\b[^}]*\}\s*from\s*['"]@qps\/core\/home\/atajos['"]/)
  })

  it('cargarDatos (useCallback) no depende de "atajo": sus dependencias son exactamente []', () => {
    const idxCargarDatos = contenido.indexOf('const cargarDatos = useCallback(')
    expect(idxCargarDatos).toBeGreaterThan(-1)

    const deps = depsDe(contenido, 'useCallback(', idxCargarDatos)
    expect(deps).not.toHaveLength(0)
    expect(deps.replace(/\s/g, '')).toBe('[]')
    expect(deps).not.toMatch(/\batajo\b/)
  })

  it('el useEffect/useLayoutEffect que dispara la carga depende de [cargarDatos, intento], nunca de "atajo"', () => {
    const idxLlamadaCargarDatos = contenido.indexOf('cargarDatos().then(')
    expect(idxLlamadaCargarDatos).toBeGreaterThan(-1)

    // El efecto que lo envuelve: el más cercano, ANTES de esa llamada, sea
    // useEffect( o useLayoutEffect( (ver el comentario de PATRON_EFECTO:
    // `lastIndexOf('useEffect(', …)` no encuentra un useLayoutEffect).
    const efectosAntes = indicesDeEfectos(contenido).filter((e) => e.idx <= idxLlamadaCargarDatos)
    expect(efectosAntes.length).toBeGreaterThan(0)
    const { idx: idxEfecto, marcador } = efectosAntes[efectosAntes.length - 1]

    const deps = depsDe(contenido, marcador, idxEfecto)
    expect(deps).not.toHaveLength(0)
    expect(deps.replace(/\s/g, '')).toBe('[cargarDatos,intento]')
    expect(deps).not.toMatch(/\batajo\b/)
  })

  it('ya no existe el bloque "comparar-y-ajustar" (atajoAnterior) que ponía estado en cargando al cambiar de atajo', () => {
    expect(contenido).not.toMatch(/\batajoAnterior\b/)
  })

  it('el useMemo de datosPortada sí depende de "atajo" (el filtro en memoria vive ahí)', () => {
    const idx = contenido.indexOf('const datosPortada = useMemo(')
    expect(idx).toBeGreaterThan(-1)
    const deps = depsDe(contenido, 'useMemo(', idx)
    expect(deps).not.toHaveLength(0)
    expect(deps).toMatch(/\batajo\b/)
  })

  // Evasión encontrada por el revisor/seguridad (R36): los dos casos de
  // arriba solo miran EL `useEffect` que llama a `cargarDatos().then(`. Un
  // segundo `useEffect` en el archivo, con deps `[atajo]`, que hiciera su
  // propia carga (aunque no mencionara `obtenerEventosDeAtajo` ni
  // `cargarDatos`, por ejemplo reusando `obtenerEventosVigentesParaInicio`
  // directamente) pasaba los dos casos de arriba sin que ninguno lo notara:
  // "no depende de atajo" solo se afirmaba del efecto encontrado por
  // `cargarDatos().then(`, nunca de TODOS los `useEffect(` del archivo. Este
  // caso recorre cada efecto real del archivo (balanceando paréntesis con
  // `depsDe`, no con una expresión regular para las deps en sí) y falla si
  // cualquiera depende de "atajo" — no solo el que carga los datos.
  //
  // Segunda evasión, encontrada en la pasada integral: el barrido buscaba
  // solo la cadena literal "useEffect(" — un `useLayoutEffect(() => {
  // cargarDatos().then(setEstado) }, [atajo])` (sumando `useLayoutEffect` al
  // import de 'react') reintroduce el bug entero (vuelve a pedir todo en
  // cada cambio de atajo) sin que el barrido lo note, porque "useEffect("
  // no es un substring de "useLayoutEffect(". `indicesDeEfectos` (arriba)
  // usa una regex que cubre las dos formas.
  it('ningún useEffect/useLayoutEffect del archivo depende de "atajo" (no solo el que llama a cargarDatos): barrido completo', () => {
    const efectos = indicesDeEfectos(contenido)

    // Si el día de mañana no queda ningún efecto en el archivo, este test
    // deja de decir nada: que haya al menos uno (el que carga los datos).
    expect(efectos.length).toBeGreaterThan(0)

    for (const { idx, marcador } of efectos) {
      const deps = depsDe(contenido, marcador, idx)
      expect(deps).not.toMatch(/\batajo\b/)
    }
  })
})

// ---------------------------------------------------------------------------
// Parte 2: equivalencia. Mismo doble de Supabase que el resto de
// `tests/datos-*.test.ts` (fixtures inventados, sin red ni base).
// ---------------------------------------------------------------------------

const estado = vi.hoisted(() => ({
  resultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.or = () => builder
      builder.order = () => builder
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(estado.resultado).then(resolve, reject)
      return builder
    },
  },
}))

import { obtenerEventosVigentesParaInicio } from '../lib/datos/eventos'

interface FilaCruda {
  id: string
  slug: string
  title: string
  description: null
  short_description: null
  start_date: string
  end_date: string | null
  price_min: number
  is_free: boolean
  image_url: null
  ticket_url: null
  age_restriction: number
  is_featured: boolean
  category: { slug: string; name: string } | null
  venue: { name: string; address: string } | null
}

function filaDeEvento(over: Partial<FilaCruda> & { id: string; start_date: string }): FilaCruda {
  return {
    slug: over.id,
    title: `Evento ${over.id}`,
    description: null,
    short_description: null,
    end_date: null,
    price_min: 0,
    is_free: true,
    image_url: null,
    ticket_url: null,
    age_restriction: 0,
    is_featured: false,
    category: { slug: 'teatro', name: 'Teatro' },
    venue: { name: 'Venue de Prueba', address: 'Calle de Prueba 123' },
    ...over,
  }
}

// Martes, 20:00 hora de Salta (mismo instante que tests/datos-eventos.test.ts).
const AHORA = new Date('2026-10-13T20:00:00-03:00')

// E1: hoy, con hora, vigente por sí solo (sin end_date) — entra en "hoy" y "semana".
const E1 = filaDeEvento({ id: 'e1-hoy-con-hora', start_date: '2026-10-13T21:00:00-03:00' })

// E2: boliches, hoy, SIN hora explícita (00:00 de Salta) — la regla extra de
// "esta noche" para boliches/peñas sin hora (además entra en "hoy" y "semana"
// por ventana directa).
const E2 = filaDeEvento({
  id: 'e2-boliche-sin-hora',
  start_date: '2026-10-13T00:00:00-03:00',
  category: { slug: 'boliches', name: 'Boliches' },
})

// E3, la trampa 1: empezó hace 12 h (a las 08:00, con hora explícita), así
// que SIN `end_date` ya no estaría vigente a las 20:00 (08:00 + 4 h = 12:00 <
// 20:00) y quedaría afuera de TODOS los atajos. Con `end_date` explícito
// largo (25/10), `isVigente` lo deja pasar y entra en "hoy" y "semana" (la
// ventana del atajo se decide por `start_date`, no por `end_date`).
const E3 = filaDeEvento({
  id: 'e3-fin-explicito-largo',
  start_date: '2026-10-13T08:00:00-03:00',
  end_date: '2026-10-25T23:59:00-03:00',
})

// E4: el viernes que viene a las 20:00 — entra en "finde" y "semana", no en "hoy" ni "esta-noche".
const E4 = filaDeEvento({ id: 'e4-finde', start_date: '2026-10-16T20:00:00-03:00' })

// E5: muy lejos en el futuro (más de 7 días) — vigente, pero no cae en ninguno de los 4 atajos.
const E5 = filaDeEvento({ id: 'e5-fuera-de-todo', start_date: '2026-11-15T20:00:00-03:00' })

const FILAS = [E1, E2, E3, E4, E5]

/** Lo que calculaba la vieja `obtenerEventosDeAtajo`: isVigente + eventoEnAtajo sobre la fila cruda. */
function idsEsperadosViejo(atajo: Atajo): string[] {
  return FILAS.filter((fila) => Boolean(fila.category))
    .filter((fila) => isVigente(fila, AHORA))
    .filter((fila) =>
      eventoEnAtajo({ start_date: fila.start_date, end_date: fila.end_date, category: fila.category?.slug ?? null }, atajo, AHORA)
    )
    .map((fila) => fila.id)
    .sort()
}

const ESPERADO_POR_ATAJO: Record<Atajo, string[]> = {
  hoy: [E1.id, E2.id, E3.id].sort(),
  'esta-noche': [E1.id, E2.id].sort(),
  finde: [E4.id].sort(),
  semana: [E1.id, E2.id, E3.id, E4.id].sort(),
}

describe('equivalencia: el filtro en memoria da lo mismo que daba obtenerEventosDeAtajo, para los 4 atajos', () => {
  beforeEach(() => {
    estado.resultado = { data: FILAS, error: null }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(ATAJOS)('atajo "%s": coincide con el valor esperado a mano y con la referencia calculada sobre las filas crudas', async (atajo) => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')

    // El filtro en memoria, igual que el useMemo de datosPortada en index.tsx.
    const nuevo = resultado.eventos
      .filter((item) => eventoEnAtajo(item.paraAtajo, atajo, AHORA))
      .map((item) => item.evento.id)
      .sort()

    expect(nuevo).toEqual(ESPERADO_POR_ATAJO[atajo])
    expect(nuevo).toEqual(idsEsperadosViejo(atajo))
  })

  it('trampa 1: si `paraAtajo` se reconstruyera sin `end_date` (solo con evento.startDateTime), el evento con fin explícito largo se perdería en "hoy" y en "semana"', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')

    const malo = (atajo: Atajo) =>
      resultado.eventos
        .filter((item) =>
          eventoEnAtajo({ start_date: item.evento.startDateTime, category: item.evento.category }, atajo, AHORA)
        )
        .map((item) => item.evento.id)
        .sort()

    // La reconstrucción correcta (con end_date, la que hace la app) sí trae a E3.
    expect(ESPERADO_POR_ATAJO.hoy).toContain(E3.id)
    expect(ESPERADO_POR_ATAJO.semana).toContain(E3.id)

    // La reconstrucción incorrecta (sin end_date) lo pierde en ambos.
    expect(malo('hoy')).not.toContain(E3.id)
    expect(malo('semana')).not.toContain(E3.id)
  })

  it('las películas de cine no pasan por este filtro (no tienen "paraAtajo"): seguimos sin cambiar eso', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    // `EventoVigenteParaInicio` no tiene forma de representar una película:
    // `estado.peliculas` en index.tsx se suma siempre, fuera de este arreglo.
    expect(resultado.eventos.every((item) => !item.evento.isCinemaMovie)).toBe(true)
  })
})
