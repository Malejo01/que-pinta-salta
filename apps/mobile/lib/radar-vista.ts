// Ronda 29, tarea 29-d: lógica pura de la pantalla del Radar (paridad con
// `apps/web/components/radar-form.tsx`). Sin Supabase, sin React, sin red —
// solo tipos y funciones que `components/PantallaRadar.tsx` usa para
// calcular qué mostrar. Separado de `lib/radar.ts` (que sí habla con la
// base) para poder probar esta parte sin mockear nada.
import type { EmailFrequency } from '@qps/core/radar/preferencias'

/** Forma mínima de un lugar buscable (alcanza con el `name` de `LugarRadar`
 * en `lib/radar.ts`; no se repite el tipo completo para no acoplar este
 * módulo a él). */
export interface LugarBuscable {
  id: string
  name: string
}

/** Forma mínima de una cuenta de Instagram buscable (de
 * `CuentaInstagramRadar` en `lib/radar.ts`). */
export interface CuentaInstagramBuscable {
  id: string
  display_name: string
  username: string
}

/** Un resultado del buscador unificado: un lugar o una cuenta de Instagram,
 * con la forma mínima que necesita la pantalla para mostrar el nombre, el
 * badge ("Lugar"/"Instagram") y, para Instagram, el `@usuario`. */
export type Seguible =
  | { tipo: 'lugar'; id: string; nombre: string }
  | { tipo: 'instagram'; id: string; nombre: string; usuario: string }

/**
 * Minúsculas y sin acentos. Mismo criterio que el buscador unificado de la
 * web (`radar-form.tsx`): `toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")`.
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Busca lugares (por nombre) y cuentas de Instagram (por nombre o por
 * `@usuario`) en un único resultado, como el autocompletado unificado de la
 * web, hasta `max` coincidencias (6 por defecto, igual que la web).
 *
 * `lugares` y `cuentas` ya vienen sin los elegidos: quien llama
 * (`PantallaRadar`) filtra las listas completas contra los ids
 * seleccionados antes de pasarlas, así esta función no necesita conocer qué
 * está seleccionado — "sin los ya elegidos" es responsabilidad de los
 * argumentos, no de un parámetro extra.
 */
export function buscarSeguibles(
  lugares: LugarBuscable[],
  cuentas: CuentaInstagramBuscable[],
  texto: string,
  max = 6,
): Seguible[] {
  const consultaCruda = normalizarBusqueda(texto.trim())
  if (!consultaCruda) return []
  // "@metro" tiene que encontrar la cuenta de username "metro": se busca sin
  // el "@" inicial, tanto en el nombre como en el usuario.
  const consulta = consultaCruda.replace(/^@/, '')
  if (!consulta) return []

  const resultados: Seguible[] = []

  for (const lugar of lugares) {
    if (normalizarBusqueda(lugar.name).includes(consulta)) {
      resultados.push({ tipo: 'lugar', id: lugar.id, nombre: lugar.name })
    }
  }

  for (const cuenta of cuentas) {
    const coincideNombre = normalizarBusqueda(cuenta.display_name).includes(consulta)
    const coincideUsuario = normalizarBusqueda(cuenta.username).includes(consulta)
    if (coincideNombre || coincideUsuario) {
      resultados.push({ tipo: 'instagram', id: cuenta.id, nombre: cuenta.display_name, usuario: cuenta.username })
    }
  }

  return resultados.slice(0, max)
}

/** Etiquetas del resumen de arriba, para las 3 frecuencias "activas" (todo
 * menos `'disabled'`, que tiene su propio texto). */
const ETIQUETAS_RESUMEN: Record<Exclude<EmailFrequency, 'disabled'>, string> = {
  weekly: 'cada semana',
  biweekly: 'cada 2 semanas',
  monthly: 'cada mes',
}

/**
 * El resumen de arriba cuando ya hay un Radar guardado (decisión 5 del
 * apéndice de `plan.md`; es el único texto nuevo de esta tarea, no sale de
 * la web): "Tu Radar está activo: te llega {cada semana / cada 2 semanas /
 * cada mes} a {email}", o "Tu Radar está pausado" si la frecuencia es
 * `'disabled'`.
 */
export function resumenRadar(frecuencia: EmailFrequency, email: string): string {
  if (frecuencia === 'disabled') return 'Tu Radar está pausado'
  return `Tu Radar está activo: te llega ${ETIQUETAS_RESUMEN[frecuencia]} a ${email}`
}

/** La parte del estado de la pantalla que importa para comparar "lo
 * guardado" contra "lo que hay en pantalla ahora" (sin el `Set` ni las
 * opciones disponibles, que no cambian la comparación). */
export interface EstadoRadarComparable {
  email_frequency: EmailFrequency
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}

/** `true` si las dos listas tienen exactamente los mismos ids, sin importar
 * el orden (compara como conjuntos). */
function mismoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const conjuntoA = new Set(a)
  return b.every((id) => conjuntoA.has(id))
}

/**
 * `true` si `actual` difiere de `original` (la frecuencia o cualquiera de
 * las 3 listas de seguidos, sin importar el orden dentro de cada lista): la
 * pantalla la usa para mostrar "Tenés cambios sin guardar" arriba del
 * botón de guardar.
 */
export function hayCambios(original: EstadoRadarComparable, actual: EstadoRadarComparable): boolean {
  if (original.email_frequency !== actual.email_frequency) return true
  if (!mismoConjunto(original.categoryIds, actual.categoryIds)) return true
  if (!mismoConjunto(original.venueIds, actual.venueIds)) return true
  if (!mismoConjunto(original.instagramAccountIds, actual.instagramAccountIds)) return true
  return false
}
