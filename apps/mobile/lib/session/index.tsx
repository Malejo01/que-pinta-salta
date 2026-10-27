// Proveedor de sesión de Supabase para toda la app (R24). El login es
// opcional: ninguna pantalla depende de `session` para mostrar contenido,
// solo la pantalla de Cuenta cambia según haya o no sesión.
//
// R43 (43-d, plan `ops/rondas/43-sin-conexion/plan.md`, decisiones 8 y 9):
// suma `sinConexion` (decisión 9 — el token venció y no hay red para
// refrescarlo, así que Favoritos puede mostrar la caché en vez de "Entrá…")
// y el borrado de la caché de favoritos al cambiar de usuario (decisión 8).
// Las dos reglas viven en `reducirSesion`/`debeBorrarCacheFavoritos`, puras
// y exportadas para probarse sin montar React
// (`tests/sesion-cache.test.ts`). Nada de lo de la sesión se loguea en este
// archivo: ni el id, ni el email, ni el token — tampoco en un `catch`.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isAuthRetryableFetchError, type AuthChangeEvent, type Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { borrarCacheFavoritos } from '../sin-conexion/cache'

export type EstadoSesion = {
  session: Session | null
  cargando: boolean
  /**
   * `true` solo cuando `getSession()` devolvió `session: null` con un error
   * que `isAuthRetryableFetchError` reconoce (o rechazó con uno así): el
   * token venció y no hay red para refrescarlo (plan, decisión 9). Un
   * `INITIAL_SESSION` con `null` que llega después por `onAuthStateChange`
   * NO lo apaga — es justo el evento que llega al arrancar sin red. Lo
   * apagan una sesión no nula o un `SIGNED_OUT`.
   */
  sinConexion: boolean
}

const ESTADO_INICIAL: EstadoSesion = { session: null, cargando: true, sinConexion: false }

const SessionContext = createContext<EstadoSesion>(ESTADO_INICIAL)

/**
 * Pura (QPS-140, ítem 2). El estado con el que arranca el provider: con
 * cliente de Supabase, "cargando" hasta que se resuelva `getSession()`; sin
 * cliente (falta la config), no hay nada que leer y arranca sin sesión y sin
 * "cargando". La extraemos para que 28-q la prueba sin React.
 */
export function estadoInicialSesion(hayCliente: boolean): EstadoSesion {
  return hayCliente ? ESTADO_INICIAL : { session: null, cargando: false, sinConexion: false }
}

/**
 * Lo que necesita `reducirSesion` para decidir el próximo estado: el estado
 * actual y el "usuario conocido" (el `useRef` del provider, nunca estado de
 * React porque no tiene que disparar un render propio).
 *
 * `usuarioConocido` en `undefined` significa "no sé quién es" (todavía no se
 * resolvió ninguna carga, o la carga inicial terminó en `sinConexion`): en
 * ese estado nunca se borra la caché de favoritos, para que un arranque sin
 * red no borre lo que se está mostrando (plan, decisión 8). `null` es "sé
 * que no hay sesión" — ahí sí se borra si antes había alguien.
 */
export interface SesionActual {
  estado: EstadoSesion
  usuarioConocido: string | null | undefined
}

export interface ResultadoSesion {
  estado: EstadoSesion
  usuarioConocido: string | null | undefined
  borrarCacheFavoritos: boolean
}

/**
 * Las dos formas en que puede cambiar la sesión: la carga inicial
 * (`getSession()`, una sola vez) y cualquier evento de
 * `onAuthStateChange` después. `errorDeRed` lo calcula el provider con
 * `isAuthRetryableFetchError` (de `@supabase/supabase-js`) sobre el `error`
 * de `getSession()` o sobre lo que atrapó su `.catch` — nunca acá, para que
 * esta función siga sin tocar la librería de Supabase.
 */
export type AccionSesion =
  | { tipo: 'carga-inicial'; session: Session | null; errorDeRed: boolean }
  | { tipo: 'cambio'; evento: AuthChangeEvent; session: Session | null }

function calcularSinConexion(sinConexionPrevio: boolean, accion: AccionSesion): boolean {
  if (accion.tipo === 'carga-inicial') return accion.session === null && accion.errorDeRed
  // `onAuthStateChange`: lo apagan una sesión no nula o un `SIGNED_OUT`. Un
  // `INITIAL_SESSION` con `null` (o cualquier otro evento con `null` que no
  // sea `SIGNED_OUT`) deja `sinConexion` como estaba.
  if (accion.session !== null) return false
  if (accion.evento === 'SIGNED_OUT') return false
  return sinConexionPrevio
}

/**
 * `false` si `previo === undefined` (todavía no se sabe quién era: no hay
 * nada que borrar) o si `nuevo === previo` (sigue siendo la misma persona,
 * sesión o ausencia de sesión); `true` en cualquier otro caso: de una
 * cuenta a `null` (cerró sesión o venció sin red y encima se cerró en otro
 * lado), de una cuenta a otra (cambió de cuenta) y de `null` a una cuenta
 * (cubre una caché de favoritos que volvió de un backup de Android con una
 * sesión vieja: plan, decisión 8).
 *
 * **Esta tabla es la que aplica siempre, salvo un caso** (vuelta 1 de
 * revisión de 43-d): un `SIGNED_OUT` explícito tiene que borrar aunque
 * todavía no se supiera quién era el usuario (`previo === undefined`) —
 * por ejemplo, si la carga inicial terminó en `sinConexion` y la persona
 * recuperó la red y tocó "Cerrar sesión" antes de que algún evento
 * confirmara su identidad. Lo único que de verdad no deja nada para
 * borrar es saber CON CERTEZA que no había sesión (`previo === null`), no
 * el desconocimiento. Para ese único caso, `reducirSesion` pasa
 * `opciones.cierreDeSesionExplicito: true`, que desactiva el atajo de
 * `previo === undefined` (pero deja todo lo demás de la tabla intacto: con
 * `previo === null` sigue dando `false`, porque ahí `nuevo !== previo` ya
 * es `false` sin necesidad del atajo).
 */
export function debeBorrarCacheFavoritos(
  previo: string | null | undefined,
  nuevo: string | null | undefined,
  opciones?: { cierreDeSesionExplicito?: boolean },
): boolean {
  if (previo === undefined && !opciones?.cierreDeSesionExplicito) return false
  return nuevo !== previo
}

/**
 * Pura: decide el próximo `EstadoSesion`, el próximo "usuario conocido" y si
 * hay que borrar la caché de favoritos, a partir del estado/usuario
 * actuales y de una acción. El provider solo cablea esto con `useRef` +
 * `useState` + el borrado best-effort (ver `SessionProvider`).
 *
 * Mientras `sinConexion` sigue encendido (porque la acción no lo apaga, ver
 * `calcularSinConexion`), el usuario conocido NO se toca: si se actualizara
 * a `null` con cada `INITIAL_SESSION` sin red, la vuelta normal de la misma
 * sesión más adelante se vería como un cambio de usuario (`null` → la
 * cuenta de siempre) y borraría por error la caché que `sinConexion` está
 * protegiendo.
 *
 * Un `SIGNED_OUT` real SIEMPRE pasa por `debeBorrarCacheFavoritos` con
 * `cierreDeSesionExplicito: true` (ver el docstring de esa función): sin
 * esto, un cierre de sesión que llega con el usuario todavía en
 * `undefined` (el camino de "sin red al arrancar, se recupera la red y se
 * toca Cerrar sesión antes de que se confirme la cuenta") no borraba nada y
 * dejaba la lista de favoritos de esa persona en el disco.
 */
export function reducirSesion(actual: SesionActual, accion: AccionSesion): ResultadoSesion {
  const sinConexion = calcularSinConexion(actual.estado.sinConexion, accion)
  const usuarioConocido = sinConexion ? actual.usuarioConocido : (accion.session?.user.id ?? null)
  const cierreDeSesionExplicito = accion.tipo === 'cambio' && accion.evento === 'SIGNED_OUT'

  return {
    estado: { session: accion.session, cargando: false, sinConexion },
    usuarioConocido,
    borrarCacheFavoritos: debeBorrarCacheFavoritos(actual.usuarioConocido, usuarioConocido, {
      cierreDeSesionExplicito,
    }),
  }
}

// ---------------------------------------------------------------------------
// El borrado de la caché de favoritos (plan, decisión 8): fire-and-forget a
// propósito (nunca bloquea el cambio de estado — ver `aplicar`, más abajo),
// pero `esperarBorradoDeCache` deja que OTRO lugar (43-c, antes de leer la
// caché de Favoritos) espere a que no quede ninguno en vuelo, para no
// mostrarle a la cuenta B la caché que todavía no se terminó de borrar
// después de un cambio de A a B. Estado a nivel de módulo (como
// `versionesViejasLimpiadas` en `lib/sin-conexion/cache.ts`): hay un solo
// cliente de Supabase y un solo `SessionProvider` real en la app.
// ---------------------------------------------------------------------------
const borradosEnCurso = new Set<Promise<void>>()

/**
 * Dispara `borrarCacheFavoritos()` sin esperarlo, pero lo deja anotado en
 * `borradosEnCurso` hasta que termine. Nunca tira (ya envuelve el
 * `.catch`). Exportada sobre todo para su propio test
 * (`tests/sesion-cache.test.ts`, que necesita poder meter un borrado "en
 * curso" controlado para probar `esperarBorradoDeCache`); dentro de la app,
 * el único llamador real es `aplicar`, en `SessionProvider`.
 */
export function dispararBorradoDeCacheFavoritos(): void {
  const promesa = borrarCacheFavoritos().catch(() => {})
  borradosEnCurso.add(promesa)
  void promesa.finally(() => {
    borradosEnCurso.delete(promesa)
  })
}

/**
 * Resuelve de inmediato si no hay ningún borrado de la caché de favoritos
 * en curso; si hay uno o más, espera a que todos terminen. Nunca rechaza:
 * cada promesa en `borradosEnCurso` ya pasó por su propio `.catch`. Para
 * quien necesite leer la caché de favoritos justo después de un cambio de
 * sesión (43-c) y no quiera arriesgarse a leerla a mitad de un borrado.
 */
export async function esperarBorradoDeCache(): Promise<void> {
  if (borradosEnCurso.size === 0) return
  await Promise.all(borradosEnCurso)
}

/**
 * Lee la sesión guardada al arrancar (`getSession`) y se suscribe a los
 * cambios (`onAuthStateChange`). Si `supabase` es `null` (falta la config),
 * el estado inicial ya quedó sin sesión y sin "cargando": el efecto sale de
 * una, sin `setEstado` sincrónico. Si `getSession()` falla o devuelve
 * `null` con un error que no es de red, la app arranca sin sesión en vez de
 * quedarse "cargando" para siempre (QPS-140, ítem 2); si el error SÍ es de
 * red (`isAuthRetryableFetchError`), arranca con `sinConexion: true` en vez
 * de perderlo.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>(() => estadoInicialSesion(Boolean(supabase)))
  // Espejo del estado en un `useRef`: el efecto de abajo corre una sola vez
  // (deps `[]`), así que la variable `estado` de este render queda fija en
  // su closure para siempre. `aplicar` necesita el estado MÁS RECIENTE
  // (para `calcularSinConexion`, que a veces depende del `sinConexion`
  // anterior) sin pasar por el updater de `setEstado` (vuelta 1 de revisión
  // de 43-d: los efectos secundarios — mutar `usuarioConocidoRef` y disparar
  // el borrado — no pueden vivir adentro de un updater, porque React puede
  // invocarlo más de una vez sin aplicar el resultado).
  const estadoRef = useRef<EstadoSesion>(estado)
  const usuarioConocidoRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return

    let activo = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!activo) return
        aplicar({ tipo: 'carga-inicial', session: data.session, errorDeRed: isAuthRetryableFetchError(error) })
      })
      .catch((error) => {
        if (!activo) return
        aplicar({ tipo: 'carga-inicial', session: null, errorDeRed: isAuthRetryableFetchError(error) })
      })

    // Aplica una `AccionSesion` a través de `reducirSesion`: calcula el
    // resultado (puro) y actualiza `estadoRef`/`usuarioConocidoRef` y
    // dispara el borrado ANTES de llamar a `setEstado`, con el valor ya
    // calculado (nunca un updater con efectos adentro). El borrado sigue
    // siendo best-effort y sin `await`: el cambio de estado no espera a que
    // termine de borrarse nada.
    function aplicar(accion: AccionSesion) {
      const resultado = reducirSesion(
        { estado: estadoRef.current, usuarioConocido: usuarioConocidoRef.current },
        accion,
      )
      estadoRef.current = resultado.estado
      usuarioConocidoRef.current = resultado.usuarioConocido
      if (resultado.borrarCacheFavoritos) {
        dispararBorradoDeCacheFavoritos()
      }
      setEstado(resultado.estado)
    }

    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento, session) => {
      if (!activo) return
      aplicar({ tipo: 'cambio', evento, session })
    })

    return () => {
      activo = false
      suscripcion.subscription.unsubscribe()
    }
  }, [])

  return <SessionContext.Provider value={estado}>{children}</SessionContext.Provider>
}

/**
 * A6 (nube Q1): "Reintentar" de Mis eventos y Radar cuando no hay sesión
 * porque no se pudo confirmar por falta de red (`sinConexion`). Vuelve a
 * pedir `getSession()`: con el token vencido, supabase-js intenta refrescarlo
 * ahí mismo y, si lo logra, avisa por `onAuthStateChange`
 * (`TOKEN_REFRESHED`) — el `SessionProvider` de arriba ya está suscripto y
 * apaga `sinConexion` por `reducirSesion`, sin nada nuevo en este archivo.
 * Devuelve si quedó una sesión (para que la pantalla anuncie "Seguimos sin
 * conexión" si no). Nunca tira, y no loguea nada (ni el token ni el error).
 */
export async function reintentarSesion(): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data } = await supabase.auth.getSession()
    return data.session !== null
  } catch {
    return false
  }
}

/** `{ session, cargando, sinConexion }`. `session` en `null` es un estado válido: sin login. */
export function useSession(): EstadoSesion {
  return useContext(SessionContext)
}
