// Q4-11: programa «Este finde pinta» (jueves 18:00) con la agenda en caché.
// Montado una sola vez en `app/_layout.tsx`; no dibuja nada.
//
// - Recalcula al abrir la app, al volver al frente y cuando cambia el estado
//   del push (por ejemplo, la persona acaba de dar el permiso).
// - Si llega un «Aviso del equipo» (`data.aviso === 'equipo'`), lo anota: ese
//   día no sale el del finde. Lo ve en primer plano (al recibirlo) y en la
//   bandeja del sistema (al volver la app al frente).
// - Q5-16 (decisión nº17): también si la persona TOCÓ el aviso con la app
//   cerrada. Al tocarlo sale de la bandeja y el listener de «recibido» no
//   corre, así que se mira la última respuesta (`getLastNotificationResponseAsync`)
//   y se escuchan los toques (`addNotificationResponseReceivedListener`).
// - Q6-8: si lo DESCARTÓ sin tocarlo (no queda en la bandeja), `programarFinde`
//   le pregunta al servidor el jueves (`GET /api/app/aviso-equipo?dia=`) y,
//   si el equipo ya lo mandó, no deja programado el del finde.
//   Lo que queda afuera: el aviso llega con la app cerrada y la persona no
//   abre la app (ni la trae al frente) entre ese momento y las 18. Sin código
//   que corra con la app cerrada no hay forma de cancelar una notificación
//   local ya programada; cubrirlo necesita `expo-task-manager` (dependencia
//   nueva y build nativo): la opción quedó escrita en el PR de Q6-8.
// Nunca pide el permiso.
import { useEffect } from 'react'
import { AppState } from 'react-native'
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  getPresentedNotificationsAsync,
} from 'expo-notifications'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { usePush } from '@/lib/push'
import { useIdioma } from '@/lib/i18n'
import { avisoDelEquipoDeHoy, esAvisoDelEquipo, programarFinde, registrarAvisoDelEquipo } from '@/lib/finde'

async function revisarBandeja(): Promise<boolean> {
  try {
    const hoy = formatSaltaDayKey(new Date())
    const presentes = await getPresentedNotificationsAsync()
    if (presentes.some((n) => avisoDelEquipoDeHoy(n.request.content.data, n.date, hoy))) return true
    // Q5-16: el aviso que se tocó ya no está en la bandeja.
    const tocada = await getLastNotificationResponseAsync()
    return !!tocada && avisoDelEquipoDeHoy(tocada.notification.request.content.data, tocada.notification.date, hoy)
  } catch {
    return false
  }
}

export function SincronizadorFinde() {
  const { estado } = usePush()
  // Q6-1: el aviso sale en el idioma de la app; cambiarlo en Cuenta vuelve a
  // correr este efecto y lo reprograma con el texto nuevo.
  const { idioma, listo } = useIdioma()

  useEffect(() => {
    if (!listo) return
    let vigente = true
    const correr = async () => {
      if (!vigente) return
      if (await revisarBandeja()) await registrarAvisoDelEquipo(new Date(), { idioma })
      else await programarFinde(new Date(), { idioma })
    }
    void correr().catch(() => {})

    const bajaApp = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') void correr().catch(() => {})
    })
    const bajaAvisos = addNotificationReceivedListener((n) => {
      if (esAvisoDelEquipo(n.request.content.data)) void registrarAvisoDelEquipo(new Date(), { idioma }).catch(() => {})
    })
    const bajaToques = addNotificationResponseReceivedListener((r) => {
      if (esAvisoDelEquipo(r.notification.request.content.data)) void registrarAvisoDelEquipo(new Date(), { idioma }).catch(() => {})
    })
    return () => {
      vigente = false
      bajaApp.remove()
      bajaAvisos.remove()
      bajaToques.remove()
    }
  }, [estado, idioma, listo])

  return null
}
