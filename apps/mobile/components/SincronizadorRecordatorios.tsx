// Q4-10: mantiene programados los recordatorios locales de lo guardado y los
// «Voy». Montado una sola vez en `app/_layout.tsx`; no dibuja nada.
//
// Sincroniza al resolver la sesión, al volver la app al frente, cuando cambia
// lo guardado (`avisarCambioGuardados`) y cuando cambia el estado del push
// (por ejemplo, la persona acaba de dar el permiso). Sin sesión, no hay nada
// guardado: cancela lo que hubiera. Nunca pide el permiso.
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { obtenerFavoritos } from '@/lib/favoritos'
import { usePush } from '@/lib/push'
import { suscribirCambiosGuardados } from '@/lib/recordatorios/cambios'
import { sincronizarRecordatorios } from '@/lib/recordatorios'
import { useSession } from '@/lib/session'
import { useIdioma } from '@/lib/i18n'

const ESPERA_MS = 800

export function SincronizadorRecordatorios() {
  const { session, cargando } = useSession()
  const { estado } = usePush()
  // Q6-1: los avisos salen en el idioma de la app; cambiarlo en Cuenta vuelve
  // a correr este efecto y reprograma todo con los textos nuevos.
  const { idioma, listo } = useIdioma()
  const userId = session?.user?.id ?? null
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userIdRef = useRef<string | null>(userId)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    if (cargando || !listo) return
    let vigente = true

    const correr = async () => {
      const id = userIdRef.current
      if (!id) {
        await sincronizarRecordatorios([], new Date(), { idioma })
        return
      }
      const r = await obtenerFavoritos(id)
      // Sin red no se toca nada: los recordatorios ya programados siguen.
      if (!vigente || !r.ok) return
      await sincronizarRecordatorios([...r.voy, ...r.eventos], new Date(), { idioma })
    }

    const programar = () => {
      if (temporizador.current) clearTimeout(temporizador.current)
      temporizador.current = setTimeout(() => {
        temporizador.current = null
        void correr().catch(() => {})
      }, ESPERA_MS)
    }

    programar()
    const bajaCambios = suscribirCambiosGuardados(programar)
    const bajaApp = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') programar()
    })
    return () => {
      vigente = false
      if (temporizador.current) clearTimeout(temporizador.current)
      bajaCambios()
      bajaApp.remove()
    }
  }, [userId, cargando, estado, idioma, listo])

  return null
}
