/**
 * Doble en memoria del cliente de Supabase para los tests de la R58 que cruzan
 * tareas (58-q). Sin red ni base.
 *
 * - RESPETA los filtros (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `is`,
 *   `not`), el orden, `limit`, `range`, el conteo (`count` / `head`) y la
 *   proyección de columnas (una columna que no se pidió no sale), incluidos los
 *   embebidos `events(...)` / `alias:events(...)`.
 * - SEPARA tres roles. `servicio` (la service key: ve y escribe todo), `admin`
 *   (la sesión de un administrador: `is_admin()` verdadero) y `usuario` / `anon`
 *   (lo que dice la RLS de `supabase/migrations/20261019120000_r58_precios_publicidad.sql`).
 * - Emula los `check`, las claves únicas, las claves foráneas, los defaults y el
 *   trigger de `ad_settings` de esa migración, para que una escritura que la
 *   base real rechazaría también se rechace acá.
 * - Registra cada llamada (rol, tabla, operación, columnas, valores y filtros)
 *   para que los tests puedan mirar QUÉ se pidió y QUIÉN lo pidió.
 *
 * Los datos son inventados. Nada de esto toca producción.
 */

export type Fila = Record<string, unknown>
export type Rol = 'servicio' | 'admin' | 'usuario' | 'anon'
export type Operacion = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

export interface ErrorDb {
  code: string
  message: string
}

export interface Resultado {
  data: Fila[] | Fila | null
  count: number | null
  error: ErrorDb | null
}

export interface Llamada {
  rol: Rol
  tabla: string
  op: Operacion
  /** El texto de `select(...)`: lo que se pidió leer (o devolver después de escribir). */
  columnas: string | null
  valores: Fila | Fila[] | null
  filtros: Array<{ metodo: string; args: unknown[] }>
}

export interface ConstructorDoble extends PromiseLike<Resultado> {
  select(columnas?: string, opciones?: { count?: 'exact'; head?: boolean }): ConstructorDoble
  insert(valores: Fila | Fila[]): ConstructorDoble
  update(valores: Fila): ConstructorDoble
  upsert(valores: Fila | Fila[], opciones?: { onConflict?: string; ignoreDuplicates?: boolean }): ConstructorDoble
  delete(): ConstructorDoble
  eq(columna: string, valor: unknown): ConstructorDoble
  neq(columna: string, valor: unknown): ConstructorDoble
  gt(columna: string, valor: unknown): ConstructorDoble
  gte(columna: string, valor: unknown): ConstructorDoble
  lt(columna: string, valor: unknown): ConstructorDoble
  lte(columna: string, valor: unknown): ConstructorDoble
  in(columna: string, valores: unknown[]): ConstructorDoble
  is(columna: string, valor: unknown): ConstructorDoble
  not(columna: string, operador: string, valor: unknown): ConstructorDoble
  order(columna: string, opciones?: { ascending?: boolean }): ConstructorDoble
  limit(n: number): ConstructorDoble
  range(desde: number, hasta: number): ConstructorDoble
  maybeSingle(): Promise<Resultado>
  single(): Promise<Resultado>
}

export interface ClienteDoble {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- misma firma que `ClientePrecios` de lib/anunciantes/precios.ts
  from: (tabla: string) => any
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: null }> }
}

export interface Almacen {
  tablas: Record<string, Fila[]>
  llamadas: Llamada[]
  /** Inyecta una falla: si devuelve un error, esa operación falla con él. */
  fallar: ((tabla: string, op: Operacion, rol: Rol) => ErrorDb | null) | null
  contador: number
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Un uuid inventado y determinista: `bloque` separa familias de ids (usuarios, eventos...). */
export function idInventado(bloque: number, n: number): string {
  return `${bloque.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

function clonar<T>(valor: T): T {
  return structuredClone(valor)
}

function esMarcaDeTiempo(v: unknown): v is string {
  return typeof v === 'string' && v.includes('T') && !Number.isNaN(Date.parse(v))
}

function comparar(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (esMarcaDeTiempo(a) && esMarcaDeTiempo(b)) return Date.parse(a) - Date.parse(b)
  const x = String(a)
  const y = String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

function iguales(a: unknown, b: unknown): boolean {
  if (esMarcaDeTiempo(a) && esMarcaDeTiempo(b)) return Date.parse(a) === Date.parse(b)
  return a === b
}

// ---------------------------------------------------------------------------
// El almacén
// ---------------------------------------------------------------------------

export function crearAlmacen(): Almacen {
  const almacen: Almacen = { tablas: {}, llamadas: [], fallar: null, contador: 0 }
  // La migración inserta la fila única de ad_settings.
  almacen.tablas.ad_settings = [
    {
      id: true,
      aprobacion_automatica: false,
      push_patrocinado_pausado_at: null,
      push_patrocinado_pausa_motivo: null,
      umbral_bajas_push: 0.02,
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
  ]
  return almacen
}

/**
 * Carga filas sin pasar por los check (es el estado de partida del test), pero con
 * los defaults de la base: el `id`, el `estado`, los `null`, el `token`...
 */
export function sembrar(almacen: Almacen, tabla: string, filas: Fila[]): void {
  const destino = (almacen.tablas[tabla] ??= [])
  for (const fila of filas) destino.push(conDefaults(almacen, tabla, fila))
}

/** Una copia de las filas de una tabla (para mirar, no para mutar). */
export function filasDe(almacen: Almacen, tabla: string): Fila[] {
  return clonar(almacen.tablas[tabla] ?? [])
}

/** Las llamadas que escriben, desde `desde` (un índice de `almacen.llamadas`). */
export function escrituras(almacen: Almacen, desde = 0): Llamada[] {
  return almacen.llamadas.slice(desde).filter((l) => l.op !== 'select')
}

const TABLAS_CON_ID = new Set([
  'ad_prices',
  'ad_campaign_reports',
  'notification_sends',
  'push_tokens',
  'job_runs',
  'sponsored_campaigns',
  'events',
])

function siguienteId(almacen: Almacen): string {
  almacen.contador += 1
  return idInventado(0xa0, almacen.contador)
}

function siguienteToken(almacen: Almacen): string {
  almacen.contador += 1
  // 32 caracteres hexadecimales, como el default de la migración.
  return `cafe${almacen.contador.toString(16).padStart(28, '0')}`
}

// ---------------------------------------------------------------------------
// La RLS de la migración
// ---------------------------------------------------------------------------

type Predicado = (fila: Fila) => boolean
type Permiso = true | Predicado
type Politica = Partial<Record<'select' | 'insert' | 'update' | 'delete', Permiso>>

const APROBADO: Predicado = (f) => f.estado === 'aprobado'
const NINGUNA: Predicado = () => false

/** Solo las tablas `ad_*`: las demás son abiertas (no se están probando). `servicio` se saltea todo. */
const POLITICAS: Record<string, Partial<Record<Rol, Politica>>> = {
  ad_price_cycles: { admin: { select: true, update: true }, usuario: { select: NINGUNA } },
  ad_prices: {
    anon: { select: APROBADO },
    usuario: { select: APROBADO },
    admin: { select: true, update: true },
  },
  ad_settings: { admin: { select: true, update: true }, usuario: { select: NINGUNA } },
  ad_occupancy_daily: { admin: { select: true }, usuario: { select: NINGUNA } },
  ad_campaign_reports: {
    admin: { select: true, insert: true, update: true, delete: true },
    usuario: { select: NINGUNA },
  },
}

type Permitido = { permitido: true; predicado: Predicado | null } | { permitido: false }

function permisoPara(rol: Rol, tabla: string, op: 'select' | 'insert' | 'update' | 'delete'): Permitido {
  if (rol === 'servicio') return { permitido: true, predicado: null }
  const politicas = POLITICAS[tabla]
  if (!politicas) return { permitido: true, predicado: null }
  const permiso = politicas[rol]?.[op]
  if (permiso === undefined) return { permitido: false }
  return { permitido: true, predicado: permiso === true ? null : permiso }
}

// ---------------------------------------------------------------------------
// Defaults, checks, únicas y claves foráneas de la migración
// ---------------------------------------------------------------------------

const UNICAS: Record<string, string[][]> = {
  ad_price_cycles: [['ciclo']],
  ad_prices: [['ciclo', 'producto']],
  ad_occupancy_daily: [['day']],
  ad_campaign_reports: [['event_id', 'tipo', 'desde'], ['token']],
  ad_settings: [['id']],
}

const PRODUCTOS = ['destacado-3', 'destacado-7', 'destacado-14', 'pack-lanzamiento', 'plan-mensual', 'plan-rrpp', 'push']

function conDefaults(almacen: Almacen, tabla: string, entrada: Fila): Fila {
  const f = clonar(entrada)
  const por = (clave: string, valor: unknown) => {
    if (f[clave] === undefined) f[clave] = valor
  }
  const ahora = new Date().toISOString()
  if (TABLAS_CON_ID.has(tabla)) por('id', siguienteId(almacen))
  if (tabla === 'ad_price_cycles') {
    por('estado', 'propuesto')
    por('factor_hero', 1)
    por('factor_push', 1)
    por('mau_app_28d', null)
    por('dispositivos_push', null)
    por('cambio_tramo_desde', null)
    por('ocupacion_hero', null)
    por('ocupacion_push', null)
    por('approved_at', null)
    por('approved_by', null)
    por('created_at', ahora)
  }
  if (tabla === 'ad_prices') {
    por('estado', 'propuesto')
    por('precio_fundador_ars', null)
    por('created_at', ahora)
  }
  if (tabla === 'ad_occupancy_daily') {
    por('push_cupos_usados', 0)
    por('push_cupos', 1)
    por('created_at', ahora)
  }
  if (tabla === 'ad_campaign_reports') {
    por('metricas', {})
    por('precio_ars', null)
    por('sponsored_campaign_id', null)
    por('created_by', null)
    por('created_at', ahora)
    if (f.token === undefined) f.token = siguienteToken(almacen)
  }
  return f
}

const err = (code: string, message: string): ErrorDb => ({ code, message })

function enRango(n: unknown, min: number, max: number): boolean {
  return typeof n === 'number' && n >= min && n <= max
}

function validar(almacen: Almacen, tabla: string, fila: Fila, previa: Fila | null): ErrorDb | null {
  const otras = (almacen.tablas[tabla] ?? []).filter((f) => f !== previa)

  for (const clave of UNICAS[tabla] ?? []) {
    if (otras.some((o) => clave.every((c) => iguales(o[c], fila[c])))) {
      return err('23505', `duplicate key value violates unique constraint on ${tabla}(${clave.join(',')})`)
    }
  }

  const check = (ok: boolean, nombre: string): ErrorDb | null =>
    ok ? null : err('23514', `new row for relation "${tabla}" violates check constraint "${nombre}"`)

  if (tabla === 'ad_price_cycles') {
    const dia = typeof fila.ciclo === 'string' ? fila.ciclo.slice(8, 10) : ''
    return (
      check(dia === '01', 'ad_price_cycles_dia_uno_check') ??
      check(
        typeof fila.audiencia_web_28d === 'number' &&
          fila.audiencia_web_28d >= 0 &&
          typeof fila.audiencia === 'number' &&
          fila.audiencia >= 0,
        'ad_price_cycles_audiencia_check',
      ) ??
      check(['vercel', 'manual'].includes(String(fila.fuente_audiencia)), 'ad_price_cycles_fuente_audiencia_check') ??
      check(Number(fila.tramo_calculado) > 0 && Number(fila.tramo_vigente) > 0, 'ad_price_cycles_tramo_check') ??
      check(Number(fila.tipo_cambio) > 0, 'ad_price_cycles_tipo_cambio_check') ??
      check(
        (fila.ocupacion_hero === null || enRango(fila.ocupacion_hero, 0, 1)) &&
          (fila.ocupacion_push === null || enRango(fila.ocupacion_push, 0, 1)),
        'ad_price_cycles_ocupacion_check',
      ) ??
      check(enRango(fila.factor_hero, 0.8, 1.5) && enRango(fila.factor_push, 0.8, 1.5), 'ad_price_cycles_factores_check') ??
      check(['propuesto', 'aprobado', 'automatico', 'descartado'].includes(String(fila.estado)), 'ad_price_cycles_estado_check') ??
      check(
        !['aprobado', 'automatico'].includes(String(fila.estado)) || (fila.approved_at !== null && fila.approved_at !== undefined),
        'ad_price_cycles_aprobado_check',
      )
    )
  }

  if (tabla === 'ad_prices') {
    const ciclos = almacen.tablas.ad_price_cycles ?? []
    if (!ciclos.some((c) => c.ciclo === fila.ciclo)) {
      return err('23503', 'insert or update on table "ad_prices" violates foreign key constraint "ad_prices_ciclo_fkey"')
    }
    const ars = fila.precio_ars
    const fundador = fila.precio_fundador_ars
    return (
      check(PRODUCTOS.includes(String(fila.producto)), 'ad_prices_producto_check') ??
      check(Number(fila.tramo_ref) > 0, 'ad_prices_tramo_check') ??
      check(Number(fila.precio_usd) > 0, 'ad_prices_precio_usd_check') ??
      check(typeof ars === 'number' && Number.isInteger(ars) && ars > 0 && ars % 500 === 0, 'ad_prices_precio_ars_check') ??
      check(
        fundador === null ||
          fundador === undefined ||
          (typeof fundador === 'number' &&
            Number.isInteger(fundador) &&
            fundador > 0 &&
            fundador % 500 === 0 &&
            typeof ars === 'number' &&
            fundador <= ars),
        'ad_prices_fundador_check',
      ) ??
      check(Number(fila.tipo_cambio) > 0, 'ad_prices_tipo_cambio_check') ??
      check(['propuesto', 'aprobado'].includes(String(fila.estado)), 'ad_prices_estado_check')
    )
  }

  if (tabla === 'ad_settings') {
    return (
      check(fila.id === true, 'ad_settings_una_fila_check') ??
      check(typeof fila.umbral_bajas_push === 'number' && fila.umbral_bajas_push > 0 && fila.umbral_bajas_push <= 1, 'ad_settings_umbral_check') ??
      check(
        (fila.push_patrocinado_pausado_at !== null && fila.push_patrocinado_pausado_at !== undefined) ||
          fila.push_patrocinado_pausa_motivo === null ||
          fila.push_patrocinado_pausa_motivo === undefined,
        'ad_settings_pausa_check',
      )
    )
  }

  if (tabla === 'ad_occupancy_daily') {
    const cupos = fila.hero_cupos
    return check(
      typeof cupos === 'number' &&
        cupos > 0 &&
        enRango(fila.hero_ocupados, 0, cupos) &&
        Number(fila.push_cupos) >= 0 &&
        Number(fila.push_cupos_usados) >= 0 &&
        Number(fila.push_cupos_usados) <= Math.max(Number(fila.push_cupos), Number(fila.push_cupos_usados)),
      'ad_occupancy_daily_check',
    )
  }

  if (tabla === 'ad_campaign_reports') {
    const eventos = almacen.tablas.events ?? []
    if (!eventos.some((e) => e.id === fila.event_id)) {
      return err('23503', 'insert or update on table "ad_campaign_reports" violates foreign key constraint "ad_campaign_reports_event_id_fkey"')
    }
    if (fila.sponsored_campaign_id !== null && fila.sponsored_campaign_id !== undefined) {
      const campanias = almacen.tablas.sponsored_campaigns ?? []
      if (!campanias.some((c) => c.id === fila.sponsored_campaign_id)) {
        return err('23503', 'violates foreign key constraint "ad_campaign_reports_sponsored_campaign_id_fkey"')
      }
    }
    const metricas = fila.metricas
    return (
      check(['destacado', 'push'].includes(String(fila.tipo)), 'ad_campaign_reports_tipo_check') ??
      check(
        typeof fila.desde === 'string' && typeof fila.hasta === 'string' && Date.parse(fila.hasta) > Date.parse(fila.desde),
        'ad_campaign_reports_fechas_check',
      ) ??
      check(typeof fila.token === 'string' && /^[0-9a-f]{32}$/.test(fila.token), 'ad_campaign_reports_token_check') ??
      check(typeof metricas === 'object' && metricas !== null && !Array.isArray(metricas), 'ad_campaign_reports_metricas_check') ??
      check(fila.precio_ars === null || (typeof fila.precio_ars === 'number' && fila.precio_ars >= 0), 'ad_campaign_reports_precio_check') ??
      check(fila.tipo !== 'push' || (fila.sponsored_campaign_id !== null && fila.sponsored_campaign_id !== undefined), 'ad_campaign_reports_push_check')
    )
  }

  if (tabla === 'sponsored_campaigns') {
    const d = fila.destinatarios ?? null
    const b = fila.bajas_48h ?? null
    return check(
      (d === null || (typeof d === 'number' && d >= 0)) &&
        (b === null || (typeof b === 'number' && b >= 0 && (d === null || b <= (d as number)))) &&
        (b === null || (fila.bajas_medidas_at !== null && fila.bajas_medidas_at !== undefined)),
      'sponsored_campaigns_bajas_check',
    )
  }

  return null
}

/** El trigger `ad_settings_exigir_ciclos`: prender la aprobación automática pide 3 ciclos `aprobado`. */
function trigger(almacen: Almacen, tabla: string, nueva: Fila, vieja: Fila): ErrorDb | null {
  if (tabla !== 'ad_settings') return null
  if (nueva.aprobacion_automatica === true && vieja.aprobacion_automatica !== true) {
    const aprobados = (almacen.tablas.ad_price_cycles ?? []).filter((c) => c.estado === 'aprobado').length
    if (aprobados < 3) return err('23514', 'La aprobación automática necesita 3 ciclos aprobados a mano')
  }
  nueva.updated_at = new Date().toISOString()
  return null
}

// ---------------------------------------------------------------------------
// Proyección de columnas (con embebidos)
// ---------------------------------------------------------------------------

function partirTopeNivel(texto: string): string[] {
  const partes: string[] = []
  let profundidad = 0
  let actual = ''
  for (const ch of texto) {
    if (ch === '(') profundidad += 1
    if (ch === ')') profundidad -= 1
    if (ch === ',' && profundidad === 0) {
      partes.push(actual.trim())
      actual = ''
    } else {
      actual += ch
    }
  }
  if (actual.trim()) partes.push(actual.trim())
  return partes
}

const FK_EMBEBIDOS: Record<string, string> = { events: 'event_id' }

function proyectar(almacen: Almacen, fila: Fila, columnas: string | null): Fila {
  if (columnas === null || columnas.trim() === '*') return clonar(fila)
  const salida: Fila = {}
  for (const token of partirTopeNivel(columnas)) {
    if (token === '*') {
      Object.assign(salida, clonar(fila))
      continue
    }
    const embebido = /^(?:(\w+):)?(\w+)\(([\s\S]*)\)$/.exec(token)
    if (embebido) {
      const [, alias, tablaEmbebida, interior] = embebido
      const fk = FK_EMBEBIDOS[tablaEmbebida]
      if (!fk) throw new Error(`Doble de Supabase: embebido no soportado (${tablaEmbebida})`)
      const destino = (almacen.tablas[tablaEmbebida] ?? []).find((f) => f.id === fila[fk])
      salida[alias ?? tablaEmbebida] = destino ? proyectar(almacen, destino, interior) : null
      continue
    }
    salida[token] = clonar(fila[token] ?? null)
  }
  return salida
}

// ---------------------------------------------------------------------------
// El constructor de consultas
// ---------------------------------------------------------------------------

type Filtro = { metodo: string; args: unknown[]; prueba: Predicado }

interface Estado {
  op: Operacion
  columnas: string | null
  devolver: boolean
  conteo: boolean
  head: boolean
  valores: Fila | Fila[] | null
  upsert: { onConflict?: string; ignoreDuplicates?: boolean }
  filtros: Filtro[]
  ordenes: Array<{ columna: string; asc: boolean }>
  limite: number | null
  rango: [number, number] | null
}

function ejecutar(almacen: Almacen, rol: Rol, tabla: string, e: Estado): Resultado {
  almacen.llamadas.push({
    rol,
    tabla,
    op: e.op,
    columnas: e.columnas,
    valores: e.valores === null ? null : clonar(e.valores),
    filtros: e.filtros.map((f) => ({ metodo: f.metodo, args: clonar(f.args) })),
  })

  const falla = almacen.fallar?.(tabla, e.op, rol) ?? null
  if (falla) return { data: null, count: null, error: falla }

  const denegado = (): Resultado => ({
    data: null,
    count: null,
    error: err('42501', `permission denied for table ${tabla}`),
  })

  const todas = (almacen.tablas[tabla] ??= [])
  const coincide = (f: Fila) => e.filtros.every((filtro) => filtro.prueba(f))

  if (e.op === 'select') {
    const permiso = permisoPara(rol, tabla, 'select')
    if (!permiso.permitido) return denegado()
    let filas = todas.filter((f) => (permiso.predicado ? permiso.predicado(f) : true)).filter(coincide)
    for (const { columna, asc } of [...e.ordenes].reverse()) {
      filas = [...filas].sort((a, b) => (asc ? 1 : -1) * comparar(a[columna], b[columna]))
    }
    const total = filas.length
    if (e.rango) filas = filas.slice(e.rango[0], e.rango[1] + 1)
    if (e.limite !== null) filas = filas.slice(0, e.limite)
    return {
      data: e.head ? null : filas.map((f) => proyectar(almacen, f, e.columnas)),
      count: e.conteo ? total : null,
      error: null,
    }
  }

  const devolver = (filas: Fila[]): Resultado => ({
    data: e.devolver ? filas.map((f) => proyectar(almacen, f, e.columnas)) : null,
    count: null,
    error: null,
  })

  if (e.op === 'insert' || e.op === 'upsert') {
    const permisoInsert = permisoPara(rol, tabla, 'insert')
    if (!permisoInsert.permitido) return denegado()
    if (e.op === 'upsert' && !permisoPara(rol, tabla, 'update').permitido) return denegado()
    const entrantes = Array.isArray(e.valores) ? e.valores : e.valores ? [e.valores] : []
    const copiaPrevia = [...todas]
    const afectadas: Fila[] = []
    const claves = (e.upsert.onConflict ?? '').split(',').map((c) => c.trim()).filter(Boolean)
    for (const entrante of entrantes) {
      const existente = e.op === 'upsert' && claves.length > 0 ? todas.find((f) => claves.every((c) => iguales(f[c], entrante[c]))) : undefined
      if (existente) {
        if (e.upsert.ignoreDuplicates) continue
        const nueva = { ...existente, ...clonar(entrante) }
        const error = validar(almacen, tabla, nueva, existente)
        if (error) {
          todas.splice(0, todas.length, ...copiaPrevia)
          return { data: null, count: null, error }
        }
        Object.assign(existente, nueva)
        afectadas.push(existente)
        continue
      }
      const nueva = conDefaults(almacen, tabla, entrante)
      const error = validar(almacen, tabla, nueva, null)
      if (error) {
        todas.splice(0, todas.length, ...copiaPrevia)
        return { data: null, count: null, error }
      }
      todas.push(nueva)
      afectadas.push(nueva)
    }
    return devolver(afectadas)
  }

  if (e.op === 'update') {
    const permiso = permisoPara(rol, tabla, 'update')
    if (!permiso.permitido) return denegado()
    const objetivo = todas.filter((f) => (permiso.predicado ? permiso.predicado(f) : true)).filter(coincide)
    const cambios: Array<[Fila, Fila]> = []
    for (const fila of objetivo) {
      const nueva = { ...fila, ...clonar(e.valores as Fila) }
      const error = validar(almacen, tabla, nueva, fila) ?? trigger(almacen, tabla, nueva, fila)
      if (error) return { data: null, count: null, error }
      cambios.push([fila, nueva])
    }
    for (const [fila, nueva] of cambios) Object.assign(fila, nueva)
    return devolver(objetivo)
  }

  // delete
  const permiso = permisoPara(rol, tabla, 'delete')
  if (!permiso.permitido) return denegado()
  const borradas = todas.filter((f) => (permiso.predicado ? permiso.predicado(f) : true)).filter(coincide)
  almacen.tablas[tabla] = todas.filter((f) => !borradas.includes(f))
  if (tabla === 'ad_price_cycles') {
    // on delete cascade de ad_prices.ciclo
    const ciclos = new Set(borradas.map((b) => b.ciclo))
    almacen.tablas.ad_prices = (almacen.tablas.ad_prices ?? []).filter((p) => !ciclos.has(p.ciclo))
  }
  return devolver(borradas)
}

function constructor(almacen: Almacen, rol: Rol, tabla: string): ConstructorDoble {
  const estado: Estado = {
    op: 'select',
    columnas: null,
    devolver: false,
    conteo: false,
    head: false,
    valores: null,
    upsert: {},
    filtros: [],
    ordenes: [],
    limite: null,
    rango: null,
  }
  const correr = async (): Promise<Resultado> => ejecutar(almacen, rol, tabla, estado)
  const filtrar = (metodo: string, args: unknown[], prueba: Predicado): ConstructorDoble => {
    estado.filtros.push({ metodo, args, prueba })
    return b
  }
  const b: ConstructorDoble = {
    select(columnas, opciones) {
      estado.columnas = columnas ?? null
      if (estado.op === 'select') {
        estado.conteo = opciones?.count === 'exact'
        estado.head = opciones?.head === true
      } else {
        estado.devolver = true
      }
      return b
    },
    insert(valores) {
      estado.op = 'insert'
      estado.valores = valores
      return b
    },
    update(valores) {
      estado.op = 'update'
      estado.valores = valores
      return b
    },
    upsert(valores, opciones) {
      estado.op = 'upsert'
      estado.valores = valores
      estado.upsert = opciones ?? {}
      return b
    },
    delete() {
      estado.op = 'delete'
      return b
    },
    eq: (c, v) => filtrar('eq', [c, v], (f) => iguales(f[c] ?? null, v)),
    neq: (c, v) => filtrar('neq', [c, v], (f) => !iguales(f[c] ?? null, v)),
    gt: (c, v) => filtrar('gt', [c, v], (f) => f[c] != null && comparar(f[c], v) > 0),
    gte: (c, v) => filtrar('gte', [c, v], (f) => f[c] != null && comparar(f[c], v) >= 0),
    lt: (c, v) => filtrar('lt', [c, v], (f) => f[c] != null && comparar(f[c], v) < 0),
    lte: (c, v) => filtrar('lte', [c, v], (f) => f[c] != null && comparar(f[c], v) <= 0),
    in: (c, v) => filtrar('in', [c, v], (f) => v.some((x) => iguales(f[c], x))),
    is: (c, v) => filtrar('is', [c, v], (f) => (f[c] ?? null) === v),
    not: (c, operador, v) => {
      if (operador === 'is') return filtrar('not', [c, operador, v], (f) => (f[c] ?? null) !== v)
      if (operador === 'eq') return filtrar('not', [c, operador, v], (f) => !iguales(f[c] ?? null, v))
      throw new Error(`Doble de Supabase: not(${operador}) no soportado`)
    },
    order(columna, opciones) {
      estado.ordenes.push({ columna, asc: opciones?.ascending !== false })
      return b
    },
    limit(n) {
      estado.limite = n
      return b
    },
    range(desde, hasta) {
      estado.rango = [desde, hasta]
      return b
    },
    async maybeSingle() {
      const r = await correr()
      if (r.error || !Array.isArray(r.data)) return r
      if (r.data.length > 1) return { data: null, count: null, error: err('PGRST116', 'más de una fila') }
      return { data: r.data[0] ?? null, count: r.count, error: null }
    },
    async single() {
      const r = await correr()
      if (r.error || !Array.isArray(r.data)) return r
      if (r.data.length !== 1) return { data: null, count: null, error: err('PGRST116', 'se esperaba una fila') }
      return { data: r.data[0], count: r.count, error: null }
    },
    then(alCumplir, alRechazar) {
      return correr().then(alCumplir, alRechazar)
    },
  }
  return b
}

// ---------------------------------------------------------------------------
// Los clientes
// ---------------------------------------------------------------------------

/** La service key: ve y escribe todo (saltea la RLS). */
export function clienteServicio(almacen: Almacen): ClienteDoble {
  return {
    from: (tabla) => constructor(almacen, 'servicio', tabla),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }
}

/** La sesión de un usuario: `rol: 'admin'` es un administrador (`is_admin()`); `usuario`, uno común. */
export function clienteSesion(almacen: Almacen, sesion: { rol: 'admin' | 'usuario'; userId: string }): ClienteDoble {
  return {
    from: (tabla) => constructor(almacen, sesion.rol, tabla),
    auth: { getUser: async () => ({ data: { user: { id: sesion.userId } }, error: null }) },
  }
}

/** Sin sesión: la clave anónima. */
export function clienteAnon(almacen: Almacen): ClienteDoble {
  return {
    from: (tabla) => constructor(almacen, 'anon', tabla),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }
}
