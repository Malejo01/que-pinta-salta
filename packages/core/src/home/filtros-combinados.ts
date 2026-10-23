/**
 * Filtro combinado de la portada de la app y de Buscar (R66, 66-a): fecha
 * (atajo) + categoría + texto + gratis, todo a la vez y en memoria. Sin React
 * ni next/*.
 */
import { eventoEnAtajo, type Atajo, type EventoParaAtajo } from "./atajos"
import { buscarEventosPorTexto } from "./busqueda"
import { soloGratis } from "./filtros-extra"
import type { DisplayEvent } from "./types"

/**
 * Un evento listo para filtrar. `paraAtajo: null` = no se filtra por fecha
 * (las películas de cine, que la portada suma siempre).
 */
export interface ItemFiltrable {
  evento: DisplayEvent
  paraAtajo: EventoParaAtajo | null
}

/** Los filtros activos. `null` (o ausente) = sin ese filtro. */
export interface FiltrosCombinados {
  atajo: Atajo | null
  categoria: string | null
  soloGratis?: boolean
  texto?: string
}

const ATAJOS_VALIDOS: readonly Atajo[] = ["hoy", "esta-noche", "finde", "semana"]

/**
 * Aplica a la vez atajo, categoría, texto y gratis (en ese orden) y conserva
 * el orden de entrada.
 */
export function filtrarCombinado(items: ItemFiltrable[], filtros: FiltrosCombinados, ahora: Date): DisplayEvent[] {
  const { atajo, categoria } = filtros

  let eventos = items
    .filter((item) => atajo === null || item.paraAtajo === null || eventoEnAtajo(item.paraAtajo, atajo, ahora))
    .map((item) => item.evento)

  if (categoria !== null) eventos = eventos.filter((evento) => evento.category === categoria)

  const texto = filtros.texto?.trim()
  if (texto) eventos = buscarEventosPorTexto(eventos, texto)

  if (filtros.soloGratis) eventos = soloGratis(eventos)

  return eventos
}

/**
 * Las categorías con al menos un evento, de más a menos eventos (empate por
 * nombre). La `seleccionada` aparece siempre, aunque tenga 0, al final, para
 * que el chip elegido no desaparezca al cambiar de fecha. Los slugs que no
 * están en `categorias` se ignoran.
 */
export function categoriasDisponibles(
  eventos: DisplayEvent[],
  categorias: { slug: string; name: string }[],
  seleccionada: string | null
): { slug: string; name: string; cantidad: number }[] {
  const cuenta = new Map<string, number>()
  for (const evento of eventos) cuenta.set(evento.category, (cuenta.get(evento.category) ?? 0) + 1)

  const resultado = categorias
    .map((categoria) => ({ slug: categoria.slug, name: categoria.name, cantidad: cuenta.get(categoria.slug) ?? 0 }))
    .filter((categoria) => categoria.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad || a.name.localeCompare(b.name, "es"))

  if (seleccionada !== null && !resultado.some((categoria) => categoria.slug === seleccionada)) {
    const elegida = categorias.find((categoria) => categoria.slug === seleccionada)
    if (elegida) resultado.push({ slug: elegida.slug, name: elegida.name, cantidad: 0 })
  }

  return resultado
}

/** Valida un valor de querystring contra los 4 atajos; cualquier otra cosa da `null`. */
export function atajoDesdeParametro(valor: unknown): Atajo | null {
  return typeof valor === "string" && (ATAJOS_VALIDOS as readonly string[]).includes(valor) ? (valor as Atajo) : null
}
