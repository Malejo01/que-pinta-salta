/**
 * Meta descripción limpia (B2). La ficha usaba el caption crudo de Instagram
 * cortado a 160 caracteres: con emojis, saltos de línea y el corte a mitad de
 * palabra («🎶🔥 ¡UNA NOCHE CON ARTISTAS IMPERDIBLES… 🔥🎶»). Google muestra
 * la descripción como texto corrido, así que acá se deja solo el texto.
 */

/**
 * Primera pasada, se borran sin dejar nada: los selectores de variación
 * (U+FE0E/U+FE0F), el ZWJ de los emojis compuestos (U+200D), el marco de los
 * keycaps (U+20E3) y las etiquetas de las banderas de subdivisiones
 * (U+E0020–U+E007F). Sin espacio porque van pegados a otro carácter: de
 * «2️⃣5️⃣/1️⃣0️⃣» tiene que quedar «25/10», no «2 5/1 0».
 */
const UNIONES = /[\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu

/**
 * Segunda pasada, se cambian por un espacio: los emojis y pictogramas
 * (`\p{Extended_Pictographic}`, incluye ©, ® y ™), las letras de las
 * banderas (`\p{Regional_Indicator}`: 🇦🇷 no es pictográfico) y los tonos de
 * piel (`\p{Emoji_Modifier}`). Con espacio porque entre dos palabras
 * separadas solo por un emoji («fiesta🔥hoy») tiene que quedar uno.
 */
const PICTOGRAMAS = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}]/gu

/**
 * El espacio que dejó un emoji antes de un signo que cierra («¡VENÍ 🔥!»,
 * «Noche 🔥»»). Las comillas rectas (" y ') abren y cierran igual: solo
 * cuentan como de cierre si atrás viene el final, un espacio u otro signo;
 * si no, se comería el espacio de `y "Peña"`.
 */
const ESPACIO_ANTES_DE_CIERRE = / ([,.;:!?…)»”’]|["'](?=$|[\s,.;:!?…)»”’]))/g

let segmentador: Intl.Segmenter | null | undefined

/**
 * El texto en grafemas (lo que se ve como un carácter): así el corte nunca
 * parte un par sustituto («𝐆») ni deja una tilde combinada suelta (una «é»
 * en NFD son dos code points). Sin `Intl.Segmenter`, por code points con
 * las marcas combinantes pegadas a la letra de antes.
 */
function grafemas(texto: string): string[] {
  if (segmentador === undefined) {
    segmentador = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null
  }
  if (segmentador) return Array.from(segmentador.segment(texto), (s) => s.segment)

  const partes: string[] = []
  for (const cp of texto) {
    if (partes.length > 0 && /\p{M}/u.test(cp)) partes[partes.length - 1] += cp
    else partes.push(cp)
  }
  return partes
}

/**
 * Devuelve el texto sin emojis, en una sola línea y cortado en palabra, o
 * `null` si no queda nada (para que quien llama use su texto de respaldo).
 *
 * El largo se mide en unidades UTF-16 (`String.length`), con el «…»
 * incluido: `resultado.length <= max`. Es la medida más estricta de las
 * tres (unidades ≥ code points ≥ grafemas), así que tampoco se pasa contando
 * de las otras formas; una letra fuera del plano básico o una tilde en NFD
 * ocupan dos y el texto sale un poco más corto, nada más.
 */
export function descripcionParaMeta(texto: string | null | undefined, max = 160): string | null {
  if (!texto) return null

  const limpio = texto
    .replace(UNIONES, '')
    .replace(PICTOGRAMAS, ' ')
    .replace(/\s+/g, ' ')
    .replace(ESPACIO_ANTES_DE_CIERRE, '$1')
    .trim()

  if (!limpio) return null
  if (limpio.length <= max) return limpio

  // Los grafemas enteros que entran en max - 1 unidades (lugar para el «…»).
  const todos = grafemas(limpio)
  let largo = 0
  let cuantos = 0
  while (cuantos < todos.length && largo + todos[cuantos].length <= max - 1) {
    largo += todos[cuantos].length
    cuantos++
  }
  const ventana = todos.slice(0, cuantos).join('')

  let cuerpo: string
  if (todos[cuantos] === ' ') {
    // La ventana termina justo al final de una palabra.
    cuerpo = ventana
  } else {
    // Se corta en el último espacio solo si queda por lo menos la mitad del
    // texto; si no (un «¡ » seguido de una palabra larguísima), es mejor un
    // corte duro, por grafema, que una descripción de dos caracteres.
    const ultimoEspacio = ventana.lastIndexOf(' ')
    cuerpo = ultimoEspacio >= max / 2 ? ventana.slice(0, ultimoEspacio) : ventana
  }

  // Sin una coma o un guion colgando antes de los puntos suspensivos.
  cuerpo = cuerpo.replace(/[\s,;:.\-–—]+$/u, '')
  return cuerpo ? `${cuerpo}…` : null
}
