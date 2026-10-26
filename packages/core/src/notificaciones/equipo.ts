/**
 * "Aviso del equipo" (Ronda 70, tarea 70-b): un push manual que el admin manda
 * desde /admin/avisos a quien tiene prendido «Avisos de Qué Pinta Salta»
 * (`announcements`). Puro: sin React, sin Supabase, sin `fetch`, sin
 * `process.env` y sin `new Date()` adentro (el reloj entra por parámetro, igual
 * criterio que `./reglas`, `./tanda` y `./patrocinados`).
 *
 * Reglas: como mucho 1 aviso del equipo por día de Salta (global), solo a
 * quien lo prendió (sin fila de preferencias = default `false` = no entra),
 * fuera de su horario de silencio, con lugar en su `daily_cap` y sin haberlo
 * recibido ya hoy. Nunca se parece a un aviso patrocinado: el título no puede
 * empezar con "Patrocinado" y el `data` nunca lleva `tipo: 'patrocinado'` ni
 * `categoryId`.
 */
import { esUuid } from '../radar/preferencias'
import { normalizeFilterText } from '../home/filters'
import { formatSaltaDayKey } from '../date-format'
import { urlEvento } from '../metricas/links'
import {
  claveDedupe,
  contarEnviosDelDiaSalta,
  estaEnHorarioDeSilencio,
  hayLugarEnTopeDiario,
  type EnvioRegistradoParaTope,
} from './reglas'
import type { PreferenciasNotificacion } from './preferencias'

export const LARGO_MAXIMO_TITULO_EQUIPO = 50
export const LARGO_MAXIMO_CUERPO_EQUIPO = 120

/**
 * `data.destino` de un push que abre la pantalla de Cines. La app lo compara
 * con `===` (`apps/mobile/lib/push/tap.ts` exporta el mismo valor como
 * `DESTINO_CINES`, importado de acá: es la fuente única).
 */
export const DESTINO_CINES = 'cines'

export type DestinoAvisoEquipo =
  | { tipo: 'inicio' }
  | { tipo: 'cines' }
  | { tipo: 'evento'; eventId: string }

export interface ErrorAvisoEquipo {
  campo: string
  mensaje: string
}

export interface AvisoEquipoValidado {
  titulo: string
  cuerpo: string
  destino: DestinoAvisoEquipo
}

export type ResultadoValidacionAvisoEquipo =
  | { ok: true; datos: AvisoEquipoValidado }
  | { ok: false; errores: ErrorAvisoEquipo[] }

// Cualquier carácter de control (incluidos salto de línea y tabulación) o DEL.
// Armado con los códigos para no dejar caracteres invisibles en el fuente.
const CARACTERES_DE_CONTROL_RE = new RegExp(
  `[${String.fromCharCode(0x00)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`,
)

// Caracteres de formato invisibles (U+200B, marcas bidi, etc.).
const CARACTERES_DE_FORMATO_RE = /\p{Cf}/u

function campoDe(entrada: unknown, campo: string): unknown {
  if (typeof entrada !== 'object' || entrada === null) return undefined
  return (entrada as Record<string, unknown>)[campo]
}

function validarTexto(
  valorCrudo: unknown,
  campo: string,
  nombre: string,
  largoMaximo: number,
  errores: ErrorAvisoEquipo[],
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
  if (CARACTERES_DE_FORMATO_RE.test(texto)) {
    errores.push({ campo, mensaje: `${nombre} no puede tener caracteres invisibles.` })
    return null
  }
  return texto
}

function validarDestino(crudo: unknown, errores: ErrorAvisoEquipo[]): DestinoAvisoEquipo | null {
  if (crudo === undefined || crudo === null) return { tipo: 'inicio' }
  const tipo = campoDe(crudo, 'tipo')
  if (tipo === 'inicio') return { tipo: 'inicio' }
  if (tipo === 'cines') return { tipo: 'cines' }
  if (tipo === 'evento') {
    const eventId = campoDe(crudo, 'eventId')
    if (!esUuid(eventId)) {
      errores.push({ campo: 'eventId', mensaje: 'El evento tiene que ser un id válido.' })
      return null
    }
    return { tipo: 'evento', eventId }
  }
  errores.push({ campo: 'destino', mensaje: 'El destino no es válido.' })
  return null
}

/** Valida el aviso ANTES de probarlo o mandarlo. Devuelve todos los errores, no solo el primero. */
export function validarAvisoEquipo(entrada: unknown): ResultadoValidacionAvisoEquipo {
  const errores: ErrorAvisoEquipo[] = []

  const titulo = validarTexto(campoDe(entrada, 'titulo'), 'titulo', 'El título', LARGO_MAXIMO_TITULO_EQUIPO, errores)
  const cuerpo = validarTexto(campoDe(entrada, 'cuerpo'), 'cuerpo', 'El texto', LARGO_MAXIMO_CUERPO_EQUIPO, errores)

  // Que un aviso del equipo nunca se confunda con publicidad.
  if (titulo !== null && normalizeFilterText(titulo).startsWith('patrocinado')) {
    errores.push({ campo: 'titulo', mensaje: 'El título no puede empezar con "Patrocinado".' })
  }
  if (cuerpo !== null && normalizeFilterText(cuerpo).startsWith('patrocinado')) {
    errores.push({ campo: 'cuerpo', mensaje: 'El texto no puede empezar con "Patrocinado".' })
  }

  const destino = validarDestino(campoDe(entrada, 'destino'), errores)

  if (errores.length > 0 || titulo === null || cuerpo === null || destino === null) {
    return { ok: false, errores }
  }
  return { ok: true, datos: { titulo, cuerpo, destino } }
}

/**
 * El `data` del push según el destino. Evento: `{ url }` con el mismo formato
 * que `./tanda` (la app ya sabe abrirlo). Cines: `{ destino: 'cines' }`.
 * Inicio: `undefined` (sin data, abre la app). Nunca `tipo` ni `categoryId`.
 */
export function datosPushAvisoEquipo(destino: DestinoAvisoEquipo): Record<string, unknown> | undefined {
  if (destino.tipo === 'evento') {
    const url = urlEvento(destino.eventId, 'app')
    return url ? { url } : undefined
  }
  if (destino.tipo === 'cines') return { destino: DESTINO_CINES }
  return undefined
}

/** `notification_sends.dedupe_key` del aviso del equipo de `userId` en el día de Salta de `ahora`. */
export function claveDedupeAvisoEquipo(userId: string, ahora: Date): string {
  return claveDedupe({ kind: 'anuncio', userId, extra: formatSaltaDayKey(ahora) })
}

/** Tope global: 1 aviso del equipo por día de Salta. `enviosAnuncio` son los `notification_sends` con `kind = 'anuncio'`. */
export function yaHuboAvisoEquipoHoy(enviosAnuncio: EnvioRegistradoParaTope[], ahora: Date): boolean {
  return contarEnviosDelDiaSalta(enviosAnuncio, ahora) >= 1
}

export interface UsuarioParaAvisoEquipo {
  userId: string
  /** `null` si no tiene fila en `notification_preferences`: default `announcements: false`, no entra. */
  preferencias: PreferenciasNotificacion | null
  tokens: string[]
  enviosRegistrados: { dedupe_key: string; sent_at: string | Date }[]
}

export interface MensajeAvisoEquipo {
  userId: string
  to: string
  dedupeKey: string
}

export interface ResumenAvisoEquipo {
  personas: number
  telefonos: number
  excluidos: { sinPermiso: number; silencio: number; tope: number; yaRecibio: number }
}

/** A quién le toca el aviso del equipo ahora: un mensaje por token y un resumen de conteos (sin ids ni tokens). */
export function destinatariosAvisoEquipo(
  usuarios: UsuarioParaAvisoEquipo[],
  ahora: Date,
): { mensajes: MensajeAvisoEquipo[]; resumen: ResumenAvisoEquipo } {
  const excluidos = { sinPermiso: 0, silencio: 0, tope: 0, yaRecibio: 0 }
  const mensajes: MensajeAvisoEquipo[] = []
  let personas = 0

  for (const usuario of usuarios) {
    if (usuario.tokens.length === 0) continue

    const prefs = usuario.preferencias
    if (prefs?.announcements !== true) {
      excluidos.sinPermiso += 1
      continue
    }

    const dedupeKey = claveDedupeAvisoEquipo(usuario.userId, ahora)
    if (usuario.enviosRegistrados.some((envio) => envio.dedupe_key === dedupeKey)) {
      excluidos.yaRecibio += 1
      continue
    }
    if (estaEnHorarioDeSilencio(ahora, prefs)) {
      excluidos.silencio += 1
      continue
    }
    if (!hayLugarEnTopeDiario(contarEnviosDelDiaSalta(usuario.enviosRegistrados, ahora), prefs.daily_cap)) {
      excluidos.tope += 1
      continue
    }

    personas += 1
    for (const to of usuario.tokens) mensajes.push({ userId: usuario.userId, to, dedupeKey })
  }

  return { mensajes, resumen: { personas, telefonos: mensajes.length, excluidos } }
}
