/**
 * Q6-3 · Registro por llamada en `ia_llamadas` (best-effort).
 *
 * Se guarda: para qué fue (`uso`), proveedor, modelo, tokens de entrada y de
 * salida, latencia y, si falló, el código normalizado. NUNCA el prompt, la
 * respuesta, la imagen, la clave ni datos personales. Si el registro falla,
 * la llamada sigue igual: solo queda un aviso genérico en el log.
 */
import { createClient } from '@supabase/supabase-js'
import type { CodigoErrorIA, ConsumoIA, ProveedorIA, ResultadoJson, ResultadoTexto, UsoIA } from './tipos'

export interface RegistroLlamadaIA {
  uso: UsoIA
  proveedor: ConsumoIA['proveedor']
  modelo: string
  tokensEntrada: number | null
  tokensSalida: number | null
  latenciaMs: number
  ok: boolean
  errorCodigo: CodigoErrorIA | null
}

export type RegistradorIA = (registro: RegistroLlamadaIA) => Promise<void> | void

/** La fila tal como va a la base (solo estas columnas, nada de contenido). */
export function filaDeRegistro(r: RegistroLlamadaIA) {
  return {
    uso: r.uso,
    proveedor: r.proveedor,
    modelo: r.modelo,
    tokens_entrada: r.tokensEntrada,
    tokens_salida: r.tokensSalida,
    latencia_ms: r.latenciaMs,
    ok: r.ok,
    error_codigo: r.errorCodigo,
  }
}

interface ClienteInsertable {
  from(tabla: string): { insert(fila: Record<string, unknown>): PromiseLike<{ error: unknown }> }
}

/** Registrador sobre un cliente de Supabase con service_role. */
export function crearRegistradorSupabase(cliente: ClienteInsertable): RegistradorIA {
  return async (registro) => {
    const { error } = await cliente.from('ia_llamadas').insert(filaDeRegistro(registro))
    if (error) throw new Error('insert')
  }
}

export const registradorNulo: RegistradorIA = () => {}

let clientePorDefecto: { url: string; clave: string; cliente: ClienteInsertable } | undefined

/**
 * El registrador de siempre: un cliente service_role de
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, creado al primer uso.
 * Sin esas variables (tests, desarrollo sin base) no registra nada.
 */
export function registradorPorDefecto(entorno: Record<string, string | undefined> = process.env): RegistradorIA {
  return async (registro) => {
    const url = entorno.NEXT_PUBLIC_SUPABASE_URL
    const clave = entorno.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !clave) return
    if (!clientePorDefecto || clientePorDefecto.url !== url || clientePorDefecto.clave !== clave) {
      const cliente = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } })
      clientePorDefecto = { url, clave, cliente: cliente as unknown as ClienteInsertable }
    }
    await crearRegistradorSupabase(clientePorDefecto.cliente)(registro)
  }
}

/** Corre el registrador sin dejar que nada (ni un throw sincrónico) llegue a quien llamó. */
export async function registrarSinRomper(registrar: RegistradorIA, registro: RegistroLlamadaIA): Promise<void> {
  try {
    await registrar(registro)
  } catch {
    // Sin detalle: el error de la base puede repetir la fila o la URL.
    console.warn('[ia] no se pudo registrar la llamada en ia_llamadas')
  }
}

function registroDe(uso: UsoIA, r: ResultadoTexto | ResultadoJson): RegistroLlamadaIA {
  return {
    uso,
    proveedor: r.uso.proveedor,
    modelo: r.uso.modelo,
    tokensEntrada: r.uso.tokensEntrada,
    tokensSalida: r.uso.tokensSalida,
    latenciaMs: r.uso.latenciaMs,
    ok: r.ok,
    errorCodigo: r.ok ? null : r.error.codigo,
  }
}

/** Envuelve un proveedor para que cada llamada quede registrada con su `uso`. */
export function conRegistro(proveedor: ProveedorIA, uso: UsoIA, registrar: RegistradorIA): ProveedorIA {
  const anotar = async <R extends ResultadoTexto | ResultadoJson>(r: R): Promise<R> => {
    await registrarSinRomper(registrar, registroDe(uso, r))
    return r
  }
  return {
    nombre: proveedor.nombre,
    modelo: proveedor.modelo,
    generarTexto: async (p) => anotar(await proveedor.generarTexto(p)),
    generarJson: async <T>(p: Parameters<ProveedorIA['generarJson']>[0]) => anotar(await proveedor.generarJson<T>(p)),
    generarJsonDesdeImagen: async <T>(p: Parameters<ProveedorIA['generarJsonDesdeImagen']>[0]) =>
      anotar(await proveedor.generarJsonDesdeImagen<T>(p)),
  }
}
