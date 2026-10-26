/**
 * Avisos push patrocinados (D2/Ronda 51, tarea 51-a): validación de la
 * campaña que carga el panel admin y resolución de cuál está vigente. Puro:
 * sin React, sin Supabase, sin `fetch`, sin `process.env`, y sin `new Date()`
 * adentro (todo lo que depende del reloj entra como `ahora: Date` por
 * parámetro, igual criterio que `./reglas` y `./tanda`).
 *
 * Quien manda de verdad las campañas (consulta/escribe `sponsored_campaigns`,
 * decide a quién le toca un aviso) es otra capa (51-b/51-c, panel admin y
 * `apps/web/lib/notificaciones/`); este archivo solo valida y decide.
 */
import { esUuid } from '../radar/preferencias'
import { normalizeFilterText } from '../home/filters'
import { urlEvento, type MetricOrigin } from '../metricas/links'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Prefijo del título del aviso push (ver `tituloAvisoPatrocinado`). */
export const ETIQUETA_PATROCINADO = 'Patrocinado'

/**
 * `MensajeTanda.categoryId` de un aviso patrocinado: la categoría de
 * notificación de Expo (`setNotificationCategoryAsync`, lado app), la que
 * engancha la acción de baja rápida. NO es una columna de `notification_sends`
 * (esa tabla no tiene `category_id`; lo que sí tiene es `campaign_id`, ver
 * `MensajeDeTanda.campaignId`).
 */
export const CATEGORIA_PATROCINADO = 'patrocinado'

/** Acción de la categoría de notificación de Expo para la baja rápida desde el push mismo (51-c/51-d). */
export const ACCION_BAJA_PATROCINADOS = 'baja-patrocinados'

/** Texto del botón de baja rápida en el push (51-c/51-d). */
export const TEXTO_BOTON_BAJA = 'No recibir más'

/** Largo máximo del título de la campaña, en caracteres (ya recortado con `trim`). */
export const LARGO_MAXIMO_TITULO = 50

/** Largo máximo del cuerpo de la campaña, en caracteres (ya recortado con `trim`). */
export const LARGO_MAXIMO_CUERPO = 150

/** Ventana máxima de una campaña, en días (ver `validarCampania`). */
export const DIAS_MAXIMOS_VENTANA = 7

const LARGO_MAXIMO_URL = 2048
const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Política de Ads de Google Play
 * (https://support.google.com/googleplay/android-developer/answer/9857753):
 * un anuncio no puede imitar una notificación del sistema o de la interfaz
 * (alertas de seguridad, actualizaciones, mensajes del sistema operativo).
 * Estas palabras, si aparecen en el título o el cuerpo de la campaña, la
 * rechazan. La comparación no distingue mayúsculas ni tildes
 * (`normalizeFilterText`, de `../home/filters`): "Actualización", "ACTUALIZACION"
 * y "actualizacion" matchean igual.
 */
export const PALABRAS_QUE_IMITAN_AL_SISTEMA = [
  'actualización',
  'seguridad',
  'tu cuenta',
  'google',
  'android',
  'sistema',
  'alerta',
  'urgente',
]

// Cualquier carácter de control (incluidos salto de línea, retorno de carro y
// tabulación) o DEL (U+007F). Armado con los códigos, no con un rango
// literal, para no dejar caracteres invisibles en el fuente.
const CARACTERES_DE_CONTROL_RE = new RegExp(
  `[${String.fromCharCode(0x00)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`,
)

const HTTPS_RE = /^https:\/\//

// ---------------------------------------------------------------------------
// Validación de texto
// ---------------------------------------------------------------------------

function contienePalabraProhibida(texto: string): boolean {
  const normalizado = normalizeFilterText(texto)
  return PALABRAS_QUE_IMITAN_AL_SISTEMA.some((palabra) => normalizado.includes(normalizeFilterText(palabra)))
}

function validarTexto(
  valorCrudo: unknown,
  campo: string,
  nombre: string,
  largoMaximo: number,
  errores: ErrorCampania[],
): string | null {
  if (typeof valorCrudo !== 'string') {
    errores.push({ campo, mensaje: `${nombre} tiene que ser texto.` })
    return null
  }

  const texto = valorCrudo.trim()

  if (texto.length === 0) {
    errores.push({ campo, mensaje: `${nombre} no puede estar vacío.` })
    return null
  }
  if (texto.length > largoMaximo) {
    errores.push({ campo, mensaje: `${nombre} no puede superar los ${largoMaximo} caracteres.` })
    return null
  }
  if (CARACTERES_DE_CONTROL_RE.test(texto)) {
    errores.push({ campo, mensaje: `${nombre} no puede tener saltos de línea ni caracteres de control.` })
    return null
  }
  if (contienePalabraProhibida(texto)) {
    errores.push({
      campo,
      mensaje: `${nombre} no puede imitar una notificación del sistema o de la interfaz (política de Ads de Google Play).`,
    })
    return null
  }

  return texto
}

// ---------------------------------------------------------------------------
// Validación de fechas
// ---------------------------------------------------------------------------

function parsearFecha(valor: unknown): Date | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor
  }
  if (typeof valor === 'string' || typeof valor === 'number') {
    const fecha = new Date(valor)
    return Number.isNaN(fecha.getTime()) ? null : fecha
  }
  return null
}

// ---------------------------------------------------------------------------
// validarCampania
// ---------------------------------------------------------------------------

export interface ErrorCampania {
  campo: string
  mensaje: string
}

export interface CampaniaValidada {
  titulo: string
  cuerpo: string
  eventId: string
  url: string | null
  startsAt: Date
  endsAt: Date
}

export type ResultadoValidacionCampania =
  | { ok: true; datos: CampaniaValidada }
  | { ok: false; errores: ErrorCampania[] }

/**
 * Ventana de vigencia de una campaña, lo mínimo para chequear cruces
 * (`validarCampania`) y para resolver la vigente (`campaniaVigente`).
 */
export interface VentanaCampania {
  id: string
  startsAt: Date
  endsAt: Date
}

function obtenerCampo(entrada: unknown, campo: string): unknown {
  if (typeof entrada !== 'object' || entrada === null) return undefined
  return (entrada as Record<string, unknown>)[campo]
}

function validarTextosEnErrores(
  entrada: unknown,
  errores: ErrorCampania[],
): { titulo: string | null; cuerpo: string | null } {
  const titulo = validarTexto(obtenerCampo(entrada, 'titulo'), 'titulo', 'El título', LARGO_MAXIMO_TITULO, errores)
  const cuerpo = validarTexto(obtenerCampo(entrada, 'cuerpo'), 'cuerpo', 'El cuerpo', LARGO_MAXIMO_CUERPO, errores)
  return { titulo, cuerpo }
}

export type ResultadoValidacionTextosCampania =
  | { ok: true; titulo: string; cuerpo: string }
  | { ok: false; errores: ErrorCampania[] }

/**
 * Valida solo título y cuerpo, con las mismas reglas que `validarCampania`
 * (que usa esta misma lógica por dentro). Sirve para la prueba "Enviarme una
 * prueba", que no tiene fechas.
 */
export function validarTextosCampania(entrada: unknown): ResultadoValidacionTextosCampania {
  const errores: ErrorCampania[] = []
  const { titulo, cuerpo } = validarTextosEnErrores(entrada, errores)
  if (errores.length > 0 || titulo === null || cuerpo === null) return { ok: false, errores }
  return { ok: true, titulo, cuerpo }
}

/**
 * Valida una campaña patrocinada ANTES de guardarla (panel admin, 51-b/51-c).
 * Devuelve TODOS los errores que encuentra, no solo el primero: quien llama
 * le puede mostrar al admin la lista completa de una.
 *
 * Más estricto que el contrato de la base
 * (`supabase/migrations/20261018130200_etapa2_campanias_patrocinadas.sql`):
 * ahí `event_id` es opcional (alcanza con `url` o `event_id`) y la url puede
 * ser `http://`; acá `eventId` es OBLIGATORIO (un aviso patrocinado siempre
 * lleva a una ficha propia, nunca solo a una url externa) y la `url`, si
 * viene, tiene que ser `https://`. Es una decisión de esta ronda, no un
 * reflejo de la base.
 *
 * El cruce con `otras` usa intervalos SEMIABIERTOS `[startsAt, endsAt)`: que
 * el `endsAt` de una campaña sea EXACTAMENTE el `startsAt` de otra no es
 * cruce (la primera ya terminó cuando arranca la segunda). Por eso la
 * comparación es con `<`/`>` estrictos y no con `<=`/`>=`.
 */
export function validarCampania(
  entrada: unknown,
  ahora: Date,
  otras: VentanaCampania[],
): ResultadoValidacionCampania {
  const errores: ErrorCampania[] = []

  const { titulo, cuerpo } = validarTextosEnErrores(entrada, errores)

  const eventIdCrudo = obtenerCampo(entrada, 'eventId')
  const eventId = esUuid(eventIdCrudo) ? eventIdCrudo : null
  if (!eventId) {
    errores.push({ campo: 'eventId', mensaje: 'El evento es obligatorio y tiene que ser un id válido.' })
  }

  const urlCrudo = obtenerCampo(entrada, 'url')
  let url: string | null = null
  if (urlCrudo !== null && urlCrudo !== undefined) {
    if (typeof urlCrudo !== 'string' || !HTTPS_RE.test(urlCrudo) || urlCrudo.length > LARGO_MAXIMO_URL) {
      errores.push({
        campo: 'url',
        mensaje: `La url, si se completa, tiene que empezar con "https://" y no superar los ${LARGO_MAXIMO_URL} caracteres.`,
      })
    } else {
      url = urlCrudo
    }
  }

  const startsAt = parsearFecha(obtenerCampo(entrada, 'startsAt'))
  const endsAt = parsearFecha(obtenerCampo(entrada, 'endsAt'))

  if (!startsAt) errores.push({ campo: 'startsAt', mensaje: 'La fecha de inicio no es una fecha válida.' })
  if (!endsAt) errores.push({ campo: 'endsAt', mensaje: 'La fecha de fin no es una fecha válida.' })

  if (startsAt && endsAt) {
    if (startsAt.getTime() >= endsAt.getTime()) {
      errores.push({ campo: 'endsAt', mensaje: 'La fecha de fin tiene que ser posterior a la fecha de inicio.' })
    } else {
      const dias = (endsAt.getTime() - startsAt.getTime()) / MS_POR_DIA
      if (dias < 1 || dias > DIAS_MAXIMOS_VENTANA) {
        errores.push({
          campo: 'endsAt',
          mensaje: `La ventana de la campaña tiene que ser de 1 a ${DIAS_MAXIMOS_VENTANA} días.`,
        })
      }
    }

    if (endsAt.getTime() <= ahora.getTime()) {
      errores.push({ campo: 'endsAt', mensaje: 'La fecha de fin tiene que ser futura.' })
    }

    const cruza = otras.some(
      (otra) => startsAt.getTime() < otra.endsAt.getTime() && endsAt.getTime() > otra.startsAt.getTime(),
    )
    if (cruza) {
      errores.push({
        campo: 'startsAt',
        mensaje: 'La ventana de la campaña se superpone con otra campaña ya cargada.',
      })
    }
  }

  if (errores.length > 0 || titulo === null || cuerpo === null || !eventId || !startsAt || !endsAt) {
    return { ok: false, errores }
  }

  return {
    ok: true,
    datos: {
      titulo,
      cuerpo,
      eventId,
      url,
      startsAt,
      endsAt,
    },
  }
}

// ---------------------------------------------------------------------------
// campaniaVigente
// ---------------------------------------------------------------------------

/**
 * La campaña vigente en el instante `ahora`: la que cumple `startsAt <=
 * ahora < endsAt` (el mismo intervalo semiabierto que usa `validarCampania`
 * para los cruces). Si hay más de una (no debería pasar nunca: `validarCampania`
 * las rechaza si se superponen), se elige de forma determinista: la de
 * `startsAt` más temprano, y a igualdad, la de `id` menor (orden de string).
 * `null` si no hay ninguna vigente.
 *
 * No muta `campanias`: filtra (que ya da un array nuevo) y ordena ESE array
 * nuevo, nunca el que recibió.
 */
export function campaniaVigente<T extends VentanaCampania>(campanias: T[], ahora: Date): T | null {
  const momento = ahora.getTime()
  const vigentes = campanias.filter((c) => c.startsAt.getTime() <= momento && momento < c.endsAt.getTime())

  if (vigentes.length === 0) return null

  const ordenadas = vigentes.sort((a, b) => {
    const diff = a.startsAt.getTime() - b.startsAt.getTime()
    if (diff !== 0) return diff
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return ordenadas[0]
}

// ---------------------------------------------------------------------------
// Título del aviso
// ---------------------------------------------------------------------------

/** Título final del push: la etiqueta "Patrocinado" bien visible, antes del título de la campaña. */
export function tituloAvisoPatrocinado(titulo: string): string {
  return `${ETIQUETA_PATROCINADO} · ${titulo}`
}

const ORIGEN_AVISO: MetricOrigin = 'app'

export interface ContenidoAvisoPatrocinado {
  title: string
  body: string
  categoryId: string
  data: { url: string; tipo: string }
}

/**
 * Contenido del push patrocinado: lo comparten el envío real (`armarTanda`) y
 * la prueba del admin. `null` si `eventId` no resuelve un link válido (un
 * aviso patrocinado sin ficha a la que ir no se manda).
 */
export function contenidoAvisoPatrocinado(campania: {
  titulo: string
  cuerpo: string
  eventId: string
}): ContenidoAvisoPatrocinado | null {
  const url = urlEvento(campania.eventId, ORIGEN_AVISO)
  if (!url) return null
  return {
    title: tituloAvisoPatrocinado(campania.titulo),
    body: campania.cuerpo,
    categoryId: CATEGORIA_PATROCINADO,
    // `tipo` con la misma constante que `categoryId` (ver el respaldo de
    // `esAvisoPatrocinado` en `apps/mobile/lib/push/tap.ts`).
    data: { url, tipo: CATEGORIA_PATROCINADO },
  }
}
