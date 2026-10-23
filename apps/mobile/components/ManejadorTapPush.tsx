// Ronda 41, tarea 41-d: qué pasa cuando alguien toca un aviso push (o lo
// tocó antes de abrir la app) y el aviso que se ve con la app abierta.
// Renderiza `null`: no tiene interfaz propia.
import { useEffect, useRef } from 'react'
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  setNotificationHandler,
  type NotificationResponse,
} from 'expo-notifications'
import { useRouter } from 'expo-router'
import { claveRespuesta, eventoIdDesdeDatosPush } from '@/lib/push/tap'

// A NIVEL DE MÓDULO, no dentro del componente ni de un efecto: con la app
// abierta, el primer aviso puede llegar antes de que el efecto de un
// componente corra. Nombres de campo de la versión instalada
// (expo-notifications ~57.0.23, confirmado en su .d.ts): el booleano único
// viejo para mostrar la alerta está deprecado; ahora son dos campos
// separados, `shouldShowBanner` y `shouldShowList`. Sin sonido y sin badge.
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

/** `components/ManejadorTapPush.tsx` — montado una sola vez en `app/_layout.tsx`. */
export function ManejadorTapPush() {
  const router = useRouter()
  // No en estado: un `setState` en el camino de la navegación es un
  // re-render de más, y `react-hooks/set-state-in-effect` es error de lint
  // en este repo (no warning).
  const clavesProcesadas = useRef<Set<string>>(new Set())

  useEffect(() => {
    function manejarRespuesta(respuesta: NotificationResponse) {
      const clave = claveRespuesta(respuesta)
      // Un `identifier` vacío o nulo no deduplica nada: tratarlo como "ya
      // procesado" podría comerse una navegación legítima distinta (dos
      // avisos sin identifier, por lo que fuera, no son necesariamente el
      // mismo tap). Mejor navegar de más que perder una navegación real.
      if (clave) {
        if (clavesProcesadas.current.has(clave)) return
        clavesProcesadas.current.add(clave)
      }

      // El `data` es un dato externo y no confiable (ver `lib/push/tap.ts`):
      // nunca se loguea su contenido.
      const id = eventoIdDesdeDatosPush(respuesta.notification.request.content.data)
      if (!id) return

      // Navegación interna, siempre con el objeto tipado: nunca un template
      // string ni `Linking.openURL` con algo que venga del push.
      router.push({ pathname: '/evento/[id]', params: { id } })
    }

    // `getLastNotificationResponseAsync` es asincrónico: el componente se
    // puede desmontar antes de que resuelva (igual que `lib/session/index.tsx`).
    let vigente = true
    getLastNotificationResponseAsync().then((respuesta) => {
      if (vigente && respuesta) manejarRespuesta(respuesta)
    })

    const suscripcion = addNotificationResponseReceivedListener(manejarRespuesta)

    return () => {
      vigente = false
      suscripcion.remove()
    }
  }, [router])

  return null
}
