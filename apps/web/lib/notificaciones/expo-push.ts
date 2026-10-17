/**
 * Cliente HTTP de la API de Expo Push (tarea 39-c), sin el SDK
 * (`expo-server-sdk`): dos `POST` planos con `fetch`. Lo usa la ruta que
 * manda las notificaciones (tarea 39-d) para avisarle a la gente que sigue
 * un venue o tiene favoritos próximos.
 *
 * Forma real de la API (no hay SDK acá para chequearla contra algo, así que
 * queda documentada: si Expo la cambia, hay que actualizar esto y los tests):
 *
 *  `POST https://exp.host/--/api/v2/push/send`
 *    body: `Array<{ to, title?, body?, data? }>`.
 *    responde `{ data: Ticket[] }`: un ticket por mensaje, EN EL MISMO ORDEN
 *    en que se mandó el array. `Ticket = { status: 'ok', id } | { status:
 *    'error', message, details?: { error?: string } }`. El
 *    `DeviceNotRegistered` viene en `details.error`.
 *
 *  `POST https://exp.host/--/api/v2/push/getReceipts`
 *    body: `{ ids: string[] }` (ids de tickets, no tokens).
 *    responde `{ data: Record<string, Receipt> }`: un OBJETO indexado por id
 *    de ticket, no un array. `Receipt` tiene la misma forma que `Ticket` pero
 *    sin `id`.
 *
 *  Las dos pueden devolver además `{ errors: [...] }` a nivel de la request
 *  entera (por ejemplo un HTTP 400 por un body mal formado): acá se trata
 *  como que todo el lote falló, sin tirar.
 *
 * El `to` no vuelve en la respuesta de `/send`: la única forma de saber qué
 * token generó qué ticket es la posición dentro del lote mandado. Por eso
 * `enviarLote` devuelve los tickets ya emparejados con su token
 * (`TicketConToken`) en vez de dejarle ese cruce a quien la llama: es el
 * lugar donde, si un lote se desalinea, se termina borrando el token de
 * alguien que sí está registrado.
 *
 * Nada de esto habla con Supabase. El borrado de tokens en `push_tokens` lo
 * hace la ruta que llama a este módulo.
 */

/** Mensaje de entrada, ya sin el token validado (eso lo hace `enviarLote`). */
export type MensajePush = {
  to: string
  title?: string
  body?: string
  data?: Record<string, unknown>
}

export type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } }

export type ExpoPushReceipt =
  | { status: 'ok' }
  | { status: 'error'; message: string; details?: { error?: string } }

/**
 * Un ticket (o `null` si el lote entero falló antes de que Expo llegue a
 * procesar el mensaje: timeout, error de red, HTTP de error o `errors[]`)
 * emparejado con el token que lo generó, por posición dentro del lote.
 */
export type TicketConToken = {
  token: string
  ticket: ExpoPushTicket | null
}

export type ResultadoEnvioPush = {
  /** Un elemento por mensaje con token válido que se intentó mandar. */
  tickets: TicketConToken[]
  /** Mensajes descartados antes de mandar por no tener forma de token de Expo. */
  descartados: number
  /**
   * Un string por lote que falló entero (timeout, red, HTTP, `errors[]`).
   * Nunca incluyen el token ni el contenido crudo de la respuesta de Expo:
   * son seguros para loguear tal cual.
   */
  erroresLote: string[]
}

export type ResultadoReceipts = {
  /** Receipt por id de ticket, tal cual los indexa Expo. Vacío si la lectura falló entera. */
  receipts: Record<string, ExpoPushReceipt>
  /** Igual que en `ResultadoEnvioPush`: seguros para loguear. */
  erroresLote: string[]
}

/** Hasta cuántos mensajes manda Expo por llamada a `/send`. */
export const EXPO_PUSH_BATCH_SIZE = 100

/**
 * Cuánto esperamos la respuesta de Expo antes de abortar, con
 * `AbortSignal.timeout` (no hace falta armar un `AbortController` a mano).
 * Esto corre dentro de un route handler con tiempo de ejecución acotado
 * (Vercel): un lote que no contesta no puede trabar los lotes siguientes.
 */
export const EXPO_PUSH_TIMEOUT_MS = 10_000

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered'

/** `ExponentPushToken[...]`, con algo adentro de los corchetes. Nada más se manda a Expo. */
const EXPO_PUSH_TOKEN_REGEX = /^ExponentPushToken\[[^\]]+\]$/

export function esTokenExpoValido(token: string): boolean {
  return EXPO_PUSH_TOKEN_REGEX.test(token)
}

function enLotesDe<T>(items: T[], tamaño: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamaño) lotes.push(items.slice(i, i + tamaño))
  return lotes
}

/** `err.name` (y mensaje si lo tiene) de un fetch que rechazó: nunca contiene tokens, son errores nuestros de red/abort. */
function motivoDelError(err: unknown): string {
  if (err instanceof Error) return err.message ? `${err.name}: ${err.message}` : err.name
  return 'error desconocido'
}

/**
 * Si la respuesta de Expo representa un fallo de todo el lote (HTTP de
 * error, o `errors[]` no vacío aunque el HTTP sea 200). Solo informa la
 * cantidad de errores, nunca su contenido: el `message` de un error de Expo
 * podría llegar a citar el campo `to` que lo generó.
 */
function describirFalloDeRespuesta(response: Response, json: { errors?: unknown[] } | null): string | null {
  const cantidadErrores = Array.isArray(json?.errors) ? json.errors.length : 0
  if (!response.ok) {
    return `Expo respondió HTTP ${response.status}${cantidadErrores ? ` con ${cantidadErrores} error(es)` : ''}`
  }
  if (cantidadErrores > 0) return `Expo devolvió errors[] (${cantidadErrores} error(es)) con HTTP 200`
  return null
}

async function enviarUnLote(
  lote: MensajePush[],
  fetchImpl: typeof fetch,
): Promise<{ tickets: TicketConToken[]; error: string | null }> {
  const sinTicket = (): TicketConToken[] => lote.map((m) => ({ token: m.to, ticket: null }))

  try {
    const response = await fetchImpl(EXPO_PUSH_SEND_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(lote),
      signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
    })
    const json = (await response.json().catch(() => null)) as { data?: unknown; errors?: unknown[] } | null

    const fallo = describirFalloDeRespuesta(response, json)
    if (fallo) return { tickets: sinTicket(), error: fallo }

    const data = json?.data
    if (!Array.isArray(data) || data.length !== lote.length) {
      // Si la cantidad de tickets no coincide con la de mensajes mandados no
      // hay forma confiable de emparejar por posición: se descarta el lote
      // entero antes que arriesgar un cruce corrido (que borraría tokens de
      // gente que sí está registrada).
      const cantidad = Array.isArray(data) ? String(data.length) : 'nada'
      return {
        tickets: sinTicket(),
        error: `Expo devolvió ${cantidad} ticket(s) para un lote de ${lote.length} mensaje(s): no se puede emparejar por posición, se descarta el lote`,
      }
    }

    return {
      tickets: lote.map((m, i) => ({ token: m.to, ticket: data[i] as ExpoPushTicket })),
      error: null,
    }
  } catch (err) {
    return {
      tickets: sinTicket(),
      error: `No se pudo mandar un lote de ${lote.length} mensaje(s): ${motivoDelError(err)}`,
    }
  }
}

/**
 * Manda los mensajes a Expo en lotes de hasta `EXPO_PUSH_BATCH_SIZE`. Los
 * tokens sin forma de token de Expo se descartan antes de armar ningún lote
 * (se cuentan en `descartados`, nunca se loguean); si no queda ninguno con
 * forma válida, no se llama a `fetchImpl` ni una vez.
 *
 * Un lote que falla (timeout, red, HTTP de error, `errors[]`, o un `data[]`
 * que no cuadra con lo mandado) no tira: queda registrado en `erroresLote` y
 * sus mensajes vuelven con `ticket: null`, para que los lotes de al lado
 * sigan su curso.
 *
 * `fetchImpl` recibe el `fetch` global de forma explícita por default (no
 * hay un `globalThis.fetch` escondido adentro): en los tests siempre se pasa
 * un doble.
 */
export async function enviarLote(mensajes: MensajePush[], fetchImpl: typeof fetch = fetch): Promise<ResultadoEnvioPush> {
  const validos = mensajes.filter((m) => esTokenExpoValido(m.to))
  const descartados = mensajes.length - validos.length

  const lotes = enLotesDe(validos, EXPO_PUSH_BATCH_SIZE)
  const resultados = await Promise.all(lotes.map((lote) => enviarUnLote(lote, fetchImpl)))

  const tickets: TicketConToken[] = []
  const erroresLote: string[] = []
  for (const r of resultados) {
    tickets.push(...r.tickets)
    if (r.error) erroresLote.push(r.error)
  }
  return { tickets, descartados, erroresLote }
}

/**
 * Pregunta por el resultado final de tickets ya entregados (`status: 'ok'`
 * al mandarlos): ahí es donde aparece el `DeviceNotRegistered` diferido. Un
 * solo `POST` con todos los ids: si el llamador junta más de los que Expo
 * acepta por request, tiene que lotearearlos antes de llamar a esta función
 * (no lo hace esta, porque la tarea no lo pidió y no hay un límite real
 * documentado en este módulo para probarlo sin red).
 */
export async function leerReceipts(ids: string[], fetchImpl: typeof fetch = fetch): Promise<ResultadoReceipts> {
  if (ids.length === 0) return { receipts: {}, erroresLote: [] }

  try {
    const response = await fetchImpl(EXPO_PUSH_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
    })
    const json = (await response.json().catch(() => null)) as {
      data?: Record<string, ExpoPushReceipt>
      errors?: unknown[]
    } | null

    const fallo = describirFalloDeRespuesta(response, json)
    if (fallo) return { receipts: {}, erroresLote: [fallo] }

    return { receipts: json?.data && typeof json.data === 'object' ? json.data : {}, erroresLote: [] }
  } catch (err) {
    return {
      receipts: {},
      erroresLote: [`No se pudieron leer receipts de ${ids.length} ticket(s): ${motivoDelError(err)}`],
    }
  }
}

/**
 * Tokens para borrar de `push_tokens`: los que Expo marcó
 * `DeviceNotRegistered`, ya sea al mandar el mensaje (en el ticket, llega
 * junto con `enviarLote`) o después, al pedir el receipt (llega junto con
 * `leerReceipts`). El cruce ticket↔receipt es por `ticket.id`, que es el
 * mismo id que indexa `receipts`; el cruce ticket↔token ya viene hecho desde
 * `enviarLote` (ver `TicketConToken`), así que acá no se vuelve a emparejar
 * por posición.
 */
export function tokensInvalidos(tickets: TicketConToken[], receipts: Record<string, ExpoPushReceipt>): string[] {
  const invalidos = new Set<string>()

  for (const { token, ticket } of tickets) {
    if (!ticket) continue

    if (ticket.status === 'error' && ticket.details?.error === DEVICE_NOT_REGISTERED) {
      invalidos.add(token)
      continue
    }

    if (ticket.status === 'ok') {
      const receipt = receipts[ticket.id]
      if (receipt?.status === 'error' && receipt.details?.error === DEVICE_NOT_REGISTERED) {
        invalidos.add(token)
      }
    }
  }

  return [...invalidos]
}
