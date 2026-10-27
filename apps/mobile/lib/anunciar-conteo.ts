// A8 (nube Q1, QPS-339): los conteos que cambian por un filtro («N eventos»,
// «N resultados…», el texto del vacío) se anuncian a mano con
// `AccessibilityInfo`, en Android y en iOS, desde un solo lugar. Este archivo
// es la parte pura (sin React ni React Native, para probarla con Vitest en
// `tests/anunciar-conteos.test.ts`): QUÉ se anuncia y CUÁNDO. El hook delgado
// que la conecta con el lector de pantalla es `useAnunciarConteo`
// (`lib/anunciar-conteo-hook.ts`).
//
// Por qué a mano y no con `accessibilityLiveRegion` (lo que había desde la
// R69, 69-b, QPS-354: la portada anunciaba con `announceForAccessibility` solo
// la primera aparición o el cambio de nodo, y en Android dejaba los cambios
// siguientes a la live region):
//   1. En Android la live region es poco confiable: TalkBack a veces no la lee
//      si el foco está en el chip que se acaba de tocar, y nunca anuncia el
//      MONTAJE de un nodo nuevo (la lista de resultados de Buscar que aparece
//      al prender un filtro, el vacío que reemplaza al conteo).
//   2. Si el número no cambia (Música con 3 eventos, todos gratis: al prender
//      «Gratis» sigue «3 eventos»), el texto del nodo es el mismo y la live
//      region no dice nada, aunque el resultado sea otro.
//   3. Salir del modo grilla de la portada no tiene ningún nodo que anunciar.
// ESTRATEGIA (una sola, igual en todas las pantallas): cada pantalla describe
// su resultado con un `EstadoAnunciable` y el hook lo anuncia con
// `announceForAccessibility` cuando corresponde; esos nodos (conteos y vacíos)
// ya NO llevan `accessibilityLiveRegion`, para que nada se lea dos veces. Los
// detectores de `tests/anunciar-conteos.test.ts` lo exigen.
//
// Reglas de cuándo (`decidirAnuncio` + `demoraDelAnuncio`):
//   - El montaje no se anuncia: el primer estado que ve el hook queda como
//     referencia y no se dice. Mientras la pantalla carga (o muestra un error)
//     el estado es `null` = «no hay nada»; si después aparece un conteo, se
//     anuncia (es lo que provocó el usuario: llegar a Buscar con `?categoria=`
//     desde «Ver todos», o «Reintentar» con un filtro prendido). Pasar de
//     «nada» a un estado sin conteo (la portada normal, «Explorar por
//     categoría») no dice nada.
//   - Aparición (no había conteo y ahora hay): título + conteo.
//   - Otro resultado (cambió un filtro: `clave`, o el texto tipeado): título +
//     conteo, AUNQUE el número y el texto sean los mismos que antes (punto 2).
//   - Mismo resultado y cambió solo el número (pull-to-refresh trajo otro
//     evento): el conteo solo.
//   - Mismo resultado y mismo texto: nada (un render más no es un cambio).
//   - Desaparición (había conteo y ya no): `alSalir` si la pantalla lo da
//     («Todos los eventos · Hoy» en la portada, «Explorar por categoría» en
//     Buscar); si no, nada. Pasar a cargando no es desaparición: no dice nada.
//   - Texto tipeado (Buscar, Cines): NO en cada tecla. Si lo único que cambió
//     es el texto, el anuncio espera `DEMORA_TEXTO_MS` sin teclas nuevas (cada
//     tecla reinicia la espera) y se decide contra lo último anunciado: tipear
//     y borrar lo mismo no dice nada. Si el campo queda vacío (el botón
//     «Limpiar búsqueda» o borrar todo) se anuncia al toque. Los toques
//     (chips, pills, filtros, salidas del vacío) se anuncian al toque y
//     cancelan la espera pendiente.
//
// Textos (`componerAnuncio`): «título: conteo» («Música gratis, Hoy: 3
// eventos») cuando hay un título que desambigua; el conteo solo cuando el
// conteo ya lo dice todo (Buscar sin texto: «3 eventos gratis en Música, hoy»)
// o es el texto de un vacío (que ya nombra los filtros). El « · » de los
// títulos visibles se dice como una coma (`textoHablado`): es una pausa, no
// algo que el lector tenga que nombrar.
//
// Pantallas (decisión de A8, punto 5 del ticket): entran la portada (modo
// grilla), Buscar (resultados y su vacío) y Cines (buscador por título: no
// muestra conteo, pero su vacío y la lista filtrada cambian al tipear, así que
// se anuncia «N películas para "x"» o el vacío, con la misma demora). NO
// entran Favoritos (no tiene filtros: las secciones con «(N)» no cambian por
// un toque del usuario) ni el Radar (su buscador es un autocompletar dentro de
// un formulario, sin conteo; «No se encontraron coincidencias.» queda para un
// ticket aparte si hace falta).
import type { Atajo } from '@qps/core/home/atajos'
import { textoResultadosBuscar, textoSinResultadosBuscar, type FiltrosTextoBuscar } from '@/lib/buscar-filtros'
import { SLUG_INFANTIL } from '@/lib/para-chicos'
import { ETIQUETA_ATAJO, type TipoAnuncioGrilla } from '@/lib/portada-gratis'

/** Cuánto se espera sin teclas nuevas antes de anunciar el resultado de lo tipeado. */
export const DEMORA_TEXTO_MS = 700

/** Lo que se anuncia al volver de los resultados de Buscar a la grilla de categorías. */
export const ANUNCIO_EXPLORAR = 'Explorar por categoría'

/**
 * El resultado que muestra una pantalla, tal como se anuncia. `null` (en lugar
 * de un `EstadoAnunciable`) = la pantalla todavía no tiene nada (cargando o error).
 */
export interface EstadoAnunciable {
  /** Identidad del resultado: los filtros elegidos por toque (sin el texto tipeado). */
  clave: string
  /** El texto tipeado en un buscador, aparte de `clave`: sus cambios se anuncian con demora. */
  texto?: string
  /** Lo que identifica el resultado («Música gratis · Hoy»); `null` si el conteo ya lo dice. */
  titulo: string | null
  /** La línea que se ve (el conteo o el texto del vacío); `null` = no hay conteo en pantalla. */
  conteo: string | null
  /** Qué decir cuando el conteo desaparece (salida del modo grilla); `null` = nada. */
  alSalir?: string | null
}

/** El « · » de los títulos visibles, dicho como pausa. */
export function textoHablado(texto: string): string {
  return texto.replace(/\s+·\s+/g, ', ')
}

/** «título: conteo», o el conteo solo si no hay título. */
export function componerAnuncio(titulo: string | null | undefined, conteo: string): string {
  return textoHablado(titulo ? `${titulo}: ${conteo}` : conteo)
}

function mismoResultado(a: EstadoAnunciable, b: EstadoAnunciable): boolean {
  return a.clave === b.clave && (a.texto ?? '') === (b.texto ?? '')
}

/**
 * QUÉ se anuncia al pasar de `anterior` (lo último anunciado o asentado) a
 * `actual`: el texto, o `null` si no hay nada que decir. El montaje no pasa
 * por acá (lo resuelve `crearAnunciadorDeConteo`).
 */
export function decidirAnuncio(anterior: EstadoAnunciable | null, actual: EstadoAnunciable | null): string | null {
  // Cargando o error: no es un cambio que anunciar.
  if (actual === null) return null

  if (actual.conteo === null) {
    // Desaparición: había conteo y ya no (salida del modo grilla).
    if (anterior !== null && anterior.conteo !== null) return actual.alSalir ? textoHablado(actual.alSalir) : null
    return null
  }

  // Aparición: antes no había nada (o no había conteo).
  if (anterior === null || anterior.conteo === null) return componerAnuncio(actual.titulo, actual.conteo)

  // Otro resultado (cambió un filtro o el texto), aunque el número sea el mismo.
  if (!mismoResultado(anterior, actual)) return componerAnuncio(actual.titulo, actual.conteo)

  // Mismo resultado: si cambió el título, título + conteo; si solo el número, el conteo.
  if (anterior.titulo !== actual.titulo) return componerAnuncio(actual.titulo, actual.conteo)
  if (anterior.conteo !== actual.conteo) return textoHablado(actual.conteo)
  return null
}

/**
 * CUÁNDO: 0 = al toque; `DEMORA_TEXTO_MS` si lo único que cambió es el texto
 * tipeado y el campo no quedó vacío.
 */
export function demoraDelAnuncio(anterior: EstadoAnunciable | null, actual: EstadoAnunciable | null): number {
  if (anterior === null || actual === null) return 0
  if (anterior.clave !== actual.clave) return 0
  const antes = anterior.texto ?? ''
  const ahora = actual.texto ?? ''
  if (antes === ahora) return 0
  if (ahora.trim() === '') return 0
  return DEMORA_TEXTO_MS
}

/** El reloj que usa el anunciador (el real en la app, el falso de Vitest en los tests). */
export interface RelojAnuncio {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void
}

export interface AnunciadorDeConteo {
  /** Cada estado nuevo de la pantalla (el primero es el del montaje y no se anuncia). */
  observar: (actual: EstadoAnunciable | null) => void
  /** Cancela el anuncio que está esperando (al desmontar o antes de cada cambio). */
  cancelar: () => void
}

/**
 * El que lleva la cuenta entre renders: lo último asentado (anunciado o
 * descartado) y el anuncio que espera por el texto tipeado. Puro salvo por el
 * `reloj` y el `anunciar` que recibe; el hook le pasa los reales.
 */
export function crearAnunciadorDeConteo(deps: { anunciar: (texto: string) => void; reloj: RelojAnuncio }): AnunciadorDeConteo {
  let iniciado = false
  let asentado: EstadoAnunciable | null = null
  let pendiente: ReturnType<typeof setTimeout> | null = null

  const cancelar = () => {
    if (pendiente !== null) {
      deps.reloj.clearTimeout(pendiente)
      pendiente = null
    }
  }

  const asentar = (actual: EstadoAnunciable | null) => {
    const texto = decidirAnuncio(asentado, actual)
    asentado = actual
    if (texto) deps.anunciar(texto)
  }

  return {
    cancelar,
    observar(actual) {
      cancelar()
      if (!iniciado) {
        // El montaje: queda como referencia, no se anuncia.
        iniciado = true
        asentado = actual
        return
      }
      const demora = demoraDelAnuncio(asentado, actual)
      if (demora === 0) {
        asentar(actual)
        return
      }
      pendiente = deps.reloj.setTimeout(() => {
        pendiente = null
        asentar(actual)
      }, demora)
    },
  }
}

// ---------------------------------------------------------------------------
// Lo que anuncia cada pantalla
// ---------------------------------------------------------------------------

/**
 * Portada (`app/(tabs)/index.tsx`). `anuncio` es `anuncioDeLaGrilla` (el
 * conteo si hay resultados, el texto del vacío si no; `null` fuera del modo
 * grilla). Con resultados va el título de la grilla («Música gratis · Hoy:
 * 3 eventos»); con el vacío, solo su texto (ya nombra los filtros). Fuera del
 * modo grilla no hay conteo, y al salir se dice «Todos los eventos · Hoy».
 */
export function estadoAnunciablePortada(p: {
  atajo: Atajo
  categoria: string | null
  gratis: boolean
  paraChicos: boolean
  tituloGrilla: string
  anuncio: { texto: string; tipo: TipoAnuncioGrilla } | null
}): EstadoAnunciable {
  return {
    clave: `${p.atajo}|${p.categoria ?? ''}|${p.gratis ? 'gratis' : ''}|${p.paraChicos ? 'chicos' : ''}`,
    titulo: p.anuncio?.tipo === 'conteo' ? p.tituloGrilla : null,
    conteo: p.anuncio?.texto ?? null,
    alSalir: `Todos los eventos · ${ETIQUETA_ATAJO[p.atajo]}`,
  }
}

/**
 * Buscar (`app/(tabs)/buscar.tsx`). El conteo visible ya nombra fecha,
 * categoría, «gratis» y «para chicos» cuando no hay texto; con texto no nombra
 * los dos chips de filtro (A3: el chip prendido está a la vista), así que el
 * anuncio los antepone como título («Gratis: 3 resultados para "rock"») para
 * que prender o apagar uno con el mismo número diga algo distinto. Con 0
 * resultados se anuncia el texto del vacío (el que se lee en el centro), no
 * «0 eventos». Al volver a «Explorar por categoría», eso.
 */
export function estadoAnunciableBuscar(p: { mostrarResultados: boolean; cantidad: number; filtros: FiltrosTextoBuscar }): EstadoAnunciable {
  const f = p.filtros
  const conteo = !p.mostrarResultados
    ? null
    : p.cantidad > 0
      ? textoResultadosBuscar(p.cantidad, f)
      : textoSinResultadosBuscar(f)
  return {
    clave: `${f.atajo ?? ''}|${f.categoria ?? ''}|${f.soloGratis ? 'gratis' : ''}|${f.paraChicos ? 'chicos' : ''}`,
    texto: f.texto,
    titulo: f.texto ? filtrosNoNombrados(f) : null,
    conteo,
    alSalir: ANUNCIO_EXPLORAR,
  }
}

/** Con texto, los chips de filtro que el conteo visible no nombra («Gratis y para chicos»). */
function filtrosNoNombrados(f: FiltrosTextoBuscar): string | null {
  const chicos = f.paraChicos && f.categoria !== SLUG_INFANTIL
  if (f.soloGratis && chicos) return 'Gratis y para chicos'
  if (f.soloGratis) return 'Gratis'
  if (chicos) return 'Para chicos'
  return null
}

/** «1 película» / «N películas». */
export function conteoPeliculas(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'película' : 'películas'}`
}

/**
 * Cines (`app/cines.tsx`): no muestra conteo, pero el buscador filtra la
 * lista. Con texto: «2 películas para "dune"» o el vacío visible
 * (`textoVacio`); sin texto no hay nada que anunciar, y al limpiar se dice
 * cuántas hay en cartel.
 */
export function estadoAnunciableCines(p: { busqueda: string; cantidad: number; total: number; textoVacio: string }): EstadoAnunciable {
  return {
    clave: '',
    texto: p.busqueda,
    titulo: null,
    conteo: !p.busqueda ? null : p.cantidad > 0 ? `${conteoPeliculas(p.cantidad)} para "${p.busqueda}"` : p.textoVacio,
    alSalir: p.total > 0 ? `${conteoPeliculas(p.total)} en cartel` : null,
  }
}
