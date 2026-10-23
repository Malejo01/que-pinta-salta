/**
 * El entorno compartido de los tests de la R58 que cruzan tareas (58-q): un
 * almacén en memoria, la sesión de admin, un `fetch` inventado y un par de
 * semillas. Los `vi.mock` de `@/lib/supabase/server` de cada test lo leen por
 * `await import('./_soporte/entorno')`, así la ruta, las acciones del admin y
 * las páginas hablan con la MISMA base en memoria.
 *
 * Todo inventado: ningún dato real, ningún secreto.
 */
import { vi } from 'vitest'
import {
  clienteAnon,
  clienteServicio,
  clienteSesion,
  crearAlmacen,
  idInventado,
  sembrar,
  type Almacen,
  type ClienteDoble,
  type Fila,
} from './doble-supabase'

export const ADMIN_ID = idInventado(0x99, 1)
export const SECRETO = 'secreto-falso-de-prueba'

type Sesion = { rol: 'admin' | 'usuario'; userId: string } | null

export const entorno: { almacen: Almacen; sesion: Sesion } = {
  almacen: crearAlmacen(),
  sesion: { rol: 'admin', userId: ADMIN_ID },
}

/** Un almacén nuevo, con el perfil del admin de prueba y la sesión de admin abierta. */
export function reiniciar(): Almacen {
  entorno.almacen = crearAlmacen()
  entorno.sesion = { rol: 'admin', userId: ADMIN_ID }
  sembrar(entorno.almacen, 'profiles', [{ id: ADMIN_ID, role: 'ADMIN' }])
  return entorno.almacen
}

/**
 * Con esto en `true`, `createAdminClient()` lanza: sirve para probar que un módulo
 * (las acciones del admin) funciona SIN la service key.
 */
export const prohibiciones = { servicio: false }

/** El cliente de la service key (lo que devuelve `createAdminClient()`). */
export function servicio(): ClienteDoble {
  if (prohibiciones.servicio) throw new Error('La prueba prohíbe usar la service key acá')
  return clienteServicio(entorno.almacen)
}

/** El cliente de la sesión (lo que devuelve `createClient()`). */
export function sesion(): ClienteDoble {
  return entorno.sesion ? clienteSesion(entorno.almacen, entorno.sesion) : clienteAnon(entorno.almacen)
}

// ---------------------------------------------------------------------------
// Reloj y fetch
// ---------------------------------------------------------------------------

/** Fija "ahora" (solo `Date`: los timers reales siguen andando). */
export function fijarAhora(iso: string): void {
  vi.setSystemTime(new Date(iso))
}

export interface ConfigFetch {
  /** El `venta` que contesta dolarapi; `null` = la fuente está caída (503). */
  tipoCambio: number | null
}

function respuesta(status: number, cuerpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as unknown as Response
}

/**
 * Un `fetch` inventado: dolarapi con el tipo de cambio de `config`, y la API de
 * Expo (envío y recibos) siempre bien. Cualquier otra URL lanza: la prueba no
 * puede salir a ninguna parte.
 */
export function crearFetch(config: ConfigFetch) {
  const urls: string[] = []
  const enviadosAExpo: Array<{ to: string; title: string }> = []
  const fn = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entrada)
    urls.push(url)
    if (url.startsWith('https://dolarapi.com/')) {
      if (config.tipoCambio === null) return respuesta(503, {})
      return respuesta(200, { venta: config.tipoCambio, fechaActualizacion: new Date().toISOString() })
    }
    if (url.endsWith('/push/send')) {
      const mensajes = JSON.parse(String(init?.body ?? '[]')) as Array<{ to: string; title: string }>
      enviadosAExpo.push(...mensajes.map((m) => ({ to: m.to, title: m.title })))
      return respuesta(200, { data: mensajes.map((_, i) => ({ status: 'ok', id: `ticket-${urls.length}-${i}` })) })
    }
    if (url.endsWith('/push/getReceipts')) {
      const { ids } = JSON.parse(String(init?.body ?? '{}')) as { ids: string[] }
      return respuesta(200, { data: Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])) })
    }
    throw new Error(`fetch inesperado en la prueba: ${url}`)
  }
  return { fetch: fn, urls, enviadosAExpo }
}

// ---------------------------------------------------------------------------
// Semillas
// ---------------------------------------------------------------------------

export const idEvento = (n: number) => idInventado(0xe0, n)
export const idUsuario = (n: number) => idInventado(0x70, n)
export const ID_CAMPANIA = idInventado(0xc0, 1)

/** Las constantes del escenario del push patrocinado (campaña enviada, bajas, pausa, reanudar). */
export const PUSH = {
  /** Cuándo salió la campaña (18:00 de Salta del 10/12). */
  ENVIADA: '2026-12-10T21:00:00.000Z',
  /** La corrida: 49 h después del envío (20:00 de Salta del 12/12), dentro de la ventana de 48 a 72 h. */
  AHORA: '2026-12-12T23:00:00.000Z',
  EVENTO_PATROCINADO: idEvento(50),
  EVENTO_FAVORITO: idEvento(51),
  USUARIO_A: idUsuario(1001),
  USUARIO_B: idUsuario(1002),
  TOKEN_A: 'ExponentPushToken[de-prueba-a]',
  TOKEN_B: 'ExponentPushToken[de-prueba-b]',
} as const

/**
 * Una campaña patrocinada ya enviada a `destinatarios` personas (ids inventados)
 * y las preferencias de esas personas: `bajasEnVentana` apagaron los avisos
 * patrocinados dentro de las 48 h del envío y `bajasFueraDeVentana` lo hicieron
 * antes del envío o después de las 48 h (no cuentan). Además, dos personas con
 * token que todavía no recibieron la campaña (A, con un favorito que arranca en
 * una hora, y B) para probar el envío.
 */
export function sembrarEscenarioPush(
  almacen: Almacen,
  opciones: { destinatarios?: number; bajasEnVentana: number; bajasFueraDeVentana?: number },
): { usuarios: string[] } {
  const total = opciones.destinatarios ?? 200
  const fuera = opciones.bajasFueraDeVentana ?? 0
  const usuarios: string[] = []
  const envios: Fila[] = []
  const preferencias: Fila[] = []
  for (let i = 1; i <= total; i++) {
    const userId = idUsuario(i)
    usuarios.push(userId)
    envios.push({
      user_id: userId,
      kind: 'patrocinado',
      channel: 'push',
      status: 'SUCCESS',
      dedupe_key: `patrocinado:${userId}:semana-de-prueba`,
      event_id: PUSH.EVENTO_PATROCINADO,
      campaign_id: ID_CAMPANIA,
      sent_at: PUSH.ENVIADA,
    })
    let sponsored = true
    let updatedAt = '2026-11-01T00:00:00.000Z'
    if (i <= opciones.bajasEnVentana) {
      sponsored = false
      updatedAt = '2026-12-11T07:00:00.000Z' // 10 h después del envío
    } else if (i <= opciones.bajasEnVentana + fuera) {
      sponsored = false
      // Mitad antes del envío, mitad pasadas las 48 h: ninguna cuenta.
      updatedAt = i % 2 === 0 ? '2026-12-09T00:00:00.000Z' : '2026-12-12T22:30:00.000Z'
    }
    preferencias.push({
      user_id: userId,
      radar_channel: 'email',
      favorite_reminders: true,
      follow_news: true,
      announcements: false,
      sponsored,
      quiet_start: '23:00:00',
      quiet_end: '09:00:00',
      daily_cap: 4,
      updated_at: updatedAt,
    })
  }
  sembrar(almacen, 'notification_sends', envios)
  sembrar(almacen, 'notification_preferences', preferencias)

  sembrar(almacen, 'events', [
    {
      id: PUSH.EVENTO_PATROCINADO,
      title: 'Evento Patrocinado de Prueba',
      slug: 'evento-patrocinado-de-prueba',
      status: 'PUBLISHED',
      start_date: '2026-12-20T23:00:00.000Z',
      end_date: null,
      featured_set_at: null,
      featured_until: null,
      created_at: '2026-09-01T00:00:00.000Z',
    },
    {
      id: PUSH.EVENTO_FAVORITO,
      title: 'Show de Prueba',
      slug: 'show-de-prueba',
      status: 'PUBLISHED',
      start_date: '2026-12-13T00:00:00.000Z', // 21:00 de Salta, una hora después de la corrida
      end_date: null,
      featured_set_at: null,
      featured_until: null,
      created_at: '2026-09-01T00:00:00.000Z',
    },
  ])
  sembrar(almacen, 'sponsored_campaigns', [
    {
      id: ID_CAMPANIA,
      title: 'Campaña de Prueba',
      body: 'Cuerpo de la campaña de prueba',
      event_id: PUSH.EVENTO_PATROCINADO,
      starts_at: '2026-12-10T00:00:00.000Z',
      ends_at: '2026-12-20T00:00:00.000Z',
      sent_at: PUSH.ENVIADA,
      destinatarios: total,
      bajas_48h: null,
      bajas_medidas_at: null,
      created_by: null,
    },
  ])
  sembrar(almacen, 'push_tokens', [
    { user_id: PUSH.USUARIO_A, token: PUSH.TOKEN_A },
    { user_id: PUSH.USUARIO_B, token: PUSH.TOKEN_B },
  ])
  const prefs = (userId: string): Fila => ({
    user_id: userId,
    radar_channel: 'email',
    favorite_reminders: true,
    follow_news: true,
    announcements: false,
    sponsored: true,
    quiet_start: '23:00:00',
    quiet_end: '09:00:00',
    daily_cap: 4,
    updated_at: '2026-11-01T00:00:00.000Z',
  })
  sembrar(almacen, 'notification_preferences', [prefs(PUSH.USUARIO_A), prefs(PUSH.USUARIO_B)])
  sembrar(almacen, 'user_favorites', [{ id: idInventado(0xf0, 1), user_id: PUSH.USUARIO_A, event_id: PUSH.EVENTO_FAVORITO }])
  return { usuarios }
}

/**
 * `cantidad` eventos destacados hasta `hasta`, publicados, de títulos evidentes
 * ("Evento Destacado de Prueba N").
 */
export function sembrarDestacados(
  almacen: Almacen,
  opciones: { cantidad: number; hasta: string; desde?: string },
): void {
  const filas: Fila[] = []
  for (let i = 1; i <= opciones.cantidad; i++) {
    filas.push({
      id: idEvento(i),
      title: `Evento Destacado de Prueba ${i}`,
      slug: `evento-destacado-de-prueba-${i}`,
      status: 'PUBLISHED',
      start_date: '2027-01-15T23:00:00.000Z',
      end_date: null,
      featured_set_at: opciones.desde ?? '2026-10-30T12:00:00.000Z',
      featured_until: opciones.hasta,
      created_at: '2026-09-01T00:00:00.000Z',
    })
  }
  sembrar(almacen, 'events', filas)
}
