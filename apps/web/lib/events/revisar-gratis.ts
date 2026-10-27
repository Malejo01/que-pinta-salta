// Revisión de `is_free` de los eventos ya cargados (Ronda 68-b). Puro: sin red ni base.
// Decide, con el detector de `@qps/core/events/gratis`, qué eventos futuros marcados como no gratis
// y sin precio positivo tienen evidencia de entrada gratuita en su texto. No lleva datos personales.

import { detectarGratis, type DeteccionGratis } from '@qps/core/events/gratis'

export type FilaRevisarGratis = {
  id: string
  title: string | null
  slug: string | null
  description: string | null
  short_description: string | null
  start_date: string
  price_min: number | null
  is_free: boolean | null
  status: string | null
  scrape_source_key: string | null
  ai_metadata: unknown
}

export type CambioGratis = {
  id: string
  slug: string | null
  titulo: string | null
  fecha: string
  fuente: string
  frase: string
  price_min: number | null
}

export type ResumenRevision = {
  candidatas: number
  cambian: number
  sinEvidencia: number
  conCondicion: number
  /** Cantidad de candidatas con condición, por id de condición. */
  porCondicion: Record<string, number>
  /** Cantidad de candidatas y de cambios, por fuente. */
  porFuente: Record<string, { candidatas: number; cambian: number }>
}

/** Candidata con una frase de gratuidad pero descartada por una condición: para que Mauro la audite. */
export type DescartadoPorCondicion = {
  id: string
  slug: string | null
  condicion: string
  frase: string | null
}

export type ReporteRevision = {
  cambios: CambioGratis[]
  descartados: DescartadoPorCondicion[]
  resumen: ResumenRevision
}

/**
 * Texto seguro para imprimir en consola: saltos de línea a espacio y caracteres de control a `?`
 * (el título, el slug y la frase vienen de contenido externo: no pueden mover el cursor ni colar escapes).
 */
export function limpiarParaImprimir(texto: string | null | undefined): string {
  if (typeof texto !== 'string') return ''
  return texto.replace(/\r\n|\r|\n/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '?')
}

export const FUENTE_DESCONOCIDA = '(sin fuente)'

/**
 * Candidata: publicada, empieza ahora o después, no está marcada gratis y el precio es 0 o falta.
 * Solo `PUBLISHED`: los borradores los revisa el admin al publicar.
 */
export function esCandidata(fila: FilaRevisarGratis, ahora: Date): boolean {
  if (fila.status !== 'PUBLISHED') return false
  const inicio = Date.parse(fila.start_date)
  if (Number.isNaN(inicio) || inicio < ahora.getTime()) return false
  if (fila.is_free !== false) return false
  return fila.price_min === 0 || fila.price_min === null
}

/** `ai_metadata.original_caption` si es string; tolera null, arrays, primitivos y otras formas. */
export function captionOriginal(aiMetadata: unknown): string | null {
  if (aiMetadata === null || typeof aiMetadata !== 'object' || Array.isArray(aiMetadata)) return null
  const caption = (aiMetadata as Record<string, unknown>).original_caption
  return typeof caption === 'string' ? caption : null
}

/** Aplica `detectarGratis` a título, descripciones y caption original. */
export function evaluarFila(fila: FilaRevisarGratis): DeteccionGratis {
  return detectarGratis(fila.title, fila.description, fila.short_description, captionOriginal(fila.ai_metadata))
}

export function armarReporte(filas: FilaRevisarGratis[], ahora: Date): ReporteRevision {
  const cambios: CambioGratis[] = []
  const descartados: DescartadoPorCondicion[] = []
  const resumen: ResumenRevision = {
    candidatas: 0,
    cambian: 0,
    sinEvidencia: 0,
    conCondicion: 0,
    porCondicion: {},
    porFuente: {},
  }

  for (const fila of filas) {
    if (!esCandidata(fila, ahora)) continue
    const fuente = fila.scrape_source_key || FUENTE_DESCONOCIDA
    const porFuente = (resumen.porFuente[fuente] ??= { candidatas: 0, cambian: 0 })
    resumen.candidatas += 1
    porFuente.candidatas += 1

    const deteccion = evaluarFila(fila)
    if (deteccion.gratis) {
      resumen.cambian += 1
      porFuente.cambian += 1
      cambios.push({
        id: fila.id,
        slug: fila.slug,
        titulo: fila.title,
        fecha: fila.start_date,
        fuente,
        frase: deteccion.frase,
        price_min: fila.price_min,
      })
    } else if (deteccion.motivo === 'condicion') {
      resumen.conCondicion += 1
      descartados.push({ id: fila.id, slug: fila.slug, condicion: deteccion.condicion, frase: deteccion.frase })
      resumen.porCondicion[deteccion.condicion] = (resumen.porCondicion[deteccion.condicion] ?? 0) + 1
    } else {
      resumen.sinEvidencia += 1
    }
  }

  return { cambios, descartados, resumen }
}
