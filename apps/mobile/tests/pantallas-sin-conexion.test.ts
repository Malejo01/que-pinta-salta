// R43, 43-c (plan `ops/rondas/43-sin-conexion/plan.md`): Inicio
// (`app/(tabs)/index.tsx`) y Favoritos (`app/(tabs)/favoritos.tsx`) muestran
// la última caché buena (`@/lib/sin-conexion/agenda` y
// `@/lib/sin-conexion/favoritos`, 43-b) cuando la carga falla por red.
//
// Mismo motivo que `tests/portada-atajos.test.ts`/`tests/portada.test.ts`:
// ninguno de los dos archivos se puede `import`ar acá (importan React
// Native/expo-router/una imagen, y no hay `@testing-library/react-native` en
// el repo). Por eso:
//   1. Lo que se puede chequear sin montar nada (imports, y que el aviso /
//      la lectura de la caché están bajo la condición correcta) se prueba
//      con detectores estáticos (`readFileSync`).
//   2. `decidirVistaFavoritos` (la función pura del punto 5 del encargo,
//      exportada de `app/(tabs)/favoritos.tsx`) se re-testea con una COPIA
//      LOCAL idéntica — mismo patrón que `seccionesPortada`/`eventosHero`
//      en `tests/portada.test.ts` — más un chequeo de texto que la mantiene
//      en sincro con el archivo real.
//
// Fixtures inventados, sin red ni base, sin ids ni nombres reales.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_PATH = join(MOBILE_ROOT, 'app', '(tabs)', 'index.tsx')
const FAVORITOS_PATH = join(MOBILE_ROOT, 'app', '(tabs)', 'favoritos.tsx')
// Vuelta 1, arreglo 1: el propio archivo de test, para comparar el cuerpo de
// la copia local de `decidirVistaFavoritos` (más abajo) contra el real.
const TEST_PATH = fileURLToPath(import.meta.url)

const contenidoIndex = readFileSync(INDEX_PATH, 'utf8')
const contenidoFavoritos = readFileSync(FAVORITOS_PATH, 'utf8')
const contenidoTest = readFileSync(TEST_PATH, 'utf8')

// ---------------------------------------------------------------------------
// Inicio (app/(tabs)/index.tsx)
// ---------------------------------------------------------------------------
describe('app/(tabs)/index.tsx: carga con caché (detector estático)', () => {
  it('el archivo se leyó (no está vacío)', () => {
    expect(contenidoIndex.length).toBeGreaterThan(500)
  })

  it('importa cargarAgendaConCache de @/lib/sin-conexion/agenda', () => {
    expect(contenidoIndex).toMatch(
      /import\s*\{[^}]*\bcargarAgendaConCache\b[^}]*\}\s*from\s*['"]@\/lib\/sin-conexion\/agenda['"]/,
    )
  })

  it('llama a cargarAgendaConCache (no solo la importa)', () => {
    expect(contenidoIndex).toMatch(/\bcargarAgendaConCache\s*\(/)
  })

  it('importa AvisoSinConexion de @/components/AvisoSinConexion', () => {
    expect(contenidoIndex).toMatch(
      /import\s*\{[^}]*\bAvisoSinConexion\b[^}]*\}\s*from\s*['"]@\/components\/AvisoSinConexion['"]/,
    )
  })

  it('dibuja <AvisoSinConexion bajo una condición con desdeCache (nunca sin condición)', () => {
    const idxUso = contenidoIndex.indexOf('<AvisoSinConexion')
    expect(idxUso).toBeGreaterThan(-1)

    // Los 80 caracteres antes del uso tienen que mencionar "desdeCache": es
    // la ternaria `{estado.desdeCache ? <AvisoSinConexion .../> : null}`.
    const antes = contenidoIndex.slice(Math.max(0, idxUso - 80), idxUso)
    expect(antes).toMatch(/desdeCache/)
  })

  // Agujero de la pasada del revisor (R43, 43-r2): el chequeo de arriba solo
  // mira la subcadena "desdeCache" en los 80 caracteres previos, sin mirar
  // la polaridad. Estos dos cambios reales dejan ese chequeo en verde sin
  // que el aviso respete la red:
  //   `{estado.desdeCache || true ? <AvisoSinConexion .../> : null}` → el
  //     aviso queda SIEMPRE visible, incluso con red;
  //   `{!estado.desdeCache ? <AvisoSinConexion .../> : null}` → lógica
  //     invertida: aparece justo cuando SÍ hay red.
  // Por eso exige el patrón real `estado.desdeCache ?` (con espacios
  // variables, pero sin un `!` adelante ni un `||` en el medio).
  it('la condición es "estado.desdeCache ?", sin negar y sin un || que la anule', () => {
    const idxUso = contenidoIndex.indexOf('<AvisoSinConexion')
    const antes = contenidoIndex.slice(Math.max(0, idxUso - 80), idxUso)

    expect(antes).toMatch(/estado\.desdeCache\s*\?\s*$/)
    expect(antes).not.toMatch(/!\s*estado\.desdeCache/)
    expect(antes).not.toMatch(/\|\|/)
  })

  it('sigue manteniendo todo lo de 36-a: cargarDatos (useCallback) con deps []', () => {
    const idx = contenidoIndex.indexOf('const cargarDatos = useCallback(')
    expect(idx).toBeGreaterThan(-1)
  })
})

// ---------------------------------------------------------------------------
// Favoritos (app/(tabs)/favoritos.tsx)
// ---------------------------------------------------------------------------
describe('app/(tabs)/favoritos.tsx: carga con caché (detector estático)', () => {
  it('el archivo se leyó (no está vacío)', () => {
    expect(contenidoFavoritos.length).toBeGreaterThan(500)
  })

  it('importa cargarFavoritosConCache de @/lib/sin-conexion/favoritos', () => {
    expect(contenidoFavoritos).toMatch(
      /import\s*\{[^}]*\bcargarFavoritosConCache\b[^}]*\}\s*from\s*['"]@\/lib\/sin-conexion\/favoritos['"]/,
    )
  })

  it('importa leerFavoritosGuardados de @/lib/sin-conexion/favoritos', () => {
    expect(contenidoFavoritos).toMatch(
      /import\s*\{[^}]*\bleerFavoritosGuardados\b[^}]*\}\s*from\s*['"]@\/lib\/sin-conexion\/favoritos['"]/,
    )
  })

  it('importa esperarBorradoDeCache de @/lib/session', () => {
    expect(contenidoFavoritos).toMatch(
      /import\s*\{[^}]*\besperarBorradoDeCache\b[^}]*\}\s*from\s*['"]@\/lib\/session['"]/,
    )
  })

  it('leerFavoritosGuardados() solo se llama después de descartar !sinConexion (nunca se lee la caché con red)', () => {
    const idxLlamada = contenidoFavoritos.indexOf('leerFavoritosGuardados(')
    expect(idxLlamada).toBeGreaterThan(-1)

    const antes = contenidoFavoritos.slice(0, idxLlamada)
    const idxGuard = antes.lastIndexOf('if (!sinConexion)')
    expect(idxGuard).toBeGreaterThan(-1)

    // Entre el guard (que corta con `return` cuando NO hay sinConexion) y la
    // llamada, tiene que haber un `return`: lo que sigue del guard solo se
    // ejecuta con sinConexion === true.
    const entreGuardYLlamada = contenidoFavoritos.slice(idxGuard, idxLlamada)
    expect(entreGuardYLlamada).toMatch(/return/)
  })

  it('antes de leerFavoritosGuardados() se espera "await esperarBorradoDeCache()" (no se lee a mitad de un borrado de caché de otra cuenta)', () => {
    const idxLlamada = contenidoFavoritos.indexOf('leerFavoritosGuardados(')
    const antes = contenidoFavoritos.slice(0, idxLlamada)
    const idxEspera = antes.lastIndexOf('await esperarBorradoDeCache()')
    expect(idxEspera).toBeGreaterThan(-1)
  })

  it('con sesión, cargar() también espera esperarBorradoDeCache() antes de leer con cargarFavoritosConCache', () => {
    const idxCargar = contenidoFavoritos.indexOf('const cargar = useCallback(')
    expect(idxCargar).toBeGreaterThan(-1)
    const idxLlamadaConCache = contenidoFavoritos.indexOf('cargarFavoritosConCache(', idxCargar)
    expect(idxLlamadaConCache).toBeGreaterThan(idxCargar)
    const entre = contenidoFavoritos.slice(idxCargar, idxLlamadaConCache)
    expect(entre).toMatch(/await esperarBorradoDeCache\(\)/)
  })

  it('el aviso en el encabezado se dibuja bajo una condición con desdeCache, arriba de "Mi Agenda de Eventos"', () => {
    const idxUso = contenidoFavoritos.indexOf('<AvisoSinConexion')
    expect(idxUso).toBeGreaterThan(-1)
    const antes = contenidoFavoritos.slice(Math.max(0, idxUso - 80), idxUso)
    expect(antes).toMatch(/desdeCache/)

    // "Mi Agenda de Eventos" también aparece en el comentario de cabecera
    // del archivo: se busca la ocurrencia real (la del <Texto>, en el JSX)
    // a partir del uso de <AvisoSinConexion, no la primera del archivo.
    const idxTitulo = contenidoFavoritos.indexOf('Mi Agenda de Eventos', idxUso)
    expect(idxTitulo).toBeGreaterThan(idxUso)
  })

  // Mismo agujero que en index.tsx (ver el comentario de arriba): la
  // subcadena "desdeCache" no mira la polaridad. Acá la condición real es
  // `estado.tipo === 'ok' && estado.desdeCache ? (` — se exige ese patrón
  // completo, sin negar y sin un `||` en el medio.
  it('la condición es "estado.tipo === \'ok\' && estado.desdeCache ?", sin negar y sin un || que la anule', () => {
    const idxUso = contenidoFavoritos.indexOf('<AvisoSinConexion')
    const antes = contenidoFavoritos.slice(Math.max(0, idxUso - 80), idxUso)

    expect(antes).toMatch(/estado\.tipo\s*===\s*'ok'\s*&&\s*estado\.desdeCache\s*\?\s*\(?\s*$/)
    expect(antes).not.toMatch(/!\s*estado\.desdeCache/)
    expect(antes).not.toMatch(/\|\|/)
  })

  // Sigue en verde sin tocarlo (trampa 2 del encargo: el detector de
  // tests/favoritos-armar.test.ts cuenta los llamados a "cargar()" en todo
  // el archivo, sin contar su propia declaración, y espera exactamente uno).
  it('un único llamado a cargar() en todo el archivo (sin contar la declaración)', () => {
    const llamadas = contenidoFavoritos.match(/\bcargar\s*\(\s*\)/g) ?? []
    expect(llamadas.length).toBe(1)
  })

  it('ningún useEffect(: sigue usando useFocusEffect(useCallback(...)) (trampa 2 del encargo)', () => {
    expect(contenidoFavoritos).not.toMatch(/\buseEffect\s*\(/)
    expect(contenidoFavoritos).toMatch(/useFocusEffect\s*\(\s*useCallback\s*\(/)
  })
})

// ---------------------------------------------------------------------------
// decidirVistaFavoritos: copia local idéntica a la de app/(tabs)/favoritos.tsx
// (no se puede `import`ar el archivo real: ver el comentario de cabecera).
// ---------------------------------------------------------------------------
type EstadoListaDePrueba =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'ok'; eventos: unknown[]; desdeCache: { guardadoEn: Date } | null }
  | { tipo: 'invitar' }

type VistaFavoritosDePrueba = 'cargando-sesion' | 'invitar' | 'contenido'

function decidirVistaFavoritos({
  cargandoSesion,
  hayUsuario,
  sinConexion,
  estado,
}: {
  cargandoSesion: boolean
  hayUsuario: boolean
  sinConexion: boolean
  estado: EstadoListaDePrueba
}): VistaFavoritosDePrueba {
  if (cargandoSesion) return 'cargando-sesion'
  if (!hayUsuario) {
    if (!sinConexion) return 'invitar'
    if (estado.tipo === 'invitar') return 'invitar'
  }
  return 'contenido'
}

describe('decidirVistaFavoritos (copia local, fixtures en memoria): los seis casos del encargo', () => {
  const cargandoEstado: EstadoListaDePrueba = { tipo: 'cargando' }
  const okConDatos: EstadoListaDePrueba = {
    tipo: 'ok',
    eventos: [{ id: 'evento-ficticio-1' }],
    desdeCache: null,
  }
  const okDesdeCache: EstadoListaDePrueba = {
    tipo: 'ok',
    eventos: [{ id: 'evento-ficticio-2' }],
    desdeCache: { guardadoEn: new Date('2030-01-01T00:00:00-03:00') },
  }
  const errorDeServidor: EstadoListaDePrueba = { tipo: 'error', error: 'No pudimos guardar el favorito. Probá de nuevo.' }
  const invitar: EstadoListaDePrueba = { tipo: 'invitar' }

  it('caso 1, "con red": con usuario y una carga ok fresca, muestra el contenido', () => {
    const vista = decidirVistaFavoritos({ cargandoSesion: false, hayUsuario: true, sinConexion: false, estado: okConDatos })
    expect(vista).toBe('contenido')
  })

  it('caso 2, "sin red con caché": sin usuario, sinConexion y la lectura de la caché encontró algo (estado ok con desdeCache) → contenido', () => {
    const vista = decidirVistaFavoritos({ cargandoSesion: false, hayUsuario: false, sinConexion: true, estado: okDesdeCache })
    expect(vista).toBe('contenido')
  })

  it('caso 3, "sin red sin caché": sin usuario, sinConexion y la lectura de la caché no encontró nada (estado invitar) → invitar', () => {
    const vista = decidirVistaFavoritos({ cargandoSesion: false, hayUsuario: false, sinConexion: true, estado: invitar })
    expect(vista).toBe('invitar')
  })

  it('caso 4, "error que no es de red": con usuario, un error que no vino de la caché sigue mostrando el error (contenido), no invitar', () => {
    const vista = decidirVistaFavoritos({ cargandoSesion: false, hayUsuario: true, sinConexion: false, estado: errorDeServidor })
    expect(vista).toBe('contenido')
  })

  it('caso 5, "sin sesión con sinConexion" mientras se está leyendo la caché (estado todavía "cargando"): contenido, nunca un parpadeo de invitar', () => {
    const vista = decidirVistaFavoritos({ cargandoSesion: false, hayUsuario: false, sinConexion: true, estado: cargandoEstado })
    expect(vista).toBe('contenido')
  })

  it('caso 6, "sin sesión sin sinConexion": invitar siempre, aunque `estado` tuviera (por error) datos de una caché vieja', () => {
    const vista = decidirVistaFavoritos({ cargandoSesion: false, hayUsuario: false, sinConexion: false, estado: okDesdeCache })
    expect(vista).toBe('invitar')
  })

  it('cargandoSesion manda sobre todo lo demás', () => {
    const vista = decidirVistaFavoritos({ cargandoSesion: true, hayUsuario: false, sinConexion: true, estado: okDesdeCache })
    expect(vista).toBe('cargando-sesion')
  })
})

/** Índice del `}` que balancea el `{` en `idxApertura` (que ya es un `{`). Mismo criterio que `indiceCierre` de `tests/portada-atajos.test.ts`. */
function indiceCierreLlave(texto: string, idxApertura: number): number {
  let profundidad = 0
  for (let i = idxApertura; i < texto.length; i++) {
    if (texto[i] === '{') profundidad++
    else if (texto[i] === '}') {
      profundidad--
      if (profundidad === 0) return i
    }
  }
  return -1
}

/**
 * Cuerpo de `decidirVistaFavoritos` (real o copia local) a partir del índice
 * de su firma (`function decidirVistaFavoritos(` o
 * `export function decidirVistaFavoritos(`). El cuerpo arranca en la '{' que
 * sigue al tipo de retorno, no en la de la desestructuración del parámetro
 * — en el código real el tipo es "VistaFavoritos" y en la copia local es
 * "VistaFavoritosDePrueba", pero como "VistaFavoritosDePrueba" EMPIEZA con
 * "VistaFavoritos", el mismo marcador `'): VistaFavoritos'` encuentra el
 * lugar correcto en los dos casos.
 */
function cuerpoDeDecidirVistaFavoritos(codigo: string, idxFirma: number): string {
  const idxAperturaTipoRetorno = codigo.indexOf('): VistaFavoritos', idxFirma)
  if (idxAperturaTipoRetorno < 0) return ''
  const idxAperturaCuerpo = codigo.indexOf('{', idxAperturaTipoRetorno)
  if (idxAperturaCuerpo < 0) return ''
  const idxCierreCuerpo = indiceCierreLlave(codigo, idxAperturaCuerpo)
  if (idxCierreCuerpo < 0) return ''
  return codigo.slice(idxAperturaCuerpo, idxCierreCuerpo + 1)
}

/** Colapsa espacios en blanco y saca comentarios, para comparar dos cuerpos de función sin que importe el formato. */
function normalizarCuerpo(cuerpo: string): string {
  const sinComentarios = cuerpo.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  return sinComentarios.replace(/\s+/g, ' ').trim()
}

describe('decidirVistaFavoritos: la copia local está en sincro con app/(tabs)/favoritos.tsx', () => {
  it('existe, está exportada, y tiene la misma estructura de condiciones que la copia de arriba', () => {
    const idxFirma = contenidoFavoritos.indexOf('export function decidirVistaFavoritos(')
    expect(idxFirma).toBeGreaterThan(-1)

    // El cuerpo de la función empieza en la '{' que sigue a "): VistaFavoritos"
    // (el tipo de retorno) — no en la primera '{' de la firma (esa abre el
    // objeto desestructurado del parámetro, que se cierra mucho antes).
    const idxAperturaTipoRetorno = contenidoFavoritos.indexOf('): VistaFavoritos', idxFirma)
    expect(idxAperturaTipoRetorno).toBeGreaterThan(idxFirma)
    const idxAperturaCuerpo = contenidoFavoritos.indexOf('{', idxAperturaTipoRetorno)
    expect(idxAperturaCuerpo).toBeGreaterThan(idxAperturaTipoRetorno)

    const idxCierreCuerpo = indiceCierreLlave(contenidoFavoritos, idxAperturaCuerpo)
    expect(idxCierreCuerpo).toBeGreaterThan(idxAperturaCuerpo)

    const cuerpo = contenidoFavoritos.slice(idxAperturaCuerpo, idxCierreCuerpo + 1)

    expect(cuerpo).toMatch(/if\s*\(\s*cargandoSesion\s*\)\s*return\s*'cargando-sesion'/)
    expect(cuerpo).toMatch(/if\s*\(\s*!hayUsuario\s*\)\s*\{/)
    expect(cuerpo).toMatch(/if\s*\(\s*!sinConexion\s*\)\s*return\s*'invitar'/)
    expect(cuerpo).toMatch(/estado\.tipo\s*===\s*'invitar'/)
    expect(cuerpo).toMatch(/return\s*'contenido'/)
  })

  // Vuelta 1, arreglo 1: las cinco regex de arriba son evadibles — si alguien
  // agrega una condición nueva en el medio del cuerpo real (por ejemplo,
  // `if (estado.tipo === 'error') return 'invitar'` antes del
  // `return 'contenido'`), las cinco siguen matcheando y la copia local
  // queda desfasada sin que nada falle. Esta comparación es del cuerpo
  // ENTERO (normalizado), así que cualquier divergencia lo rompe.
  it('el cuerpo completo (normalizado) de la copia local es idéntico, carácter a carácter, al de la función real', () => {
    const idxFirmaReal = contenidoFavoritos.indexOf('export function decidirVistaFavoritos(')
    expect(idxFirmaReal).toBeGreaterThan(-1)
    const cuerpoReal = normalizarCuerpo(cuerpoDeDecidirVistaFavoritos(contenidoFavoritos, idxFirmaReal))

    // No "export function" (esa es la real, de arriba): la copia local, acá
    // en este mismo archivo de test.
    const idxFirmaLocal = contenidoTest.indexOf('function decidirVistaFavoritos(')
    expect(idxFirmaLocal).toBeGreaterThan(-1)
    const cuerpoLocal = normalizarCuerpo(cuerpoDeDecidirVistaFavoritos(contenidoTest, idxFirmaLocal))

    // Si la extracción fallara para alguno de los dos y devolviera '', el
    // toBe de abajo pasaría comparando '' contra '' sin decir nada: el mismo
    // agujero que se viene a tapar. Por eso esta aserción va antes.
    expect(cuerpoReal.length).toBeGreaterThan(0)
    expect(cuerpoLocal.length).toBeGreaterThan(0)

    expect(cuerpoLocal).toBe(cuerpoReal)
  })
})

// ---------------------------------------------------------------------------
// Vuelta 1, arreglo 2: sin sesión y mostrando la caché (sinConexion), el
// pull-to-refresh tiene que hacer algo (releer la caché), no ser un gesto
// muerto. Detector estático (no se puede montar el SectionList/RefreshControl
// sin @testing-library/react-native).
// ---------------------------------------------------------------------------
describe('refrescar (app/(tabs)/favoritos.tsx): sin sesión y con sinConexion, el pull-to-refresh relee la caché', () => {
  const idxRefrescar = contenidoFavoritos.indexOf('const refrescar = useCallback(')

  it('existe la declaración de refrescar', () => {
    expect(idxRefrescar).toBeGreaterThan(-1)
  })

  it('tiene una rama "if (!userId)" con "if (!sinConexion) return" adentro (sin sinConexion, sigue volviendo de una)', () => {
    const idxGuardUserId = contenidoFavoritos.indexOf('if (!userId)', idxRefrescar)
    expect(idxGuardUserId).toBeGreaterThan(idxRefrescar)

    const idxGuardSinConexion = contenidoFavoritos.indexOf('if (!sinConexion) return', idxGuardUserId)
    expect(idxGuardSinConexion).toBeGreaterThan(idxGuardUserId)
  })

  it('después del guard de sinConexion, llama a leerFavoritosGuardados() dentro de un try con un finally que apaga setRefrescando(false)', () => {
    const idxGuardSinConexion = contenidoFavoritos.indexOf('if (!sinConexion) return', idxRefrescar)
    expect(idxGuardSinConexion).toBeGreaterThan(-1)

    const idxLlamada = contenidoFavoritos.indexOf('leerFavoritosGuardados(', idxGuardSinConexion)
    expect(idxLlamada).toBeGreaterThan(idxGuardSinConexion)

    const idxTry = contenidoFavoritos.lastIndexOf('try {', idxLlamada)
    expect(idxTry).toBeGreaterThan(idxGuardSinConexion)

    // El finally que sigue al try tiene que apagar refrescando: si
    // leerFavoritosGuardados tirara, el spinner no puede quedar girando
    // (misma familia de bloqueante que R41/R42).
    const idxCierreTry = contenidoFavoritos.indexOf('}', idxLlamada)
    const idxFinally = contenidoFavoritos.indexOf('finally', idxCierreTry)
    expect(idxFinally).toBeGreaterThan(idxCierreTry)

    const idxSetRefrescandoFalse = contenidoFavoritos.indexOf('setRefrescando(false)', idxFinally)
    // Tiene que estar cerca (dentro del propio bloque finally, no en otra
    // rama más abajo del archivo).
    expect(idxSetRefrescandoFalse).toBeGreaterThan(idxFinally)
    expect(idxSetRefrescandoFalse - idxFinally).toBeLessThan(300)
  })

  it('no agrega un useEffect ni un segundo llamado literal a cargar() (trampa del encargo)', () => {
    expect(contenidoFavoritos).not.toMatch(/\buseEffect\s*\(/)
    const llamadas = contenidoFavoritos.match(/\bcargar\s*\(\s*\)/g) ?? []
    expect(llamadas.length).toBe(1)
  })
})
