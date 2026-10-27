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
//     categoría (Infantil) y la marca de solo adultos (`vibe`). Un evento marcado solo
//     por tag no aparece con "Para chicos" hasta la próxima carga con red;
//     nunca aparece uno que no lo sea. No se sube `VERSION_CACHE`: subirla
//     tira la caché de los testers (`limpiarVersionesViejas`) y los deja sin
//     agenda sin conexión hasta la próxima carga buena, por un dato que
//     se puede completar así.
// Las dos reglas son la misma (`esItemParaChicos`: el booleano si está, si
// no la categoría), así que también vale para cualquier item que llegue sin
// el campo.
//
// A3, ronda de correcciones:
//   - `@qps/core/filtros/publico` exporta SOLO `esParaChicos` (la web tiene su
//     propio archivo con la misma firma). La categoría sola se evalúa con
//     `esParaChicos({ categorySlug })`, y lo que la app necesita comparar con
//     Infantil usa `SLUG_INFANTIL`, una constante de la app.
//   - Un evento con `age_restriction >= 18` nunca es para chicos, aunque tenga
//     la categoría o un tag (`paraChicosDeLaFila`). Va acá y no en core, que
//     tiene la firma fija. En la caché vieja, la edad quedó en `vibe:
//     'adultos'` (`ageChip` de core): el respaldo también la mira.
import { esParaChicos } from '@qps/core/filtros/publico'
import { filtrarCombinado, type FiltrosCombinados, type ItemFiltrable } from '@qps/core/home/filtros-combinados'
import type { DisplayEvent } from '@qps/core/home/types'

/** Slug de la categoría Infantil (toda entera es para chicos). Constante de la app, no de core. */
export const SLUG_INFANTIL = 'infantil'

/** Texto de la salida que apaga "Para chicos" (portada y Buscar), paralela a "Ver todos los precios". */
export const TEXTO_VER_TODAS_LAS_EDADES = 'Ver todas las edades'

/** Desde qué edad mínima un evento queda fuera de "Para chicos". */
export const EDAD_SOLO_ADULTOS = 18

/**
 * `paraChicos` de una fila de `events` (`lib/datos/eventos.ts`): `esParaChicos`
 * de core con la categoría y los tags crudos, salvo que el evento sea solo
 * para adultos (`age_restriction >= 18`).
 */
export function paraChicosDeLaFila(f: { categorySlug: string | null; tags: readonly string[] | null; ageRestriction: number | null | undefined }): boolean {
  if (typeof f.ageRestriction === 'number' && f.ageRestriction >= EDAD_SOLO_ADULTOS) return false
  return esParaChicos({ categorySlug: f.categorySlug, tags: f.tags })
}

/**
 * Un item filtrable que puede traer `paraChicos` (los eventos de
 * `obtenerEventosVigentesParaInicio`). Las películas de la portada y los items
 * de una caché vieja no lo traen; `unknown` porque lo que vuelve de la caché
 * es dato, no se confía en su forma.
 */
export type ItemConPublico = ItemFiltrable & { paraChicos?: unknown }

/**
 * Si el item es para chicos: `paraChicos` si es un booleano; si no, la
 * categoría sola (`esParaChicos({ categorySlug })`), salvo que sea solo para
 * adultos (`vibe: 'adultos'`, que `transformEvent` pone con `age_restriction >= 18`).
 */
export function esItemParaChicos(item: { evento: Pick<DisplayEvent, 'category' | 'vibe'>; paraChicos?: unknown }): boolean {
  if (typeof item.paraChicos === 'boolean') return item.paraChicos
  if (item.evento.vibe === 'adultos') return false
  return esParaChicos({ categorySlug: item.evento.category })
}

/** Con `activo`, solo los items para chicos (en el mismo orden); sin `activo`, los mismos items. */
export function filtrarParaChicos<T extends { evento: Pick<DisplayEvent, 'category' | 'vibe'>; paraChicos?: unknown }>(
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
export function completarParaChicos<T extends { evento: Pick<DisplayEvent, 'category' | 'vibe'>; paraChicos?: unknown }>(
  item: T,
): T & { paraChicos: boolean } {
  if (typeof item.paraChicos === 'boolean') return item as T & { paraChicos: boolean }
  return { ...item, paraChicos: esItemParaChicos(item) }
}
