// Q5-4 · «Lugares para chicos» en la app: filtros (puro, probado en
// tests/lugares-chicos.test.ts). Q5-11: los textos visibles están en
// lib/i18n/diccionarios. Antes: filtros y textos (probado en
// tests/lugares-chicos.test.ts). Los datos y las reglas de horarios son los
// de @qps/core/lugares/permanentes, los mismos que la web.
import {
  ETIQUETA_TIPO,
  abiertoAhora,
  textoDistancia,
  type TipoLugarPermanente,
} from '@qps/core/lugares/permanentes'
import { ordenarPorDistancia, type LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'


export interface FiltrosLugares {
  tipo: TipoLugarPermanente | null
  gratis: boolean
  abiertoAhora: boolean
}

export const SIN_FILTROS_LUGARES: FiltrosLugares = { tipo: null, gratis: false, abiertoAhora: false }

export function filtrarLugares(lugares: readonly LugarChicosMapa[], filtros: FiltrosLugares, ahora: Date): LugarChicosMapa[] {
  return lugares.filter(
    (l) =>
      (filtros.tipo === null || l.tipo === filtros.tipo) &&
      (!filtros.gratis || l.acceso === 'gratis') &&
      (!filtros.abiertoAhora || abiertoAhora(l.horarios, ahora)),
  )
}

export type OrigenLugares = { tipo: 'ubicacion'; lat: number; lng: number } | { tipo: 'barrio'; id: string; nombre: string; lat: number; lng: number }

/** Filtra y, con un origen, ordena por distancia. */
export function lugaresParaMostrar(
  lugares: readonly LugarChicosMapa[],
  filtros: FiltrosLugares,
  origen: OrigenLugares | null,
  ahora: Date,
): (LugarChicosMapa & { metros: number | null })[] {
  return ordenarPorDistancia(filtrarLugares(lugares, filtros, ahora), origen)
}

/** «Pelotero · a 850 m en línea recta» (o en inglés, Q5-11). */
export function subtituloLugar(lugar: LugarChicosMapa & { metros: number | null }, idioma: 'es' | 'en' = 'es'): string {
  const tipo = ETIQUETA_TIPO[idioma][lugar.tipo]
  return lugar.metros === null ? tipo : `${tipo} · ${textoDistancia(lugar.metros, idioma)}`
}

/** El conteo que se anuncia y se ve: «3 lugares», «1 lugar», «Ningún lugar con estos filtros». */
export function textoConteoLugares(cantidad: number): string {
  if (cantidad === 0) return 'Ningún lugar con estos filtros'
  return cantidad === 1 ? '1 lugar' : `${cantidad} lugares`
}

/** «dd/mm/aaaa» de una fecha ISO, en hora de Salta. */
export function fechaVerificado(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

/** Ruta de la ficha de un lugar en la app. */
export function rutaLugarChicos(venueId: string): string {
  return `/lugares-chicos/${venueId}`
}
