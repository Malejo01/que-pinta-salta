// A3 (nube Q1): chip "Para chicos" de la portada y de Buscar. Lógica pura (sin
// React ni red) de qué item es para chicos y de cómo se suma ese filtro a
// `filtrarCombinado` (core), que no sabe de público: se filtran los items por
// `paraChicos` ANTES de `filtrarCombinado`, y después va todo lo demás (fecha,
// categoría, texto, gratis) igual que siempre. Probado en
// `tests/para-chicos.test.ts`.
//
// De dónde sale el dato: `obtenerEventosVigentesParaInicio`
// (`lib/datos/eventos.ts`) le pone a cada evento `paraChicos` con
// `esParaChicos` de `@qps/core/filtros/publico` (categoría `infantil` o un tag
// de `TAGS_PARA_CHICOS`), con los `tags` crudos de la fila. Hay dos casos sin
// el dato:
//   - Las películas en cartel (`transformMovie`, `category: 'cine'`): no
//     tienen tags ni `paraChicos`. Decisión de A3: no son para chicos salvo
//     que su categoría lo diga, y su categoría es siempre `cine`, así que con
//     "Para chicos" prendido quedan afuera (el vacío de "Cine" lo explica).
//     Marcar películas infantiles necesitaría un dato de la cartelera que hoy
//     no hay.
//   - Un item de una caché sin conexión guardada antes de A3
//     (`lib/sin-conexion/agenda.ts`): no tiene el campo y tampoco los tags (la
//     caché guarda `DisplayEvent`, que no los tiene). Se trata como "no se
//     sabe" de forma segura: se recalcula desde lo único que sí quedó, la
//     categoría (`evento.category === 'infantil'`). Un evento marcado solo
//     por tag no aparece con "Para chicos" hasta la próxima carga con red;
//     nunca aparece uno que no lo sea. No se sube `VERSION_CACHE`: subirla
//     tira la caché de los testers (`limpiarVersionesViejas`) y los deja sin
//     agenda sin conexión hasta la próxima carga buena, por un dato que
//     se puede completar así.
// Las dos reglas son la misma (`esItemParaChicos`: el booleano si está, si
// no la categoría), así que también vale para cualquier item que llegue sin
// el campo.
import { CATEGORIA_PARA_CHICOS } from '@qps/core/filtros/publico'
import { filtrarCombinado, type FiltrosCombinados, type ItemFiltrable } from '@qps/core/home/filtros-combinados'
import type { DisplayEvent } from '@qps/core/home/types'

/**
 * Un item filtrable que puede traer `paraChicos` (los eventos de
 * `obtenerEventosVigentesParaInicio`). Las películas de la portada y los items
 * de una caché vieja no lo traen; `unknown` porque lo que vuelve de la caché
 * es dato, no se confía en su forma.
 */
export type ItemConPublico = ItemFiltrable & { paraChicos?: unknown }

/** Si el item es para chicos: `paraChicos` si es un booleano; si no, la categoría (`infantil`). */
export function esItemParaChicos(item: { evento: Pick<DisplayEvent, 'category'>; paraChicos?: unknown }): boolean {
  if (typeof item.paraChicos === 'boolean') return item.paraChicos
  return item.evento.category === CATEGORIA_PARA_CHICOS
}

/** Con `activo`, solo los items para chicos (en el mismo orden); sin `activo`, los mismos items. */
export function filtrarParaChicos<T extends { evento: Pick<DisplayEvent, 'category'>; paraChicos?: unknown }>(
  items: T[],
  activo: boolean | undefined,
): T[] {
  return activo ? items.filter(esItemParaChicos) : items
}

/** Los filtros de `filtrarCombinado` más "Para chicos". */
export type FiltrosConPublico = FiltrosCombinados & { paraChicos?: boolean }

/**
 * `filtrarCombinado` (core) con "Para chicos": primero el público, después
 * fecha, categoría, texto y gratis. Los dos prendidos (gratis y para chicos)
 * dan los eventos que son las dos cosas.
 */
export function filtrarConPublico(items: ItemConPublico[], filtros: FiltrosConPublico, ahora: Date): DisplayEvent[] {
  const { paraChicos, ...resto } = filtros
  return filtrarCombinado(filtrarParaChicos(items, paraChicos), resto, ahora)
}

/**
 * Para la caché sin conexión (`paraMostrar`): deja `paraChicos` como booleano
 * en cada item. Si ya lo es, el item queda igual (la misma referencia); si
 * no (una caché anterior a A3), se completa con `esItemParaChicos`.
 */
export function completarParaChicos<T extends { evento: Pick<DisplayEvent, 'category'>; paraChicos?: unknown }>(
  item: T,
): T & { paraChicos: boolean } {
  if (typeof item.paraChicos === 'boolean') return item as T & { paraChicos: boolean }
  return { ...item, paraChicos: esItemParaChicos(item) }
}
