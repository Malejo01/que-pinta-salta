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
//   - Salidas: la primera es siempre "Ver para todas las edades" (apaga
//     "Para chicos" y deja todo lo demás); la segunda deja "Para chicos"
//     prendido y afloja otro filtro: "Todas las categorías", si no "Ver esta
//     semana", si no (con "Gratis") "Ver todos los precios".
import type { Atajo } from '@qps/core/home/atajos'
import { CATEGORIA_PARA_CHICOS } from '@qps/core/filtros/publico'
import { ETIQUETA_ATAJO, FRASE_ATAJO } from '@/lib/portada-gratis'

/** Texto de la salida principal del vacío de "Para chicos" (apaga el filtro). */
export const TEXTO_VER_TODAS_LAS_EDADES = 'Ver para todas las edades'

/**
 * Título de la grilla con "Para chicos" prendido (con o sin "Gratis").
 * `nombreCategoria: null` = "Todas".
 */
export function tituloParaChicos(nombreCategoria: string | null, categoria: string | null, atajo: Atajo, gratis: boolean): string {
  const conGratis = gratis ? ' gratis' : ''
  let quien: string
  if (categoria === null || nombreCategoria === null) quien = gratis ? 'Gratis para chicos' : 'Para chicos'
  else if (categoria === CATEGORIA_PARA_CHICOS) quien = `${nombreCategoria}${conGratis}`
  else quien = `${nombreCategoria}${conGratis} para chicos`
  return `${quien} · ${ETIQUETA_ATAJO[atajo]}`
}

/**
 * Texto del vacío con "Para chicos" prendido: dice por qué está vacío.
 *   - "Todas": "No hay eventos para chicos hoy." (con "Gratis": "No hay eventos gratis para chicos hoy.")
 *   - una categoría: "No hay eventos de Música para chicos el finde."
 *   - "Infantil": "No hay eventos de Infantil para hoy." (sin repetir "para chicos").
 *   - "Cine": lo mismo, más por qué no están las películas.
 */
export function textoVacioParaChicos(categoria: string | null, nombreCategoria: string, atajo: Atajo, gratis: boolean): string {
  const conGratis = gratis ? ' gratis' : ''
  if (categoria === null) return `No hay eventos${conGratis} para chicos ${FRASE_ATAJO[atajo]}.`
  if (categoria === CATEGORIA_PARA_CHICOS) return `No hay eventos${conGratis} de ${nombreCategoria} para ${FRASE_ATAJO[atajo]}.`
  const base = `No hay eventos${conGratis} de ${nombreCategoria} para chicos ${FRASE_ATAJO[atajo]}.`
  if (categoria !== 'cine') return base
  return `${base} Las películas en cartel no entran en ${gratis ? 'estos filtros' : 'este filtro'}.`
}

/** Segunda salida del vacío de "Para chicos" (la primera es siempre "Ver para todas las edades"). */
export type SegundaSalidaParaChicos =
  | { tipo: 'todas-las-categorias'; texto: string }
  | { tipo: 'esta-semana'; texto: string }
  | { tipo: 'todos-los-precios'; texto: string }

/**
 * La segunda salida del vacío con "Para chicos" prendido, que lo deja
 * prendido y afloja otro filtro:
 *   - con una categoría: "Todas las categorías";
 *   - con "Todas" y una fecha que no es la semana: "Ver esta semana";
 *   - con "Todas", la semana y "Gratis": "Ver todos los precios" (apaga "Gratis");
 *   - con "Todas", la semana y sin "Gratis": ninguna.
 */
export function segundaSalidaVacioParaChicos(categoria: string | null, atajo: Atajo, gratis: boolean): SegundaSalidaParaChicos | null {
  if (categoria !== null) return { tipo: 'todas-las-categorias', texto: 'Todas las categorías' }
  if (atajo !== 'semana') return { tipo: 'esta-semana', texto: 'Ver esta semana' }
  if (gratis) return { tipo: 'todos-los-precios', texto: 'Ver todos los precios' }
  return null
}
