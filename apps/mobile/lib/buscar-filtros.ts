// A3 (nube Q1): los textos del conteo y del vacío de Buscar
// (`app/(tabs)/buscar.tsx`), movidos acá tal cual estaban (R66, 66-b) para
// sumarles "Para chicos" y poder probarlos con Vitest
// (`tests/para-chicos.test.ts`): `buscar.tsx` arrastra React Native y no se
// puede importar en los tests.
//
// "Para chicos" se nombra igual que "Solo gratis": en el conteo y en el vacío
// sin texto ("3 eventos gratis para chicos en Teatro · el finde", "No hay
// eventos para chicos el finde."); con texto, como "Solo gratis", no se nombra
// (el chip prendido está a la vista, justo arriba). Con "para chicos" la fecha
// del vacío va sin el segundo "para" ("para chicos el finde", no "para chicos
// para el finde").
import type { Atajo } from '@qps/core/home/atajos'

/** Cómo se nombra cada fecha dentro de una frase ("... · el finde", "... para hoy"). */
export const NOMBRE_ATAJO: Record<Atajo, string> = {
  hoy: 'hoy',
  'esta-noche': 'esta noche',
  finde: 'el finde',
  semana: 'esta semana',
}

/** Los filtros de Buscar que entran en los textos. `null` = sin ese filtro. */
export interface FiltrosTextoBuscar {
  texto: string
  soloGratis: boolean
  paraChicos: boolean
  nombreCategoria: string | null
  atajo: Atajo | null
}

/** La línea de conteo arriba de los resultados ("3 eventos gratis para chicos en Teatro · el finde"). */
export function textoResultadosBuscar(cantidad: number, f: FiltrosTextoBuscar): string {
  const plural = cantidad !== 1 ? 's' : ''
  const enCategoria = f.nombreCategoria ? ` en ${f.nombreCategoria}` : ''
  const sufijoFecha = f.atajo ? ` · ${NOMBRE_ATAJO[f.atajo]}` : ''
  if (f.texto) return `${cantidad} resultado${plural} para "${f.texto}"${enCategoria}${sufijoFecha}`
  const gratis = f.soloGratis ? ' gratis' : ''
  const chicos = f.paraChicos ? ' para chicos' : ''
  return `${cantidad} evento${plural}${gratis}${chicos}${enCategoria}${sufijoFecha}`
}

/** El texto del vacío de los resultados ("No hay eventos para chicos en Teatro el finde."). */
export function textoSinResultadosBuscar(f: FiltrosTextoBuscar): string {
  const enCategoria = f.nombreCategoria ? ` en ${f.nombreCategoria}` : ''
  if (f.texto) {
    const sufijoFecha = f.atajo ? ` · ${NOMBRE_ATAJO[f.atajo]}` : ''
    return `No se encontraron eventos para "${f.texto}"${enCategoria}${sufijoFecha}`
  }
  const gratis = f.soloGratis ? ' gratis' : ''
  if (f.paraChicos) {
    const cuando = f.atajo ? ` ${NOMBRE_ATAJO[f.atajo]}` : ' por ahora'
    return `No hay eventos${gratis} para chicos${enCategoria}${cuando}.`
  }
  const cuando = f.atajo ? ` para ${NOMBRE_ATAJO[f.atajo]}` : ' por ahora'
  return `No hay eventos${gratis}${enCategoria}${cuando}.`
}
