// Q4-11: programa «Este finde pinta» (jueves 18:00) con la agenda en caché.
// Montado una sola vez en `app/_layout.tsx`; no dibuja nada.
//
// - Recalcula al abrir la app, al volver al frente y cuando cambia el estado
//   del push (por ejemplo, la persona acaba de dar el permiso).
// - Si llega un «Aviso del equipo» (`data.aviso === 'equipo'`), lo anota: ese
//   día no sale el del finde. Lo ve en primer plano (al recibirlo) y en la
//   bandeja del sistema (al volver la app al frente).
// Nunca pide el permiso.
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { addNotificationReceivedListener, getPresentedNotificationsAsync } from 'expo-notifications'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { usePush } from '@/lib/push'
import { esAvisoDelEquipo, programarFinde, registrarAvisoDelEquipo } from '@/lib/finde'

async function revisarBandeja(): Promise<boolean> {
  try {
    const hoy = formatSaltaDayKey(new Date())
    const presentes = await getPresentedNotificationsAsync()
    return presentes.some((n) => esAvisoDelEquipo(n.request.content.data) && formatSaltaDayKey(new Date(n.date)) === hoy)
  } catch {
    return false
  }
}

export function SincronizadorFinde() {
  const { estado } = usePush()

  useEffect(() => {
    let vigente = true
    const correr = async () => {
      if (!vigente) return
      if (await revisarBandeja()) await registrarAvisoDelEquipo(new Date())
      else await programarFinde(new Date())
    }
    void correr().catch(() => {})

    const bajaApp = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') void correr().catch(() => {})
    })
    const bajaAvisos = addNotificationReceivedListener((n) => {
      if (esAvisoDelEquipo(n.request.content.data)) void registrarAvisoDelEquipo(new Date()).catch(() => {})
    })
    return () => {
      vigente = false
      bajaApp.remove()
      bajaAvisos.remove()
    }
  }, [estado])

  return null
}
