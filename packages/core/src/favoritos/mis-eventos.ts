/**
 * Separar "Mis eventos" en las dos secciones del modelo nuevo (R47, tarea
 * 47-a, QPS-197): ✓ Voy (social, los eventos marcados con `kind = 'voy'`) y
 * ♥ Guardados (privado, el resto). Voy está *contenido* en Guardados (ver
 * `asistencia/index.ts`), pero en la pantalla se muestran en dos listas
 * separadas: esta función hace esa partición sobre el resultado ya armado
 * de `armarFavoritos` (`favoritos/armar.ts`).
 *
 * Sin React, sin Supabase, sin red: recibe datos ya resueltos.
 */
import type { GrupoPorDia, ResultadoFavoritosArmados } from './armar'
import type { DisplayEvent } from '../home/types'

/**
 * Orden estable: fecha, después startDateTime, después id.
 *
 * Copia del comparador privado `compararEstable` de `favoritos/armar.ts`
 * (no exportado, y `armar.ts` no es un archivo que esta tarea pueda tocar).
 * Los dos tienen que dar exactamente el mismo orden: queda pendiente para
 * 47-q sumar un test que compare el resultado de los dos comparadores sobre
 * la misma entrada, para que una divergencia futura se note.
 */
function compararEstable(a: DisplayEvent, b: DisplayEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const diferenciaInicio = new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
  if (!Number.isNaN(diferenciaInicio) && diferenciaInicio !== 0) return diferenciaInicio
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/** Flyers de Instagram y películas nunca van a Voy: solo eventos con fecha. */
function puedeSerVoy(item: DisplayEvent): boolean {
  return !item.isCinemaMovie && !item.isInstagramFlyer
}

/**
 * Separa el resultado de `armarFavoritos` en `voy` (los eventos marcados
 * con ✓ Voy) y `guardados` (el resto, el modelo de siempre de ♥ Guardados).
 *
 * `idsVoy` son los ids de evento marcados con Voy (ver `idsDeEventosVoy`).
 * `extrasVoy` son eventos con Voy que ya no están en `armado` porque no
 * están guardados: son los datos de antes del backfill de la R47 (un Voy
 * viejo sin su Guardado correspondiente). Se agregan a `voy` sin
 * duplicarse por `id`; nunca se agregan a `guardados` (no están guardados).
 *
 * No muta `armado` ni sus arreglos internos: la web y la app siguen usando
 * el resultado completo de `armarFavoritos` para el mensaje de WhatsApp.
 */
export function separarMisEventos(
  armado: ResultadoFavoritosArmados,
  idsVoy: Iterable<string>,
  extrasVoy: DisplayEvent[] = [],
): { voy: DisplayEvent[]; guardados: ResultadoFavoritosArmados } {
  const idsVoySet = new Set(idsVoy)

  const todosLosItems: DisplayEvent[] = [
    ...armado.flexibles,
    ...armado.porDia.flatMap((grupo) => grupo.items),
  ]

  const vistos = new Set<string>()
  const voy: DisplayEvent[] = []
  for (const item of todosLosItems) {
    if (!puedeSerVoy(item)) continue
    if (!idsVoySet.has(item.id)) continue
    if (vistos.has(item.id)) continue
    vistos.add(item.id)
    voy.push(item)
  }
  for (const item of extrasVoy) {
    if (!puedeSerVoy(item)) continue
    if (vistos.has(item.id)) continue
    vistos.add(item.id)
    voy.push(item)
  }
  voy.sort(compararEstable)

  const flexibles = armado.flexibles.filter((item) => !(puedeSerVoy(item) && idsVoySet.has(item.id)))

  // Decisión de esta tarea (no estaba en el encargo): si al sacar los
  // eventos con Voy un grupo de `porDia` queda vacío, el grupo entero se
  // saca de la lista. Si no, la pantalla dibujaría el encabezado de un día
  // sin ningún evento abajo.
  const porDia: GrupoPorDia[] = armado.porDia
    .map((grupo) => ({
      dia: grupo.dia,
      items: grupo.items.filter((item) => !(puedeSerVoy(item) && idsVoySet.has(item.id))),
    }))
    .filter((grupo) => grupo.items.length > 0)

  return { voy, guardados: { flexibles, porDia } }
}

/** Fila cruda de `user_favorites` (igual forma que usa `idsDeFavoritos` en `armar.ts`, pero con `kind`). */
export interface FilaConKind {
  event_id: string | null
  kind: string | null
}

/**
 * Los ids de evento con `kind = 'voy'`, sin nulos, sin cadenas vacías y sin
 * repetidos, conservando el orden de aparición (mismo criterio que
 * `idsUnicos` de `favoritos/armar.ts`, copiado acá porque esa función
 * tampoco está exportada).
 */
export function idsDeEventosVoy(filas: FilaConKind[]): string[] {
  const vistos = new Set<string>()
  const resultado: string[] = []
  for (const fila of filas) {
    if (fila.kind !== 'voy') continue
    const id = fila.event_id
    if (typeof id !== 'string' || id.length === 0) continue
    if (vistos.has(id)) continue
    vistos.add(id)
    resultado.push(id)
  }
  return resultado
}
