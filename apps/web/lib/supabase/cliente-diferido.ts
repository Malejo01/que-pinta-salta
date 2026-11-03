/**
 * Q6-5 · El cliente de Supabase del navegador, cargado recién cuando hace falta.
 *
 * `@supabase/supabase-js` (auth, postgrest, storage, realtime) pesa ~240 KB sin
 * comprimir. Lo importaban de forma estática el navbar, el pie y el modal de
 * ingreso, que están en TODAS las páginas, así que viajaba en el JavaScript
 * inicial de todo el sitio aunque la mayoría de las visitas no inician sesión.
 * Medido con Lighthouse (celular), ese peso caía antes del LCP.
 *
 * Con esto el módulo `./client` (y supabase-js con él) se pide con `import()`
 * desde un efecto o un clic: el navbar y el pie lo cargan cuando el navegador
 * queda libre después de hidratar; el modal, al enviar el formulario. Una sola
 * descarga para los tres (la promesa se comparte, y `createBrowserClient` ya
 * devuelve siempre la misma instancia en el navegador).
 */
type ModuloCliente = typeof import("./client")
export type ClienteSupabaseNavegador = ReturnType<ModuloCliente["createClient"]>

let modulo: Promise<ModuloCliente> | null = null

/** El módulo `./client` (con `createClient` y `signInWithGoogle`), pedido una sola vez. */
export function cargarModuloCliente(): Promise<ModuloCliente> {
  if (!modulo) {
    modulo = import("./client").catch((error: unknown) => {
      // Si falló la descarga (sin red), el próximo pedido lo vuelve a intentar.
      modulo = null
      throw error
    })
  }
  return modulo
}

/** El cliente de Supabase del navegador, sin meter supabase-js en el JavaScript inicial. */
export async function clienteSupabase(): Promise<ClienteSupabaseNavegador> {
  const { createClient } = await cargarModuloCliente()
  return createClient()
}

/**
 * Corre `tarea` cuando el navegador está libre (`requestIdleCallback`, con
 * 2 s de tope), o en el próximo turno con `setTimeout` donde no existe
 * (Safari). Devuelve cómo cancelarla. Para lo que no tiene que competir con
 * la primera pintura ni con la hidratación, como leer la sesión.
 */
export function cuandoEsteLibre(tarea: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(tarea, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(tarea, 1)
  return () => window.clearTimeout(id)
}
