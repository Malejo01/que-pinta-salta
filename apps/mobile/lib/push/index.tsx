// Ronda 41, tarea 41-c: `PushProvider` y `usePush()`, con el mismo patrón
// que `lib/session` (createContext + provider + hook).
//
// "Una sola vez por sesión, a prueba de re-render" (trampa 4 del encargo):
// `onAuthStateChange` entrega un objeto `Session` nuevo en cada refresco de
// token (pasa cada hora), así que un `useEffect` con `[session]` en las
// dependencias se dispararía de nuevo aunque la persona sea la misma. Se
// guarda el último `user.id` sincronizado en un `useRef` (no en estado) y se
// compara: si es el mismo, el efecto no hace nada. Ningún `setInterval`, y
// ningún efecto depende del resultado de `sincronizarPush` (eso sería el
// bucle que la tarea prohíbe).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Linking } from 'react-native'
import { useSession } from '@/lib/session'
import { sincronizarPush } from './registro'
import type { EstadoPush } from './estado'

export interface ContextoPush {
  estado: EstadoPush
  /** `sincronizarPush({ preguntar: true })`: el botón de "activar notificaciones". */
  activar: () => Promise<EstadoPush>
  /** Igual que `activar`, pero para el botón de "reintentar" en los estados que fallaron. Siempre manual, nunca automático. */
  reintentar: () => Promise<void>
  /** `Linking.openSettings()`, con `.catch(() => {})`: nunca deja una excepción sin atrapar. */
  abrirAjustes: () => void
}

function sinEfecto(): Promise<void> {
  return Promise.resolve()
}

function sinEfectoSinSesion(): Promise<EstadoPush> {
  return Promise.resolve('sin-sesion')
}

/** Sin `PushProvider` montado, un contexto que no rompe: `sin-sesion` y funciones que no hacen nada. */
const CONTEXTO_POR_DEFECTO: ContextoPush = {
  estado: 'sin-sesion',
  activar: sinEfectoSinSesion,
  reintentar: sinEfecto,
  abrirAjustes: () => {},
}

const PushContext = createContext<ContextoPush>(CONTEXTO_POR_DEFECTO)

export function PushProvider({ children }: { children: ReactNode }) {
  const { session, cargando } = useSession()
  // El resultado de la última sincronización (automática o manual). Sin
  // sesión, no importa lo que tenga: `estado` (más abajo) lo pisa con
  // `sin-sesion`, derivado en el render, nunca con un `setEstado` sincrónico
  // dentro del efecto (eso dispara "Calling setState synchronously within
  // an effect", `react-hooks/set-state-in-effect`).
  const [estadoSincronizado, setEstadoSincronizado] = useState<EstadoPush>('sin-pedir')
  const ultimoUserIdSincronizado = useRef<string | null>(null)

  const userId = session?.user?.id ?? null

  // Un intento por arranque con sesión (41-r, "nada de reintentos
  // automáticos"): corre `sincronizarPush({ preguntar: false })` una sola
  // vez por `user.id`, nunca por cada `session` nuevo (ver el comentario de
  // arriba) y nunca por el resultado de la propia sincronización (sin
  // `estadoSincronizado` en las dependencias: el único `setEstadoSincronizado`
  // de este efecto está dentro del `.then`, nunca en el cuerpo sincrónico).
  useEffect(() => {
    if (cargando) return

    if (!userId) {
      // Mutar el ref no es un `setState`: no dispara `set-state-in-effect`.
      // Así, un reingreso (mismo u otro `user.id`) después de un cierre de
      // sesión se vuelve a sincronizar en vez de darse por hecho.
      ultimoUserIdSincronizado.current = null
      return
    }

    if (ultimoUserIdSincronizado.current === userId) return
    ultimoUserIdSincronizado.current = userId

    let vigente = true
    sincronizarPush({ preguntar: false })
      .then((resultado) => {
        if (vigente) setEstadoSincronizado(resultado)
      })
      .catch(() => {
        // `sincronizarPush` ya no debería tirar (registro.ts protege las
        // cuatro llamadas nativas), pero sin este `.catch()` una excepción
        // inesperada queda como "unhandled rejection" silenciosa y
        // `estadoSincronizado` se congela en `'sin-pedir'` para siempre
        // (el hallazgo del revisor). Red de última instancia: deja el
        // botón de "Reintentar" en vez de nada.
        if (vigente) setEstadoSincronizado('error-registro')
      })

    return () => {
      vigente = false
    }
  }, [userId, cargando])

  // Sin `userId`, el estado público es siempre `sin-sesion` (incluso si
  // `ultimoUserIdSincronizado` todavía tiene el resultado de una sesión
  // anterior): no hace falta "limpiar" nada en el efecto de arriba.
  const estado: EstadoPush = !userId ? 'sin-sesion' : estadoSincronizado

  const correr = useCallback(async (preguntar: boolean): Promise<EstadoPush> => {
    setEstadoSincronizado('pidiendo')
    try {
      const resultado = await sincronizarPush({ preguntar })
      setEstadoSincronizado(resultado)
      return resultado
    } catch {
      // Red de última instancia (igual razón que el `.catch()` del efecto
      // de arriba): sin esto, una excepción inesperada deja el `await`
      // rechazado sin que corra el segundo `setEstadoSincronizado`, y el
      // estado (y el botón) quedan clavados en `'pidiendo'` para siempre,
      // sin mensaje y sin forma de reintentar sin reiniciar la app.
      setEstadoSincronizado('error-registro')
      return 'error-registro'
    }
  }, [])

  const activar = useCallback(() => correr(true), [correr])
  const reintentar = useCallback(async () => {
    await correr(true)
  }, [correr])
  const abrirAjustes = useCallback(() => {
    Linking.openSettings().catch(() => {})
  }, [])

  const value: ContextoPush = { estado, activar, reintentar, abrirAjustes }

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

/** `{ estado, activar, reintentar, abrirAjustes }`. Sin provider montado, el contexto por defecto (`sin-sesion`, funciones que no hacen nada). */
export function usePush(): ContextoPush {
  return useContext(PushContext)
}
