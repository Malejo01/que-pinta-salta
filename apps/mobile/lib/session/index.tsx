// Proveedor de sesión de Supabase para toda la app (R24). El login es
// opcional: ninguna pantalla depende de `session` para mostrar contenido,
// solo la pantalla de Cuenta cambia según haya o no sesión.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export type EstadoSesion = {
  session: Session | null
  cargando: boolean
}

const ESTADO_INICIAL: EstadoSesion = { session: null, cargando: true }

const SessionContext = createContext<EstadoSesion>(ESTADO_INICIAL)

/**
 * Pura (QPS-140, ítem 2). El estado con el que arranca el provider: con
 * cliente de Supabase, "cargando" hasta que se resuelva `getSession()`; sin
 * cliente (falta la config), no hay nada que leer y arranca sin sesión y sin
 * "cargando". La extraemos para que 28-q la prueba sin React.
 */
export function estadoInicialSesion(hayCliente: boolean): EstadoSesion {
  return hayCliente ? ESTADO_INICIAL : { session: null, cargando: false }
}

/**
 * Lee la sesión guardada al arrancar (`getSession`) y se suscribe a los
 * cambios (`onAuthStateChange`). Si `supabase` es `null` (falta la config),
 * el estado inicial ya quedó sin sesión y sin "cargando": el efecto sale de
 * una, sin `setEstado` sincrónico. Si `getSession()` falla (sin red, el
 * almacenamiento ilegible o el refresco de token rechazado), la app arranca
 * sin sesión en vez de quedarse "cargando" para siempre (QPS-140, ítem 2).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>(() => estadoInicialSesion(Boolean(supabase)))

  useEffect(() => {
    if (!supabase) return

    let activo = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (activo) setEstado({ session: data.session, cargando: false })
      })
      .catch(() => {
        if (activo) setEstado({ session: null, cargando: false })
      })

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (activo) setEstado({ session, cargando: false })
    })

    return () => {
      activo = false
      suscripcion.subscription.unsubscribe()
    }
  }, [])

  return <SessionContext.Provider value={estado}>{children}</SessionContext.Provider>
}

/** `{ session, cargando }`. `session` en `null` es un estado válido: sin login. */
export function useSession(): EstadoSesion {
  return useContext(SessionContext)
}
