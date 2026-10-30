// A8 (nube Q1, QPS-339): los conteos que cambian por un filtro («N eventos»,
// «N resultados…», el texto del vacío) se anuncian a mano, en Android y en
// iOS, desde un solo lugar. Este archivo es la parte pura (sin React ni React
// Native, para probarla con Vitest en `tests/anunciar-conteos.test.ts`): QUÉ
// se anuncia y CUÁNDO. El hook delgado que la conecta con el lector de
// pantalla es `useAnunciarConteo` (`lib/anunciar-conteo-hook.ts`), que habla a
// través del envoltorio único `anunciar` (`lib/anunciar.ts`).
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
// su resultado con un `EstadoAnunciable` y el hook lo anuncia cuando
// corresponde; ESOS nodos (el conteo y los vacíos que anuncia el hook) ya NO
// llevan `accessibilityLiveRegion`, para que nada se lea dos veces. Otras
// live regions de la misma pantalla (p. ej. `AvisoSinConexion`, A6) no se
// tocan: la prohibición de los detectores es por nodo, no por archivo.
//
// Reglas de cuándo (`decidirAnuncio`, `esperaDelTexto`, `demoraDelToque`):
//   - El montaje no se anuncia: el primer estado que ve el hook queda como
//     referencia y no se dice. Mientras la pantalla carga (o muestra un error)
//     el estado es `null` = «no hay nada»; si después aparece un conteo, se
//     anuncia (es lo que provocó el usuario: llegar a Buscar con `?categoria=`
//     desde «Ver todos», o «Reintentar» con un filtro prendido). Pasar de
//     «nada» a un estado sin conteo (la portada normal, «Explorar por
//     categoría») no dice nada.
//   - Aparición (no había conteo y ahora hay) y otro resultado (cambió un
//     filtro, `clave`, o el texto): conteo + detalle, AUNQUE el número y el
//     texto sean los mismos que antes (punto 2).
//   - Mismo resultado y cambió solo el número (pull-to-refresh trajo otro
//     evento): el conteo solo.
//   - Mismo resultado y mismo texto: nada (un render más no es un cambio).
//   - Desaparición (había conteo y ya no): `alSalir` si la pantalla lo da
//     («Sin filtros: todos los eventos de hoy», «Sin filtros: explorar por
//     categoría»); si no, nada. Pasar a cargando no es desaparición.
//   - Texto tipeado (Buscar, Cines): NO en cada tecla. Si lo único que cambió
//     es el texto, el anuncio espera `DEMORA_TEXTO_MS` (1500 ms: con el
//     teclado de TalkBack cada letra lleva 1–2 s) sin teclas nuevas, y se
//     decide contra lo último asentado: tipear y borrar lo mismo no dice nada.
//     Si el campo queda vacío (`''`: «Limpiar búsqueda» o borrar todo) se
//     trata como un toque.
//   - Texto que llega por un toque (`toque`, un nonce que la pantalla cambia
//     al enviar con la tecla del teclado o, desde A5, al tocar una búsqueda
//     reciente): sin la espera del texto. Si lo que resulta ya se anunció
//     (enviar después de que la espera terminó), no se repite: sin doble anuncio.
//   - Lo que no es texto tipeado se trata como un toque (chips, pills, filtros,
//     salidas del vacío): en iOS al toque (0 ms: `queue: true` lo pone detrás
//     de lo que VoiceOver esté diciendo); en Android, que ignora `queue`, con
//     `DEMORA_TOQUE_ANDROID_MS` (400 ms) para no pisarse con el «Seleccionado»
//     de TalkBack ni con la relectura del nodo que recibe el foco cuando el
//     botón tocado desaparece (salidas de los vacíos, tiles de «Explorar», el
//     «Limpiar» de Cines). Un toque nuevo dentro de esa espera reemplaza al
//     anterior: se dice solo el último resultado.
//   - Al perder el foco la pestaña (Buscar y Cines siguen montadas debajo) se
//     cancela lo pendiente y se asienta sin anunciar (`asentarEnSilencio`): al
//     volver, se compara contra lo que había al irse.
//
// Textos (`componerAnuncio`, `textoHablado`): el conteo primero y después lo
// que desambigua («3 eventos, Música gratis, Hoy»; en Buscar con texto, los
// chips que el conteo visible no nombra, con la palabra del chip: «3
// resultados para rock, solo gratis»). Los vacíos de la portada van solos (ya
// nombran los filtros). Lo hablado va sin comillas y el « · » de los títulos
// visibles se dice como una coma: son pausas, no algo que el lector tenga que
// nombrar.
//
// Pantallas (decisión de A8, punto 5 del ticket): entran la portada (modo
// grilla), Buscar (resultados y su vacío) y Cines (buscador por título: no
// muestra conteo, pero su vacío y la lista filtrada cambian al tipear, así que
// se anuncia «2 películas para dune» o «Ninguna película para dune»; una línea
// de conteo visible en Cines quedó descartada en la revisión). NO entran
// Favoritos (no tiene filtros: las secciones con «(N)» no cambian por un toque
// del usuario) ni el Radar (su buscador es un autocompletar dentro de un
// formulario, sin conteo; «No se encontraron coincidencias.» queda para un
// ticket aparte si hace falta).
import type { Atajo } from '@qps/core/home/atajos'
import { textoResultadosBuscar, textoSinResultadosBuscar, type FiltrosTextoBuscar } from '@/lib/buscar-filtros'
import { SLUG_INFANTIL } from '@/lib/para-chicos'
import type { TipoAnuncioGrilla } from '@/lib/portada-gratis'

/** Cuánto se espera sin teclas nuevas antes de anunciar el resultado de lo tipeado. */
export const DEMORA_TEXTO_MS = 1500

/** En Android (sin `queue`), cuánto espera un anuncio que viene de un toque. */
export const DEMORA_TOQUE_ANDROID_MS = 400

/** Lo que se anuncia al volver de los resultados de Buscar a la grilla de categorías. */
export const ANUNCIO_EXPLORAR = 'Sin filtros: explorar por categoría'

/** Cómo termina la salida de la portada según la fecha («… de hoy», «… del finde»). */
export const SALIDA_PORTADA_ATAJO: Record<Atajo, string> = {
  hoy: 'de hoy',
  'esta-noche': 'de esta noche',
  finde: 'del finde',
  semana: 'de esta semana',
}

/**
 * El resultado que muestra una pantalla, tal como se anuncia. `null` (en lugar
 * de un `EstadoAnunciable`) = la pantalla todavía no tiene nada (cargando o error).
 */
export interface EstadoAnunciable {
  /** Identidad del resultado: los filtros elegidos por toque (sin el texto tipeado). */
  clave: string
  /** El texto tipeado en un buscador, aparte de `clave`: sus cambios se anuncian con espera. */
  texto?: string
  /**
   * Nonce que la pantalla cambia cuando el texto llega por un toque (enviar
   * con el teclado; tocar una búsqueda reciente, A5): ese cambio no espera.
   */
  toque?: string | number
  /** Lo que desambigua el resultado, después del conteo («Música gratis · Hoy»); `null` si no hace falta. */
  titulo: string | null
  /** La línea que se anuncia (el conteo o el texto del vacío); `null` = no hay conteo en pantalla. */
  conteo: string | null
  /** Qué decir cuando el conteo desaparece (salida del modo grilla); `null` = nada. */
  alSalir?: string | null
}

/** Lo hablado: sin comillas, y el « · » de los títulos visibles como una coma. */
export function textoHablado(texto: string): string {
  return texto
    .replace(/["“”«»]/g, '')
    .replace(/\s+·\s+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** «conteo, detalle», o el conteo solo si no hay detalle. */
export function componerAnuncio(conteo: string, titulo: string | null | undefined): string {
  return textoHablado(titulo ? `${conteo}, ${titulo}` : conteo)
}

function mismoResultado(a: EstadoAnunciable, b: EstadoAnunciable): boolean {
  return a.clave === b.clave && (a.texto ?? '') === (b.texto ?? '')
}

/**
 * QUÉ se anuncia al pasar de `anterior` (lo último asentado) a `actual`: el
 * texto, o `null` si no hay nada que decir. El montaje no pasa por acá (lo
 * resuelve `crearAnunciadorDeConteo`). `toque` no cuenta: solo cambia cuándo.
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
  if (anterior === null || anterior.conteo === null) return componerAnuncio(actual.conteo, actual.titulo)

  // Otro resultado (cambió un filtro o el texto), aunque el número sea el mismo.
  if (!mismoResultado(anterior, actual)) return componerAnuncio(actual.conteo, actual.titulo)

  // Mismo resultado: si cambió el detalle, conteo + detalle; si solo el número, el conteo.
  if (anterior.titulo !== actual.titulo) return componerAnuncio(actual.conteo, actual.titulo)
  if (anterior.conteo !== actual.conteo) return textoHablado(actual.conteo)
  return null
}

/**
 * Si el cambio es SOLO texto tipeado (misma `clave`, mismo `toque`, otro
 * `texto`) y el campo no quedó vacío (`''`; las pantallas normalizan con
 * `trim()` antes): entonces se espera `DEMORA_TEXTO_MS`.
 */
export function esperaDelTexto(anterior: EstadoAnunciable | null, actual: EstadoAnunciable | null): boolean {
  if (anterior === null || actual === null) return false
  if (anterior.clave !== actual.clave) return false
  if ((anterior.toque ?? null) !== (actual.toque ?? null)) return false
  const antes = anterior.texto ?? ''
  const ahora = actual.texto ?? ''
  return antes !== ahora && ahora !== ''
}

/** Lo que espera un anuncio que viene de un toque: 0 en iOS (`queue` sí anda), 400 ms en Android. */
export function demoraDelToque(plataforma: string): number {
  return plataforma === 'android' ? DEMORA_TOQUE_ANDROID_MS : 0
}

/** CUÁNDO, en ms: la espera del texto tipeado, o la del toque según la plataforma. */
export function demoraDelAnuncio(anterior: EstadoAnunciable | null, actual: EstadoAnunciable | null, plataforma: string): number {
  return esperaDelTexto(anterior, actual) ? DEMORA_TEXTO_MS : demoraDelToque(plataforma)
}

/** El reloj que usa el anunciador (el real en la app, el falso de Vitest en los tests). */
export interface RelojAnuncio {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void
}

export interface AnunciadorDeConteo {
  /** Cada estado nuevo de la pantalla en foco (el primero es el del montaje y no se anuncia). */
  observar: (actual: EstadoAnunciable | null) => void
  /** Cancela lo pendiente y toma `actual` como referencia sin anunciar (la pestaña perdió el foco). */
  asentarEnSilencio: (actual: EstadoAnunciable | null) => void
  /** Cancela el anuncio que está esperando (al desmontar). */
  cancelar: () => void
}

/**
 * El que lleva la cuenta entre renders: lo último asentado (anunciado o
 * descartado) y el anuncio pendiente (la espera del texto o la del toque en
 * Android). Puro salvo por el `reloj` y el `anunciar` que recibe; el hook le
 * pasa los reales y la plataforma de React Native (`OS`).
 */
export function crearAnunciadorDeConteo(deps: {
  anunciar: (texto: string) => void
  reloj: RelojAnuncio
  plataforma: string
}): AnunciadorDeConteo {
  let iniciado = false
  let asentado: EstadoAnunciable | null = null
  let pendiente: ReturnType<typeof setTimeout> | null = null
  let tipoPendiente: 'texto' | 'toque' | null = null
  // El anuncio de un toque que todavía no se dijo (Android, 400 ms). Si una
  // tecla pisa su timer, no se pierde: lo dice la espera del texto cuando
  // termina sin nada propio que decir (revisión de Gemini del #125, hallazgo 2).
  let toqueSinDecir: string | null = null

  const pararTimer = () => {
    if (pendiente !== null) deps.reloj.clearTimeout(pendiente)
    pendiente = null
    tipoPendiente = null
  }

  const cancelar = () => {
    pararTimer()
    toqueSinDecir = null
  }

  const programar = (tipo: 'texto' | 'toque', ms: number, fn: () => void) => {
    pararTimer()
    tipoPendiente = tipo
    pendiente = deps.reloj.setTimeout(() => {
      pendiente = null
      tipoPendiente = null
      fn()
    }, ms)
  }

  const decir = (texto: string) => {
    const demora = demoraDelToque(deps.plataforma)
    if (demora === 0) {
      cancelar()
      deps.anunciar(texto)
    } else {
      toqueSinDecir = texto
      programar('toque', demora, () => {
        toqueSinDecir = null
        deps.anunciar(texto)
      })
    }
  }

  return {
    cancelar,
    asentarEnSilencio(actual) {
      cancelar()
      iniciado = true
      asentado = actual
    },
    observar(actual) {
      if (!iniciado) {
        // El montaje: queda como referencia, no se anuncia.
        iniciado = true
        asentado = actual
        return
      }
      if (esperaDelTexto(asentado, actual)) {
        // Cada tecla reinicia la espera; al terminar se decide contra lo asentado.
        programar('texto', DEMORA_TEXTO_MS, () => {
          const texto = decidirAnuncio(asentado, actual) ?? toqueSinDecir
          asentado = actual
          toqueSinDecir = null
          if (texto) deps.anunciar(texto)
        })
        return
      }
      const texto = decidirAnuncio(asentado, actual)
      asentado = actual
      if (texto) {
        decir(texto)
        return
      }
      // Nada nuevo que decir: una espera del texto ya no corresponde (se volvió
      // a lo asentado); un anuncio de toque pendiente sigue en pie.
      if (tipoPendiente === 'texto') {
        pararTimer()
        // Si la tecla había pisado un toque sin decir, se dice ahora.
        if (toqueSinDecir !== null) decir(toqueSinDecir)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Lo que anuncia cada pantalla
// ---------------------------------------------------------------------------

/**
 * Portada (`app/(tabs)/index.tsx`). `anuncio` es `anuncioDeLaGrilla` (el
 * conteo si hay resultados, el texto del vacío si no; `null` fuera del modo
 * grilla). Con resultados va el título de la grilla después del conteo («3
 * eventos, Música gratis, Hoy»); con el vacío, solo su texto (ya nombra los
 * filtros). Fuera del modo grilla no hay conteo, y al salir se dice «Sin
 * filtros: todos los eventos de hoy».
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
    alSalir: `Sin filtros: todos los eventos ${SALIDA_PORTADA_ATAJO[p.atajo]}`,
  }
}

/**
 * Buscar (`app/(tabs)/buscar.tsx`). El texto entra normalizado con `trim()`.
 * El conteo visible ya nombra fecha, categoría, «gratis» y «para chicos»
 * cuando no hay texto; con texto no nombra los dos chips de filtro (A3: el
 * chip prendido está a la vista), así que el anuncio los suma al final con la
 * palabra del chip («3 resultados para rock, solo gratis»), para que prender o
 * apagar uno con el mismo número diga algo distinto. Con 0 resultados se
 * anuncia el texto del vacío (el que se lee en el centro), no «0 eventos». Al
 * volver a «Explorar por categoria», «Sin filtros: explorar por categoría».
 * `v` (el nonce de «Ver todos» de la portada) entra en la clave: volver con el
 * mismo `?categoria=` y otra `v` vuelve a anunciar.
 */
export function estadoAnunciableBuscar(p: {
  mostrarResultados: boolean
  cantidad: number
  filtros: FiltrosTextoBuscar
  v?: string | null
  toque?: number
}): EstadoAnunciable {
  const f: FiltrosTextoBuscar = { ...p.filtros, texto: p.filtros.texto.trim() }
  const conteo = !p.mostrarResultados ? null : p.cantidad > 0 ? textoResultadosBuscar(p.cantidad, f) : textoSinResultadosBuscar(f)
  return {
    clave: `${f.atajo ?? ''}|${f.categoria ?? ''}|${f.soloGratis ? 'gratis' : ''}|${f.paraChicos ? 'chicos' : ''}|${p.v ?? ''}`,
    texto: f.texto,
    toque: p.toque,
    titulo: f.texto ? chipsNoNombrados(f) : null,
    conteo,
    alSalir: ANUNCIO_EXPLORAR,
  }
}

/** Con texto, los chips de filtro que el conteo visible no nombra («solo gratis, para chicos»). */
function chipsNoNombrados(f: FiltrosTextoBuscar): string | null {
  const chips: string[] = []
  if (f.soloGratis) chips.push('solo gratis')
  if (f.paraChicos && f.categoria !== SLUG_INFANTIL) chips.push('para chicos')
  return chips.length > 0 ? chips.join(', ') : null
}

/** «1 película» / «N películas». */
export function conteoPeliculas(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'película' : 'películas'}`
}

/**
 * Cines (`app/cines.tsx`): no muestra conteo, pero el buscador filtra la
 * lista. Con texto: «2 películas para dune» o «Ninguna película para dune»
 * (el vacío visible sigue siendo el de la web); sin texto no hay nada que
 * anunciar, y al limpiar se dice cuántas hay en cartel.
 */
export function estadoAnunciableCines(p: { busqueda: string; cantidad: number; total: number; toque?: number }): EstadoAnunciable {
  const busqueda = p.busqueda.trim()
  return {
    clave: '',
    texto: busqueda,
    toque: p.toque,
    titulo: null,
    conteo: !busqueda ? null : p.cantidad > 0 ? `${conteoPeliculas(p.cantidad)} para ${busqueda}` : `Ninguna película para ${busqueda}`,
    alSalir: p.total > 0 ? `${conteoPeliculas(p.total)} en cartel` : null,
  }
}
