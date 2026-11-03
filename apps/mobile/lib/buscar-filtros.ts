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
//
// Ronda de correcciones de A3: con Infantil elegida no se repite "para
// chicos" ("3 eventos en Infantil"), como ya hace la portada: todo Infantil
// es para chicos. Por eso los filtros llevan también el slug (`categoria`).
import type { Atajo } from '@qps/core/home/atajos'
import { SLUG_INFANTIL } from '@/lib/para-chicos'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Idioma } from '@/lib/i18n/idioma'
import { textosDe } from '@/lib/i18n/textos'

/** Cómo se nombra cada fecha dentro de una frase ("... · el finde", "... para hoy"). */
// Q6-1: los textos de los conteos viven en el diccionario (`buscar`); las
// frases de fecha son las de la portada (`portada.frases`).
export const NOMBRE_ATAJO: Record<Atajo, string> = es.portada.frases

/** Los filtros de Buscar que entran en los textos. `null` = sin ese filtro. */
export interface FiltrosTextoBuscar {
  texto: string
  soloGratis: boolean
  paraChicos: boolean
  /** Slug de la categoría elegida (para no repetir "para chicos" con Infantil). */
  categoria: string | null
  nombreCategoria: string | null
  atajo: Atajo | null
}

/** Si el texto nombra "para chicos": con el filtro prendido y sin Infantil elegida. */
function nombraParaChicos(f: FiltrosTextoBuscar): boolean {
  return f.paraChicos && f.categoria !== SLUG_INFANTIL
}

/** La línea de conteo arriba de los resultados ("3 eventos gratis para chicos en Teatro · el finde"). */
function partes(f: FiltrosTextoBuscar, idioma: Idioma) {
  return {
    texto: f.texto,
    gratis: f.soloGratis,
    paraChicos: nombraParaChicos(f),
    nombreCategoria: f.nombreCategoria,
    frase: f.atajo ? textosDe(idioma).portada.frases[f.atajo] : null,
  }
}

export function textoResultadosBuscar(cantidad: number, f: FiltrosTextoBuscar, idioma: Idioma = 'es'): string {
  return textosDe(idioma).buscar.resultados(cantidad, partes(f, idioma))
}

/** El texto del vacío de los resultados ("No hay eventos para chicos en Teatro el finde."). */
export function textoSinResultadosBuscar(f: FiltrosTextoBuscar, idioma: Idioma = 'es'): string {
  return textosDe(idioma).buscar.sinResultados(partes(f, idioma))
}
