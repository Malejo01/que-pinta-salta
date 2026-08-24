/**
 * ============================================================================
 * ORDEN DE CATEGORÍAS FORZADO — CAMBIO TEMPORAL PARA LA DEMO INSTITUCIONAL
 * ============================================================================
 *
 * PARA APAGARLO: poner `ORDEN_DEMO_ACTIVO = false` en la línea de abajo.
 * Es lo único que hay que tocar. No hace falta revertir ningún commit.
 *
 * Y si nadie lo apaga, se apaga solo: pasada `ORDEN_DEMO_HASTA` el archivo
 * deja de tener efecto y la home vuelve al orden por volumen, sin deploy.
 * El flag tiene que estar activo Y la fecha no haber pasado.
 *
 * ---------------------------------------------------------------------------
 * Qué hace cuando está activo
 * ---------------------------------------------------------------------------
 * Reemplaza el orden de las filas de categorías de la home por uno fijo:
 *
 *     1. Espectáculos
 *     2. Teatro
 *     3. Peñas
 *     4. Museos
 *     5. el resto, conservando entre sí el orden que ya tenían
 *     6. Boliches, último
 *
 * Qué hace cuando está apagado
 * ----------------------------
 * Nada: devuelve la lista tal cual la recibe. El comportamiento vuelve a ser
 * exactamente el de hoy — favoritos del usuario primero, después por cantidad
 * de eventos próximos, y desempate alfabético. Ver getCategoryPriority() en
 * components/home-content.tsx.
 *
 * ---------------------------------------------------------------------------
 * Dos cosas que conviene saber
 * ---------------------------------------------------------------------------
 * 1. Mientras está activo, este orden PISA la personalización por favoritos.
 *    Un usuario logueado con categorías favoritas va a ver el orden de la
 *    demo igual, no el suyo. Es deliberado: si no, la demo no sería
 *    reproducible según quién esté logueado. Se revierte al apagar el flag.
 *
 * 2. El orden afecta también a qué eventos se eligen para las secciones
 *    destacadas de la home, porque salen recorriendo las categorías en este
 *    mismo orden. No es sólo el orden visual de las filas.
 *
 * ---------------------------------------------------------------------------
 * Por qué una constante y no una env var
 * ---------------------------------------------------------------------------
 * El orden se calcula en components/home-content.tsx, que es un componente
 * cliente. Una env var ahí tendría que ser NEXT_PUBLIC_*, y esas se inyectan
 * en tiempo de build: cambiarla en Vercel igual exige un redeploy. O sea,
 * mismo trabajo que cambiar esta línea, pero con la verdad repartida en dos
 * lugares y sin quedar registrada en git.
 * ============================================================================
 */

/** ⬅️ ÚNICA LÍNEA A TOCAR PARA APAGARLO. */
export const ORDEN_DEMO_ACTIVO = true

/**
 * Hasta cuándo vale, en hora de Salta. Pasada esta fecha el flag se ignora
 * aunque siga en `true`. Es la red de seguridad para no depender de que
 * alguien se acuerde: la demo es el lunes 2026-08-24 y son dos semanas.
 */
export const ORDEN_DEMO_HASTA = '2026-09-08T00:00:00-03:00'

/** Categorías al principio, en este orden. */
const PRIMERAS = ['espectaculos', 'teatro', 'penas', 'museos']

/** Categorías al final, en este orden. */
const ULTIMAS = ['boliches']

/**
 * Reordena según el plan de la demo. Si el flag está apagado o la fecha ya
 * pasó, devuelve `categorias` sin tocar.
 *
 * @param categorias  ya ordenadas por la lógica normal (volumen + favoritos)
 * @param ahoraISO    instante del servidor; se usa el del server y no
 *                    `new Date()` para que el corte no dependa del reloj del
 *                    visitante, que puede estar mal.
 */
export function aplicarOrdenDemo<T extends { slug: string }>(
  categorias: T[],
  ahoraISO: string,
): T[] {
  if (!ORDEN_DEMO_ACTIVO) return categorias

  const ahora = new Date(ahoraISO).getTime()
  const hasta = new Date(ORDEN_DEMO_HASTA).getTime()
  if (!Number.isFinite(ahora) || !Number.isFinite(hasta) || ahora >= hasta) {
    return categorias
  }

  const posicion = (slug: string): number => {
    const i = PRIMERAS.indexOf(slug)
    if (i !== -1) return i // 0..n
    const j = ULTIMAS.indexOf(slug)
    if (j !== -1) return PRIMERAS.length + 1 + j // después del resto
    return PRIMERAS.length // el resto, todos empatados
  }

  // sort() de Array es estable en todos los motores modernos, así que el
  // bloque "resto" conserva el orden por volumen que traía de entrada.
  return [...categorias].sort((a, b) => posicion(a.slug) - posicion(b.slug))
}
