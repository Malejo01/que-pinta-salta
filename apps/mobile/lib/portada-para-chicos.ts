// A3 (nube Q1): textos del chip "Para chicos" en la portada (título de la
// grilla, vacío y su segunda salida). Lógica pura, al lado de
// `lib/portada-gratis.ts` (A2), con la que se combina; probada en
// `tests/para-chicos.test.ts`. La lógica del filtro en sí está en
// `lib/para-chicos.ts`.
//
// Decisiones de textos (A3):
//   - Título: "Para chicos · Finde", "Música para chicos · Hoy"; con "Gratis",
//     "Gratis para chicos · Hoy" y "Música gratis para chicos · Finde". Con
//     "Cine" va la fecha (las películas no entran en "Para chicos": solo
//     quedan eventos con fecha). Con "Infantil" no se repite "para chicos"
//     ("Infantil · Hoy", "Infantil gratis · Hoy"): todo Infantil ya es para chicos.
//   - Vacío: "No hay eventos para chicos hoy." / "No hay eventos gratis de
//     Música para chicos el finde." (sin el segundo "para" de "para hoy", que
//     con "para chicos" sonaba a trabalenguas). Con "Cine" se agrega por qué
//     no están las películas; con "Infantil", la forma de A2 ("No hay eventos
//     de Infantil para hoy.").
//   - Salidas (`salidasVacioParaChicos`): la principal es "Ver todas las
//     edades" (apaga "Para chicos" y deja todo lo demás); la segunda deja
//     "Para chicos" prendido y afloja otro filtro: "Todas las categorías", si
//     no "Ver esta semana", si no (con "Gratis") "Ver todos los precios".
//
// Ronda de correcciones de A3:
//   - Con Infantil elegida, "Ver todas las edades" no cambia nada (todo
//     Infantil ya es para chicos): no se ofrece. La principal pasa a ser la
//     fecha ("Ver esta semana", si no se está en la semana), si no "Ver todos
//     los precios" (con "Gratis"), si no "Todas las categorías"; la segunda,
//     "Todas las categorías" si no fue la principal.
//   - La salida se llama "Ver todas las edades" (paralela a "Ver todos los
//     precios"), y el caso Cine explica que las películas no tienen la edad
//     cargada (con "Gratis", que no son gratis, como en A2).
import type { Atajo } from '@qps/core/home/atajos'
import { SLUG_INFANTIL } from '@/lib/para-chicos'
import type { Idioma } from '@/lib/i18n/idioma'
import { textosDe } from '@/lib/i18n/textos'

/**
 * Título de la grilla con "Para chicos" prendido (con o sin "Gratis").
 * `nombreCategoria: null` = "Todas".
 */
export function tituloParaChicos(
  nombreCategoria: string | null,
  categoria: string | null,
  atajo: Atajo,
  gratis: boolean,
  idioma: Idioma = 'es',
): string {
  const t = textosDe(idioma).portada
  const nombre = categoria === null || nombreCategoria === null ? null : nombreCategoria
  return `${t.quienParaChicos(nombre, categoria === SLUG_INFANTIL, gratis)} · ${t.atajos[atajo]}`
}

/**
 * Texto del vacío con "Para chicos" prendido: dice por qué está vacío.
 *   - "Todas": "No hay eventos para chicos hoy." (con "Gratis": "No hay eventos gratis para chicos hoy.")
 *   - una categoría: "No hay eventos de Música para chicos el finde."
 *   - "Infantil": "No hay eventos de Infantil para hoy." (sin repetir "para chicos").
 *   - "Cine": lo mismo, más por qué no están las películas (sin la edad
 *     cargada; con "Gratis", que no son gratis).
 */
export function textoVacioParaChicos(
  categoria: string | null,
  nombreCategoria: string,
  atajo: Atajo,
  gratis: boolean,
  idioma: Idioma = 'es',
): string {
  const t = textosDe(idioma).portada
  return t.vacioParaChicos(categoria === null ? null : nombreCategoria, categoria === SLUG_INFANTIL, categoria === 'cine', gratis, t.frases[atajo])
}

/** Una salida del vacío de "Para chicos". */
export type SalidaParaChicos =
  | { tipo: 'todas-las-edades'; texto: string }
  | { tipo: 'todas-las-categorias'; texto: string }
  | { tipo: 'esta-semana'; texto: string }
  | { tipo: 'todos-los-precios'; texto: string }


/**
 * Las salidas del vacío con "Para chicos" prendido: la principal (botón
 * relleno) y, si hay, una segunda (con contorno).
 *   - Con una categoría que no es Infantil: "Ver todas las edades" + "Todas las categorías".
 *   - Con "Todas": "Ver todas las edades" + "Ver esta semana" (si no se está
 *     en la semana), o + "Ver todos los precios" (en la semana, con "Gratis"),
 *     o sola (en la semana, sin "Gratis").
 *   - Con Infantil (apagar "Para chicos" no cambia nada): la principal es
 *     "Ver esta semana" (si no se está en la semana), si no "Ver todos los
 *     precios" (con "Gratis"), si no "Todas las categorías"; la segunda,
 *     "Todas las categorías" si no fue la principal.
 */
export function salidasVacioParaChicos(
  categoria: string | null,
  atajo: Atajo,
  gratis: boolean,
  idioma: Idioma = 'es',
): { principal: SalidaParaChicos; segunda: SalidaParaChicos | null } {
  // Q6-1: los textos de las salidas, del diccionario del idioma.
  const t = textosDe(idioma).portada
  const TODAS_LAS_EDADES: SalidaParaChicos = { tipo: 'todas-las-edades', texto: t.verTodasLasEdades }
  const TODAS_LAS_CATEGORIAS: SalidaParaChicos = { tipo: 'todas-las-categorias', texto: t.todasLasCategorias }
  const ESTA_SEMANA: SalidaParaChicos = { tipo: 'esta-semana', texto: t.verEstaSemana }
  const TODOS_LOS_PRECIOS: SalidaParaChicos = { tipo: 'todos-los-precios', texto: t.verTodosLosPrecios }
  if (categoria === SLUG_INFANTIL) {
    const principal = atajo !== 'semana' ? ESTA_SEMANA : gratis ? TODOS_LOS_PRECIOS : TODAS_LAS_CATEGORIAS
    return { principal, segunda: principal === TODAS_LAS_CATEGORIAS ? null : TODAS_LAS_CATEGORIAS }
  }
  if (categoria !== null) return { principal: TODAS_LAS_EDADES, segunda: TODAS_LAS_CATEGORIAS }
  if (atajo !== 'semana') return { principal: TODAS_LAS_EDADES, segunda: ESTA_SEMANA }
  return { principal: TODAS_LAS_EDADES, segunda: gratis ? TODOS_LOS_PRECIOS : null }
}
