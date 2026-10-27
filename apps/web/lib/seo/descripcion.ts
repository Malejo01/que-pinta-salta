/**
 * Meta descripción limpia (B2). La ficha usaba el caption crudo de Instagram
 * cortado a 160 caracteres: con emojis, saltos de línea y el corte a mitad de
 * palabra («🎶🔥 ¡UNA NOCHE CON ARTISTAS IMPERDIBLES… 🔥🎶»). Google muestra
 * la descripción como texto corrido, así que acá se deja solo el texto.
 */

/**
 * Lo que se saca:
 * - `\p{Extended_Pictographic}`: los emojis y pictogramas (incluye ©, ® y ™).
 * - `\p{Regional_Indicator}`: las letras de las banderas (🇦🇷 no es pictográfico).
 * - `\p{Emoji_Modifier}`: los tonos de piel.
 * - U+FE0E/U+FE0F (selectores de variación), U+200D (ZWJ de los emojis
 *   compuestos), U+20E3 (el marco de los keycaps: de «1️⃣» queda «1») y las
 *   etiquetas U+E0020–U+E007F (banderas de subdivisiones).
 */
const NO_TEXTO =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu

/**
 * Devuelve el texto sin emojis, en una sola línea y de `max` caracteres como
 * mucho (el «…» incluido), cortado en el último espacio. `null` si no queda
 * nada, para que quien llama use su texto de respaldo.
 */
export function descripcionParaMeta(texto: string | null | undefined, max = 160): string | null {
  if (!texto) return null

  const limpio = texto
    // Con espacio y no con nada: entre dos palabras separadas solo por un
    // emoji («fiesta🔥hoy») tiene que quedar un espacio.
    .replace(NO_TEXTO, ' ')
    .replace(/\s+/g, ' ')
    // El espacio que dejó un emoji antes de un signo («¡VENÍ 🔥!»).
    .replace(/ ([,.;:!?…)])/g, '$1')
    .trim()

  if (!limpio) return null
  if (limpio.length <= max) return limpio

  // Lugar para el «…»: el cuerpo tiene como mucho max - 1 caracteres.
  const ventana = limpio.slice(0, max)
  const ultimoEspacio = ventana.lastIndexOf(' ')
  const cuerpo = (ultimoEspacio > 0 ? limpio.slice(0, ultimoEspacio) : limpio.slice(0, max - 1))
    // Sin una coma o un guion colgando antes de los puntos suspensivos.
    .replace(/[\s,;:.\-–—]+$/u, '')

  return cuerpo ? `${cuerpo}…` : null
}
