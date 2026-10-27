/**
 * Los filtros "qué" de `/mapa` (Q3, C1): Gratis, Para chicos y categoría,
 * combinables con la fecha de `pines.ts`. Puro: sin React, Next ni Supabase,
 * y `ahora` entra por parámetro.
 *
 * No copia reglas: la fecha la sigue decidiendo `eventoEnFiltroMapa` (que
 * llama a `eventoEnAtajo`) y lo demás lo decide `filtrarCombinado`, el mismo
 * filtro de Buscar y de la portada de la app.
 */
import { categoriasDisponibles, filtrarCombinado } from '../home/filtros-combinados'
import { transformEvent } from '../home/transform'
import type { EventWithRelations } from '../home/types'
import { armarPinesDelMapa, eventoEnFiltroMapa, type FiltroMapa, type PinLugar } from './pines'

/** Los filtros "qué" del mapa. `categoria: null` = todas. */
export interface FiltrosExtraMapa {
  gratis: boolean
  chicos: boolean
  categoria: string | null
}

export const SIN_FILTROS_EXTRA: FiltrosExtraMapa = { gratis: false, chicos: false, categoria: null }

/** Una categoría con eventos en la fecha elegida (y con Gratis / Para chicos, si están prendidos). */
export interface CategoriaDelMapa {
  slug: string
  name: string
  cantidad: number
}

/** `true` si hay al menos un filtro "qué" prendido. */
export function hayFiltrosExtra(extra: FiltrosExtraMapa): boolean {
  return extra.gratis || extra.chicos || extra.categoria !== null
}

/**
 * Los filtros "qué" a partir de los query params: `gratis=1`, `chicos=1` y
 * `categoria=<slug>`. Una categoría que no está en `categoriasValidas` se
 * ignora (un link viejo o mal escrito abre el mapa sin ese filtro en vez de
 * un mapa vacío). Nunca tira una excepción.
 */
export function parsearFiltrosExtraMapa(
  params: { gratis?: string | null; chicos?: string | null; categoria?: string | null },
  categoriasValidas: ReadonlySet<string>
): FiltrosExtraMapa {
  const categoria = params.categoria && categoriasValidas.has(params.categoria) ? params.categoria : null
  return { gratis: params.gratis === '1', chicos: params.chicos === '1', categoria }
}

/**
 * La query de `/mapa` (sin el `?`) para un filtro de fecha y unos filtros
 * "qué", en un orden fijo: `cuando`, `dia`, `gratis`, `chicos`, `categoria`.
 * Es lo que se comparte: el mismo link abre el mismo mapa filtrado.
 */
export function consultaDelMapa(filtro: FiltroMapa, extra: FiltrosExtraMapa): string {
  const partes = new URLSearchParams()
  partes.set('cuando', filtro.tipo)
  if (filtro.tipo === 'fecha') partes.set('dia', filtro.dia)
  if (extra.gratis) partes.set('gratis', '1')
  if (extra.chicos) partes.set('chicos', '1')
  if (extra.categoria !== null) partes.set('categoria', extra.categoria)
  return partes.toString()
}

/** Las categorías de los eventos (una por slug), por nombre. Los eventos sin categoría no suman. */
export function categoriasDeLosEventos(eventos: readonly EventWithRelations[]): { slug: string; name: string }[] {
  const porSlug = new Map<string, string>()
  for (const evento of eventos) {
    if (evento.category && !porSlug.has(evento.category.slug)) porSlug.set(evento.category.slug, evento.category.name)
  }
  return [...porSlug.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Pasa por `filtrarCombinado` (sin atajo: la fecha ya se filtró) y devuelve los eventos originales que quedan. */
function conFiltrosExtra(eventos: EventWithRelations[], extra: FiltrosExtraMapa, ahora: Date): EventWithRelations[] {
  if (!hayFiltrosExtra(extra)) return eventos
  const items = eventos
    .filter((evento) => evento.category)
    .map((evento) => ({ evento: transformEvent(evento), paraAtajo: null }))
  const quedan = new Set(
    filtrarCombinado(items, { atajo: null, categoria: extra.categoria, soloGratis: extra.gratis, paraChicos: extra.chicos }, ahora).map(
      (evento) => evento.id
    )
  )
  return eventos.filter((evento) => quedan.has(evento.id))
}

/**
 * El mapa filtrado: los pines (y los eventos sin ubicación) de lo que cae en
 * la fecha `filtro` y pasa los filtros "qué", más las categorías para los
 * chips. Las categorías se cuentan con la fecha y con Gratis / Para chicos,
 * pero sin la categoría elegida (si no, quedaría un solo chip); la elegida
 * aparece siempre, aunque tenga 0 (`categoriasDisponibles`).
 *
 * Con un filtro "qué" prendido, un evento sin categoría no pasa (no se puede
 * saber si es gratis ni para quién es en el formato de Buscar); sin filtros
 * "qué", el mapa es exactamente el de `armarPinesDelMapa`.
 */
export function armarMapaFiltrado(
  eventos: EventWithRelations[],
  filtro: FiltroMapa,
  extra: FiltrosExtraMapa,
  ahora: Date
): { pines: PinLugar[]; sinUbicacion: number; categorias: CategoriaDelMapa[] } {
  const enFecha = eventos.filter((evento) => eventoEnFiltroMapa(evento, filtro, ahora))
  const sinCategoriaElegida = conFiltrosExtra(enFecha, { ...extra, categoria: null }, ahora)
  const filtrados = extra.categoria === null ? sinCategoriaElegida : conFiltrosExtra(sinCategoriaElegida, extra, ahora)

  const categorias = categoriasDisponibles(
    sinCategoriaElegida.filter((evento) => evento.category).map(transformEvent),
    categoriasDeLosEventos(eventos),
    extra.categoria
  )

  return { ...armarPinesDelMapa(filtrados, filtro, ahora), categorias }
}
