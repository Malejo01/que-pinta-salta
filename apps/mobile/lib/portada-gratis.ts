// A2 (nube Q1): chip "Gratis" de la portada. Lógica pura (sin React ni red)
// de cómo se combinan fecha (atajo) + categoría + gratis en
// `app/(tabs)/index.tsx`, y los textos del título y del vacío, para poder
// probarlas con Vitest (`tests/portada-gratis.test.ts`) importándolas de
// verdad: `index.tsx` arrastra React Native y no se puede importar en los tests.
//
// Reglas (decididas en A2 y documentadas también en el encabezado de la portada):
//   - "Gratis" es un interruptor aparte de la categoría: se prende y se apaga
//     sin tocar el chip de categoría ni la pill de fecha, y al revés.
//   - Con "Gratis" apagado la portada queda exactamente como antes de A2.
//   - Con "Gratis" prendido la portada pasa al modo grilla (como con una
//     categoría elegida): sin Hero, sin banners, sin anuncio.
//   - Gratis = `price === 'gratis'` (`soloGratis` de core, que sale de
//     `is_free = true` en `transformEvent`). Las películas de cartelera
//     (`transformMovie`) llevan `price: 'confirmar'`: nunca son gratis, así que
//     con "Gratis" prendido quedan afuera — también con el chip "Cine", donde
//     solo quedan los eventos reales gratis de la categoría y el vacío explica
//     por qué no aparecen las películas.
//
// A3 (nube Q1): "Para chicos" es un tercer filtro, otro interruptor aparte
// (`paraChicos` en `FiltrosPortada`, opcional: sin él, todo queda como en
// A2). Se suma por el mismo camino: prende el modo grilla (`enModoGrilla`),
// filtra la grilla (`eventosDeLaGrilla`, con `filtrarConPublico` de
// `lib/para-chicos.ts`, que filtra por público antes de `filtrarCombinado`),
// los chips de categoría salen de lo que queda (`eventosDeLosChips`) y el
// anuncio tiene su propio nodo de vacío (`anuncioDeLaGrilla`). Los textos del
// título y del vacío de "Para chicos" están en `lib/portada-para-chicos.ts`.
import type { Atajo } from '@qps/core/home/atajos'
import { categoriasDisponibles, filtrarCombinado } from '@qps/core/home/filtros-combinados'
import { soloGratis } from '@qps/core/home/filtros-extra'
import type { DisplayEvent } from '@qps/core/home/types'
import { filtrarConPublico, filtrarParaChicos, type ItemConPublico } from '@/lib/para-chicos'

/** Etiqueta del atajo para el título de la grilla ("Música · Finde"). */
export const ETIQUETA_ATAJO: Record<Atajo, string> = {
  hoy: 'Hoy',
  'esta-noche': 'Esta noche',
  finde: 'Finde',
  semana: 'Semana',
}

/** Frase del atajo para el vacío ("No hay eventos de Música para hoy."). */
export const FRASE_ATAJO: Record<Atajo, string> = {
  hoy: 'hoy',
  'esta-noche': 'esta noche',
  finde: 'el finde',
  semana: 'esta semana',
}

/**
 * Los filtros de la portada. `categoria: null` = "Todas". `paraChicos` (A3)
 * es opcional: ausente es lo mismo que apagado.
 */
export interface FiltrosPortada {
  atajo: Atajo
  categoria: string | null
  gratis: boolean
  paraChicos?: boolean
}

/**
 * Si el cuerpo de la portada es la grilla (título + "N eventos" + 2 columnas)
 * en vez de Hero + filas: con una categoría elegida (R66, 66-a) o con
 * "Gratis" prendido (A2) o con "Para chicos" prendido (A3).
 */
export function enModoGrilla(filtros: Pick<FiltrosPortada, 'categoria' | 'gratis' | 'paraChicos'>): boolean {
  return filtros.categoria !== null || filtros.gratis || filtros.paraChicos === true
}

/**
 * Los eventos de la grilla: `filtrarCombinado` (core) con atajo + categoría +
 * gratis. Las películas van en `items` con `paraAtajo: null` (no se filtran
 * por fecha); con `gratis` quedan afuera porque no son gratis.
 *
 * A3 (nube Q1): con `paraChicos`, antes se dejan solo los items para chicos
 * (`filtrarConPublico`); las películas tampoco son para chicos (su categoría
 * es `cine`, ver `lib/para-chicos.ts`), así que quedan afuera.
 */
export function eventosDeLaGrilla(items: ItemConPublico[], filtros: FiltrosPortada, ahora: Date): DisplayEvent[] {
  return filtrarConPublico(
    items,
    { atajo: filtros.atajo, categoria: filtros.categoria, soloGratis: filtros.gratis, paraChicos: filtros.paraChicos },
    ahora,
  )
}

/**
 * A3 (nube Q1): los eventos de la fecha (más las películas) sobre los que se
 * cuentan los chips de categoría: todos los `items` del atajo y, con "Para
 * chicos", solo los para chicos (sin películas). Sin "Para chicos" es lo
 * mismo que `todosLosEventos` de la portada. Después va `chipsDeLaPortada`,
 * que suma "Gratis" como antes.
 */
export function eventosDeLosChips(
  items: ItemConPublico[],
  filtros: Pick<FiltrosPortada, 'atajo' | 'paraChicos'>,
  ahora: Date,
): DisplayEvent[] {
  return filtrarCombinado(filtrarParaChicos(items, filtros.paraChicos), { atajo: filtros.atajo, categoria: null }, ahora)
}

/**
 * Los chips de categoría: `categoriasDisponibles` (core) sobre los eventos de
 * la fecha (más las películas), y con "Gratis" prendido, solo sobre los
 * gratis. Así, con "Gratis", el chip "Cine" no aparece salvo que haya eventos
 * de cine gratis (o que sea el elegido: `categoriasDisponibles` mantiene
 * siempre la elegida, con 0, al final). Con "Gratis" apagado es la misma
 * llamada de siempre.
 */
export function chipsDeLaPortada(
  eventosDeLaFecha: DisplayEvent[],
  categorias: { slug: string; name: string }[],
  categoria: string | null,
  gratis: boolean,
): { slug: string; name: string; cantidad: number }[] {
  return categoriasDisponibles(gratis ? soloGratis(eventosDeLaFecha) : eventosDeLaFecha, categorias, categoria)
}

/**
 * Título de la grilla con "Gratis" prendido: "Gratis · Hoy" (con "Todas") o
 * "Música gratis · Finde" (con una categoría). Con "Cine" va el atajo, no "En
 * cartel": con "Gratis" no hay películas, solo eventos con fecha.
 * `nombreCategoria: null` = "Todas".
 */
export function tituloGratis(nombreCategoria: string | null, atajo: Atajo): string {
  const quien = nombreCategoria === null ? 'Gratis' : `${nombreCategoria} gratis`
  return `${quien} · ${ETIQUETA_ATAJO[atajo]}`
}

/**
 * Texto del vacío con "Gratis" prendido: dice por qué está vacío.
 *   - "Todas": "No hay eventos gratis para hoy."
 *   - una categoría: "No hay eventos gratis de Música para el finde."
 *   - "Cine": lo mismo, más "Las películas en cartel no son gratis." (si no,
 *     no se entiende por qué desaparecieron las películas).
 */
export function textoVacioGratis(categoria: string | null, nombreCategoria: string, atajo: Atajo): string {
  const cuando = FRASE_ATAJO[atajo]
  if (categoria === null) return `No hay eventos gratis para ${cuando}.`
  const base = `No hay eventos gratis de ${nombreCategoria} para ${cuando}.`
  return categoria === 'cine' ? `${base} Las películas en cartel no son gratis.` : base
}

/** Segunda salida del vacío de "Gratis" (la primera es siempre "Ver todos los precios"). */
export type SegundaSalidaGratis = { tipo: 'todas-las-categorias'; texto: string } | { tipo: 'esta-semana'; texto: string }

/**
 * La segunda salida del vacío con "Gratis" prendido, que deja "Gratis"
 * prendido y afloja otro filtro:
 *   - con una categoría: "Todas las categorías" (como el vacío del modo categoría);
 *   - con "Todas" y una fecha que no es la semana: "Ver esta semana" (como el
 *     vacío de "Hoy en Salta");
 *   - con "Todas" y la semana: ninguna (la única salida es "Ver todos los precios").
 */
export function segundaSalidaVacioGratis(categoria: string | null, atajo: Atajo): SegundaSalidaGratis | null {
  if (categoria !== null) return { tipo: 'todas-las-categorias', texto: 'Todas las categorías' }
  if (atajo !== 'semana') return { tipo: 'esta-semana', texto: 'Ver esta semana' }
  return null
}

/** Texto del vacío del modo categoría sin "Gratis" (R66, 66-c): "No hay eventos de Música para hoy." */
export function textoVacioCategoria(nombreCategoria: string, atajo: Atajo): string {
  return `No hay eventos de ${nombreCategoria} para ${FRASE_ATAJO[atajo]}.`
}

/**
 * Qué nodo muestra el texto que se anuncia. Cada uno es un elemento distinto
 * en pantalla: al pasar de uno a otro se monta uno nuevo, y Android no anuncia
 * el montaje de una live region (solo sus cambios).
 * A8 (nube Q1, QPS-339): ya no hay live regions; el `tipo` sirve para saber si
 * el anuncio lleva el título de la grilla (solo `conteo`; los vacíos ya nombran
 * los filtros), ver `estadoAnunciablePortada` en `lib/anunciar-conteo.ts`.
 */
export type TipoAnuncioGrilla = 'conteo' | 'vacio-categoria' | 'vacio-gratis' | 'vacio-para-chicos'

/**
 * Lo que se anuncia en el modo grilla (A2, ronda de correcciones): el conteo
 * ("N eventos") si hay resultados, o el texto del vacío si no — antes, con
 * "Gratis" prendido y sin resultados, no se oía nada. `null` fuera del modo
 * grilla. Hasta A3 el efecto de la portada lo anunciaba al aparecer cada nodo
 * (`tipo` distinto del anterior) y, en iOS, en cada cambio (QPS-354); desde A8
 * (nube Q1, QPS-339) lo anuncia `useAnunciarConteo` en las dos plataformas.
 *
 * A3 (nube Q1): con "Para chicos" prendido el vacío es el de "Para chicos"
 * (otro nodo: `VacioParaChicos`), también con "Gratis" prendido.
 */
export function anuncioDeLaGrilla(p: {
  modoGrilla: boolean
  gratis: boolean
  paraChicos?: boolean
  cantidad: number
  textoConteo: string
  textoVacio: string
}): { texto: string; tipo: TipoAnuncioGrilla } | null {
  if (!p.modoGrilla) return null
  if (p.cantidad > 0) return { texto: p.textoConteo, tipo: 'conteo' }
  if (p.paraChicos) return { texto: p.textoVacio, tipo: 'vacio-para-chicos' }
  return { texto: p.textoVacio, tipo: p.gratis ? 'vacio-gratis' : 'vacio-categoria' }
}
