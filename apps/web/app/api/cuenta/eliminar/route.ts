import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { usuarioDeRequest } from "@/lib/auth/usuario-de-request"
import { eliminarCuenta } from "@/lib/cuenta/eliminar"

export const dynamic = "force-dynamic"

const CONFIRMACION_ESPERADA = "ELIMINAR"

/**
 * Candado en memoria: un pedido de borrado en curso por usuario. No hay
 * nada de rate limiting en este repo (se buscó antes de escribir esto), así
 * que esto no lo reemplaza: solo evita el doble clic del mismo usuario.
 * **Limitación real:** en Vercel corren varias instancias del mismo
 * deployment, así que este `Set` es por instancia, no una garantía global.
 * No protege contra un ataque coordinado, solo contra mandar el mismo
 * pedido dos veces desde la misma pestaña/instancia.
 */
const pedidosEnCurso = new Set<string>()

/**
 * `POST /api/cuenta/eliminar`: borra para siempre la cuenta de quien hace el
 * pedido. Solo `POST`: no se exportan `GET`, `PUT` ni `DELETE`.
 *
 * El orden de las guardas de abajo importa y es, a propósito, el orden en
 * el que están escritas:
 *
 * 1. Content-Type exacto (una capa más, no la defensa principal; ver el
 *    comentario de esa guarda).
 * 2. Origen (si viene `Origin`, que coincida con el propio sitio: junto con
 *    el `SameSite=Lax` de la cookie de sesión, es la defensa real contra CSRF).
 * 3. Usuario autenticado — **con el cliente del RPC todavía sin crear**.
 * 4. Confirmación explícita (`"ELIMINAR"` literal).
 * 5. El `user_id` sale únicamente del usuario del paso 3 (nunca del body).
 * 6. Candado por usuario (evita doble clic).
 * 7. Recién acá se arma el cliente del RPC y corre el borrado de verdad
 *    (QPS-190: `public.delete_my_account()`, en una sola transacción —
 *    nunca la service role).
 */
export async function POST(request: Request) {
  // 1. Content-Type exacto: NO es la defensa principal contra CSRF de este
  // endpoint (esa son el chequeo de `Origin` del paso 2 y el `SameSite=Lax`
  // de la cookie de sesión de `@supabase/ssr`, que no viaja en un POST
  // cross-site: no hay override de `sameSite` en este repo). Esta guarda es
  // una capa más: sacar del juego a un `<form>` HTML cross-site, que solo
  // puede mandar `application/x-www-form-urlencoded`, `multipart/form-data`
  // o `text/plain` (los tres "CORS-safelisted", sin preflight).
  //
  // Por eso la comparación tiene que ser con el tipo exacto (sin el
  // parámetro `charset`), nunca con un `includes()`: un `Content-Type:
  // text/plain;charset=application/json` CONTIENE la cadena
  // "application/json", pero su *essence* (la parte antes del `;`) es
  // `text/plain`, uno de los tres "CORS-safelisted" de la spec de Fetch, así
  // que el navegador NO dispara preflight para ese valor. Un `includes()`
  // dejaría pasar justo el caso que esta guarda tiene que cortar.
  const tipoDeContenido = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  if (tipoDeContenido !== "application/json") {
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 415 })
  }

  // Se lee una sola vez acá; el paso 7 (elegir el cliente del RPC) y el paso
  // 8 (decidir si hay una cookie de sesión que cerrar) reutilizan la lectura
  // y el criterio de abajo.
  const encabezadoAuth = request.headers.get("authorization")

  // Mismo criterio que `usuarioDeRequest` (`lib/auth/usuario-de-request.ts`)
  // para elegir Bearer vs. cookie, calculado UNA sola vez y reutilizado en
  // los dos lugares de abajo (paso 7 y paso 8) en vez de repetir la
  // expresión. Esto no es un detalle de estilo: tiene que ser EXACTAMENTE
  // el mismo criterio que usó `usuarioDeRequest` en el paso 3, porque si no,
  // se abre un agujero real. Ejemplo concreto: un pedido con un Bearer de la
  // persona A **y** una cookie de sesión de la persona B a la vez.
  // `usuarioDeRequest` devuelve A (gana el Bearer), así que el paso 3 y el
  // candado del paso 6 evalúan a A. Si el cliente del RPC se armara con otro
  // criterio (por ejemplo, "si hay cookie, usar cookie"), ese cliente
  // correría con `auth.uid()` = B, y el RPC borraría la cuenta de B en vez
  // de la de A — exactamente lo opuesto de lo que el endpoint acaba de
  // autenticar. Calculando `vinoPorBearer` una sola vez y usándolo para las
  // dos decisiones, el cliente del RPC siempre representa a la misma
  // persona que `usuarioDeRequest` eligió.
  const vinoPorBearer = Boolean(encabezadoAuth?.startsWith("Bearer ") && encabezadoAuth.slice(7).trim())

  // 2. Origen: si viene `Origin` (lo manda el navegador en same-origin y en
  // cross-site), tiene que coincidir con el origen de este mismo sitio. La
  // app nativa no manda `Origin`, así que su ausencia no bloquea el pedido.
  const origenRecibido = request.headers.get("origin")
  if (origenRecibido !== null) {
    const origenDelSitio = new URL(request.url).origin
    if (origenRecibido !== origenDelSitio) {
      return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 403 })
    }
  }

  // 3. Usuario autenticado. OJO: el cliente del RPC todavía NO se creó. Si
  // no hay usuario, se corta aquí con 401.
  const usuario = await usuarioDeRequest(request)
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  // 4. Confirmación explícita: comparación estricta, literal, sin trim ni
  // normalización (eso ya lo hace la pantalla antes de mandar el pedido).
  // Un body que no es JSON válido también es 400, nunca una excepción sin
  // manejar.
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 400 })
  }

  const confirmacion =
    cuerpo !== null && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>).confirmacion : undefined
  if (confirmacion !== CONFIRMACION_ESPERADA) {
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 400 })
  }

  // 5. El id de la cuenta a borrar sale ÚNICA Y EXCLUSIVAMENTE del usuario
  // autenticado del paso 3. A propósito, en este archivo no se lee ningún
  // `user_id`, `userId`, `id` ni `email` del body: si alguien los manda, se
  // ignoran por completo.
  const userId = usuario.id

  // 6. Candado por usuario: un pedido en curso por vez. Se libera siempre
  // con `finally`, también si `eliminarCuenta` tira, para no dejar a nadie
  // bloqueado para siempre por un error de una sola vez.
  if (pedidosEnCurso.has(userId)) {
    return NextResponse.json({ error: "Ya hay un pedido de borrado en curso" }, { status: 409 })
  }
  pedidosEnCurso.add(userId)

  try {
    // 7. Recién ahora se arma el cliente del RPC y corre el borrado de
    // verdad. Nunca la service role: el RPC `delete_my_account()` tiene el
    // EXECUTE revocado para `service_role` (y, con esa clave, `auth.uid()`
    // sería `null` del lado de Postgres, así que no tendría a quién
    // borrar). El cliente se elige con el MISMO criterio (`vinoPorBearer`,
    // calculado arriba) que usó `usuarioDeRequest` en el paso 3, para que
    // represente exactamente a la misma persona.
    let clienteDeLaPersona: Parameters<typeof eliminarCuenta>[0]
    if (vinoPorBearer) {
      // Patrón exacto de `app/api/radar/prueba/route.ts`: anon key + el
      // Bearer de la persona en los headers globales, nunca la service key.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anonKey) {
        console.error("[EliminarCuenta] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.")
        return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 500 })
      }
      const token = encabezadoAuth!.slice("Bearer ".length).trim()
      clienteDeLaPersona = createSupabaseClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
    } else {
      clienteDeLaPersona = await createClient()
    }

    const resultado = await eliminarCuenta(clienteDeLaPersona, userId)

    if (!resultado.ok) {
      // Se logea únicamente `paso` y el `código`/`mensaje` que extrajo
      // `eliminarCuenta` del error del RPC — nunca `details` ni `hint` de
      // un `PostgrestError`: un error de FK de Postgres mete el valor de la
      // clave (acá, el uuid de la persona) en `details`, y la regla de la
      // ronda es que ni la respuesta ni el log lleven el `userId` ni el
      // email.
      console.error("[EliminarCuenta] Falló el borrado de cuenta:", {
        paso: resultado.paso,
        codigo: resultado.codigo,
        mensaje: resultado.detalle,
      })
      const mensaje = resultado.paso === "rpc" ? "No se borró nada" : "No se pudo eliminar la cuenta"
      return NextResponse.json({ error: mensaje }, { status: 500 })
    }

    // 8. Si la sesión era por cookie (la web), cerrarla del lado del
    // servidor. Si era por Bearer (la app), no hay cookie que cerrar: no
    // tiene sentido tocar el cliente de cookies. Mismo `vinoPorBearer` que
    // el paso 7, calculado arriba una sola vez. Más correcto que antes de
    // esta tarea: después del RPC, el usuario ya no existe en `auth.users`.
    if (!vinoPorBearer) {
      // Con scope "local" alcanza: limpia las cookies de esta respuesta sin
      // pedirle nada al servidor de Supabase, que podría fallar porque el
      // usuario ya no existe. Si de todos modos falla, no lo convertimos en
      // un 500: la cuenta ya está borrada para siempre, eso no se deshace.
      try {
        const supabaseDeSesion = await createClient()
        await supabaseDeSesion.auth.signOut({ scope: "local" })
      } catch (errorAlCerrarSesion) {
        console.error(
          "[EliminarCuenta] No se pudo cerrar la sesión del servidor tras un borrado exitoso:",
          errorAlCerrarSesion,
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (excepcion) {
    console.error("[EliminarCuenta] Excepción al eliminar la cuenta:", excepcion)
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 500 })
  } finally {
    pedidosEnCurso.delete(userId)
  }
}
