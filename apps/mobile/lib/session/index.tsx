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
 * Lee la sesión guardada al arrancar (`getSession`) y se suscribe a los
 * cambios (`onAuthStateChange`). Si `supabase` es `null` (falta la config),
 * no hay sesión y `cargando` pasa a `false` de una.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>(ESTADO_INICIAL)

  useEffect(() => {
    if (!supabase) {
      setEstado({ session: null, cargando: false })
      return
    }

    let activo = true

    supabase.auth.getSession().then(({ data }) => {
      if (activo) setEstado({ session: data.session, cargando: false })
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
