// R81, 81-a: la lógica pura de la cabecera de la portada en UNA fila. El botón
// «Filtros» (ícono + contador) abre una hoja con «Gratis», «Para chicos» y la
// grilla de categorías (`components/HojaFiltros.tsx`); los filtros activos se
// repiten, después de las pills de fecha, como chips chicos removibles. Acá
// vive lo que no necesita React: cuántos filtros hay activos, cómo se llama el
// botón (visible y para el lector de pantalla), qué chips removibles hay y el
// texto del botón de la hoja. Sin React ni React Native, para probarlo con
// Vitest (`tests/portada-filtros.test.ts`).
//
// Qué cuenta como filtro: «Gratis», «Para chicos» y la categoría elegida. La
// fecha NO cuenta (las pills siempre tienen una elegida y «Limpiar» no la toca).

export interface FiltrosPortada {
  gratis: boolean
  paraChicos: boolean
  /** Slug de la categoría elegida; `null` = «Todas». */
  categoria: string | null
}

/** Cuántos de los tres filtros están prendidos (0 a 3). */
export function contarFiltrosActivos(filtros: FiltrosPortada): number {
  return (filtros.gratis ? 1 : 0) + (filtros.paraChicos ? 1 : 0) + (filtros.categoria !== null ? 1 : 0)
}

/** Lo que se lee en el botón: «Filtros» sin activos, «Filtros · 2» con activos. */
export function etiquetaVisibleFiltros(activos: number): string {
  return activos > 0 ? `Filtros · ${activos}` : 'Filtros'
}

/** Lo que dice el lector de pantalla: «Filtros», «Filtros, 1 activo», «Filtros, 2 activos». */
export function etiquetaAccesibleFiltros(activos: number): string {
  if (activos <= 0) return 'Filtros'
  return `Filtros, ${activos} ${activos === 1 ? 'activo' : 'activos'}`
}

/** Qué filtro quita cada chip removible. */
export type ClaveFiltro = 'gratis' | 'para-chicos' | 'categoria'

export interface ChipRemovible {
  clave: ClaveFiltro
  /** Lo que se ve en el chip. */
  texto: string
  /** Lo que dice el lector de pantalla al llegar al chip: «Quitar Gratis». */
  etiqueta: string
}

/**
 * Los chips removibles de los filtros activos, en el orden de la hoja (Gratis,
 * Para chicos, categoría). `nombreCategoria` es el nombre visible de la
 * categoría elegida (si falta, el slug).
 */
export function chipsRemovibles(filtros: FiltrosPortada, nombreCategoria: string): ChipRemovible[] {
  const chips: ChipRemovible[] = []
  if (filtros.gratis) chips.push({ clave: 'gratis', texto: 'Gratis', etiqueta: 'Quitar Gratis' })
  if (filtros.paraChicos) chips.push({ clave: 'para-chicos', texto: 'Para chicos', etiqueta: 'Quitar Para chicos' })
  if (filtros.categoria !== null) {
    const nombre = nombreCategoria || filtros.categoria
    chips.push({ clave: 'categoria', texto: nombre, etiqueta: `Quitar ${nombre}` })
  }
  return chips
}

/** El botón de abajo de la hoja, que la cierra: «Ver 1 evento» / «Ver 12 eventos». */
export function textoVerEventos(cantidad: number): string {
  return `Ver ${cantidad} ${cantidad === 1 ? 'evento' : 'eventos'}`
}
