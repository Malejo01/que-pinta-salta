/**
 * Dobles compartidos de los tests de los avisos de la Ronda 70 (sin red ni
 * base): un cliente de sesión de Supabase, una "base" en memoria para el
 * cliente de service role y un `fetch` de Expo. Datos inventados y evidentes.
 *
 * No es un test (no termina en `.test.ts`): lo importan los archivos de esta
 * carpeta. No importa ningún módulo de producción, así que se puede usar
 * junto a `vi.mock(...)` sin problemas de orden.
 */

export type Fila = Record<string, unknown>
export type ErrorDb = { code?: string; message: string }

// ---------------------------------------------------------------------------
// Fixtures de identidad (datos que NUNCA deben aparecer en una respuesta ni en un log)
// ---------------------------------------------------------------------------

export const ADMIN_ID = 'dddddddd-dddd-4ddd-8ddd-000000000001'
export const ADMIN_EMAIL = 'admin-de-prueba@ejemplo.invalid'
export const TOKEN_ADMIN_1 = 'ExponentPushToken[admin-telefono-uno-de-prueba]'
export const TOKEN_ADMIN_2 = 'ExponentPushToken[admin-telefono-dos-de-prueba]'
export const EVENTO_ID = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'
export const OTRO_ID_DE_ENTRADA = 'eeeeeeee-eeee-4eee-8eee-0000000000ff'

export const idUsuario = (n: number) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`
export const tokenUsuario = (n: number, k = 1) => `ExponentPushToken[usuario-${n}-telefono-${k}-de-prueba]`
export const emailUsuario = (n: number) => `persona-${n}-de-prueba@ejemplo.invalid`

/** Todo lo que no puede viajar al navegador ni a un log, dado un conjunto de usuarios sembrados. */
export function secretos(cantidadUsuarios: number): string[] {
  const lista = [ADMIN_ID, ADMIN_EMAIL, TOKEN_ADMIN_1, TOKEN_ADMIN_2, OTRO_ID_DE_ENTRADA]
  for (let n = 1; n <= cantidadUsuarios; n++) {
    lista.push(idUsuario(n), emailUsuario(n), tokenUsuario(n, 1), tokenUsuario(n, 2))
  }
  return lista
}

// ---------------------------------------------------------------------------
// Cliente de la sesión (el que ve RLS): profiles, events y los push_tokens PROPIOS.
// Cualquier otra tabla, o cualquier escritura, no existe en el doble: tira.
// ---------------------------------------------------------------------------

export interface ConfigSesion {
  user: { id: string; email?: string } | null
  role?: string | null
  eventStatus?: 'PUBLISHED' | 'DRAFT' | null
  eventError?: ErrorDb | null
  tokens?: string[]
  tokensError?: ErrorDb | null
}

export function crearClienteSesion(config: ConfigSesion) {
  const tablasTocadas: string[] = []
  const idsConsultadosEnTokens: string[] = []
  const columnasPedidasEnTokens: string[] = []

  const from = (tabla: string) => {
    tablasTocadas.push(tabla)
    if (tabla === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: config.role ? { role: config.role } : null, error: null }),
          }),
        }),
      }
    }
    if (tabla === 'events') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (config.eventError) return { data: null, error: config.eventError }
              if (!config.eventStatus) return { data: null, error: null }
              return { data: { status: config.eventStatus }, error: null }
            },
          }),
        }),
      }
    }
    if (tabla === 'push_tokens') {
      return {
        select: (columnas: string) => {
          columnasPedidasEnTokens.push(columnas)
          return {
            eq: (_columna: string, valor: string) => {
              idsConsultadosEnTokens.push(valor)
              const resultado = config.tokensError
                ? { data: null, error: config.tokensError }
                : { data: (config.tokens ?? []).map((token) => ({ token })), error: null }
              return Promise.resolve(resultado)
            },
          }
        },
      }
    }
    throw new Error(`el cliente de la sesión no debería tocar la tabla "${tabla}"`)
  }

  return {
    cliente: {
      auth: { getUser: async () => ({ data: { user: config.user }, error: null }) },
      from,
    },
    tablasTocadas,
    idsConsultadosEnTokens,
    columnasPedidasEnTokens,
  }
}

// ---------------------------------------------------------------------------
// "Base" en memoria para el cliente de service role.
// Soporta lo que usan las acciones: select / upsert(ignoreDuplicates) / update /
// delete con eq, in, gte, order, range, limit y maybeSingle.
// ---------------------------------------------------------------------------

export interface ContextoDeConsulta {
  tabla: string
  op: 'select' | 'upsert' | 'insert' | 'update' | 'delete'
  payload: unknown
  db: BaseEnMemoria
}
export type GanchoDb = (ctx: ContextoDeConsulta) => { error: ErrorDb } | void

export interface Escritura {
  tabla: string
  op: string
  payload?: unknown
}

export class BaseEnMemoria {
  tablas: Record<string, Fila[]> = { push_tokens: [], notification_preferences: [], notification_sends: [] }
  escrituras: Escritura[] = []
  /** Orden de los hechos: 'upsert:notification_sends', 'fetch', 'update:...'. */
  linea: string[] = []
  ganchos: GanchoDb[] = []
  private siguienteId = 1

  /** El reloj de la base es el reloj (falso) del test. */
  nuevoId(): number {
    return this.siguienteId++
  }

  alInvocar(gancho: GanchoDb): void {
    this.ganchos.push(gancho)
  }

  sends(): Fila[] {
    return this.tablas.notification_sends
  }
  sendDe(userId: string): Fila | undefined {
    return this.sends().find((f) => f.user_id === userId)
  }
}

function consulta(db: BaseEnMemoria, tabla: string) {
  const q = {
    op: 'select' as ContextoDeConsulta['op'],
    filtros: [] as Array<(f: Fila) => boolean>,
    payload: undefined as unknown,
    opciones: undefined as { ignoreDuplicates?: boolean } | undefined,
    devuelve: false,
    orden: undefined as { columna: string; asc: boolean } | undefined,
    rango: undefined as [number, number] | undefined,
    limite: undefined as number | undefined,
  }

  async function ejecutar(unico: boolean): Promise<{ data: unknown; error: ErrorDb | null }> {
    db.linea.push(`${q.op}:${tabla}`)
    for (const gancho of db.ganchos) {
      const r = gancho({ tabla, op: q.op, payload: q.payload, db })
      if (r && 'error' in r) return { data: null, error: r.error }
    }
    const filas = db.tablas[tabla] ?? (db.tablas[tabla] = [])

    if (q.op === 'select') {
      let r = filas.filter((f) => q.filtros.every((fn) => fn(f)))
      if (q.orden) {
        const { columna, asc } = q.orden
        r = [...r].sort((a, b) => (String(a[columna]) < String(b[columna]) ? (asc ? -1 : 1) : String(a[columna]) > String(b[columna]) ? (asc ? 1 : -1) : 0))
      }
      if (q.rango) r = r.slice(q.rango[0], q.rango[1] + 1)
      if (q.limite !== undefined) r = r.slice(0, q.limite)
      const copia = r.map((f) => ({ ...f }))
      return { data: unico ? (copia[0] ?? null) : copia, error: null }
    }

    if (q.op === 'upsert' || q.op === 'insert') {
      db.escrituras.push({ tabla, op: q.op, payload: q.payload })
      const nuevas: Fila[] = []
      for (const p of (Array.isArray(q.payload) ? q.payload : [q.payload]) as Fila[]) {
        const existe = filas.some((f) => f.dedupe_key !== undefined && f.dedupe_key === p.dedupe_key)
        if (existe && q.opciones?.ignoreDuplicates) continue
        const fila: Fila = { id: db.nuevoId(), sent_at: new Date().toISOString(), ...p }
        filas.push(fila)
        nuevas.push({ ...fila })
      }
      return { data: q.devuelve ? nuevas : null, error: null }
    }

    if (q.op === 'update') {
      db.escrituras.push({ tabla, op: 'update', payload: q.payload })
      for (const f of filas.filter((x) => q.filtros.every((fn) => fn(x)))) Object.assign(f, q.payload as Fila)
      return { data: null, error: null }
    }

    db.escrituras.push({ tabla, op: 'delete' })
    db.tablas[tabla] = filas.filter((f) => !q.filtros.every((fn) => fn(f)))
    return { data: null, error: null }
  }

  const api = {
    select() {
      if (q.op !== 'select') q.devuelve = true
      return api
    },
    upsert(payload: unknown, opciones?: { ignoreDuplicates?: boolean }) {
      q.op = 'upsert'
      q.payload = payload
      q.opciones = opciones
      return api
    },
    insert(payload: unknown) {
      q.op = 'insert'
      q.payload = payload
      return api
    },
    update(payload: unknown) {
      q.op = 'update'
      q.payload = payload
      return api
    },
    delete() {
      q.op = 'delete'
      return api
    },
    eq(columna: string, valor: unknown) {
      q.filtros.push((f) => f[columna] === valor)
      return api
    },
    in(columna: string, valores: unknown[]) {
      q.filtros.push((f) => valores.includes(f[columna]))
      return api
    },
    gte(columna: string, valor: string) {
      q.filtros.push((f) => String(f[columna]) >= String(valor))
      return api
    },
    order(columna: string, opciones?: { ascending?: boolean }) {
      q.orden = { columna, asc: opciones?.ascending !== false }
      return api
    },
    range(desde: number, hasta: number) {
      q.rango = [desde, hasta]
      return api
    },
    limit(n: number) {
      q.limite = n
      return api
    },
    maybeSingle() {
      return ejecutar(true)
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return ejecutar(false).then(resolve, reject)
    },
  }
  return api
}

export function crearClienteAdmin(db: BaseEnMemoria) {
  return { from: (tabla: string) => consulta(db, tabla) }
}

// ---------------------------------------------------------------------------
// Siembra de usuarios: tokens, preferencias y envíos previos.
// ---------------------------------------------------------------------------

export interface PrefsSembradas {
  announcements?: boolean
  quiet_start?: string
  quiet_end?: string
  daily_cap?: number
}

export function sembrarUsuario(
  db: BaseEnMemoria,
  n: number,
  opciones: { tokens?: number; prefs?: PrefsSembradas | null; envios?: Fila[] } = {},
): { userId: string; tokens: string[] } {
  const userId = idUsuario(n)
  const cantidad = opciones.tokens ?? 1
  const tokens: string[] = []
  for (let k = 1; k <= cantidad; k++) {
    const token = tokenUsuario(n, k)
    tokens.push(token)
    db.tablas.push_tokens.push({ id: db.nuevoId(), user_id: userId, token, email: emailUsuario(n) })
  }
  if (opciones.prefs !== null) {
    db.tablas.notification_preferences.push({
      user_id: userId,
      radar_channel: 'push',
      favorite_reminders: true,
      follow_news: true,
      announcements: true,
      sponsored: true,
      quiet_start: '23:00:00',
      quiet_end: '09:00:00',
      daily_cap: 4,
      ...(opciones.prefs ?? {}),
    })
  }
  for (const envio of opciones.envios ?? []) {
    db.tablas.notification_sends.push({ id: db.nuevoId(), user_id: userId, ...envio })
  }
  return { userId, tokens }
}

// ---------------------------------------------------------------------------
// fetch de Expo
// ---------------------------------------------------------------------------

export interface LlamadaExpo {
  url: string
  body: unknown
}

export function crearFetchExpo(db?: BaseEnMemoria) {
  const llamadas: LlamadaExpo[] = []
  /** Ticket por token; lo que no esté acá sale `ok`. */
  const ticketsPorToken = new Map<string, Record<string, unknown>>()
  /** Los `PENDIENTE` que había en la base en el instante de cada `/send`. */
  const pendientesAlMandar: string[][] = []

  const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    const body = JSON.parse(String(init?.body ?? 'null')) as unknown
    llamadas.push({ url: u, body })
    db?.linea.push('fetch')
    if (u.endsWith('/send')) {
      pendientesAlMandar.push(
        (db?.sends() ?? []).filter((f) => f.status === 'PENDIENTE').map((f) => String(f.user_id)),
      )
      const mensajes = body as Array<{ to: string }>
      const data = mensajes.map((m) => ticketsPorToken.get(m.to) ?? { status: 'ok', id: `ticket-de-prueba-${m.to}` })
      return new Response(JSON.stringify({ data }), { status: 200 })
    }
    return new Response(JSON.stringify({ data: {} }), { status: 200 })
  }

  return {
    fn,
    llamadas,
    ticketsPorToken,
    pendientesAlMandar,
    /** Los `to` de todos los mensajes mandados a `/send`, en orden. */
    destinatarios(): string[] {
      return llamadas.filter((l) => l.url.endsWith('/send')).flatMap((l) => (l.body as Array<{ to: string }>).map((m) => m.to))
    },
    mensajes(): Array<Record<string, unknown>> {
      return llamadas.filter((l) => l.url.endsWith('/send')).flatMap((l) => l.body as Array<Record<string, unknown>>)
    },
  }
}

// ---------------------------------------------------------------------------
// Chequeo de filtraciones
// ---------------------------------------------------------------------------

/** Texto plano de todo lo que se le pasó a un espía de `console.*`. */
export function textoDeLlamadas(llamadas: unknown[][]): string {
  return llamadas
    .map((args) =>
      args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}`
          if (typeof a === 'string') return a
          try {
            return JSON.stringify(a)
          } catch {
            return String(a)
          }
        })
        .join(' '),
    )
    .join('\n')
}
