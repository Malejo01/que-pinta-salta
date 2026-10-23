// `useVistaEvento` (R43, 43-e): necesita React (`useEffect`/`useRef`) y
// `expo-constants` (para la versión de la app), que rompen Vitest al
// transformar `node_modules/react-native/index.js` (sintaxis Flow, ver el
// comentario de `lib/metricas.ts`). Por eso vive separado: así
// `registrarVistaEvento` se puede probar de verdad en `apps/mobile`, que
// corre con `environment: 'node'` y sin runner de React Native (no hay
// `@testing-library/react-native` en el repo). Este archivo se prueba con un
// detector estático sobre `app/evento/[id].tsx` (`tests/vista-evento.test.ts`).
import { useEffect, useRef } from 'react'
import Constants from 'expo-constants'
import { registrarVistaEvento } from '@/lib/metricas'

/**
 * Manda una vista por montaje y por `eventId` (mismo criterio que
 * `apps/web/components/view-beacon.tsx`: un `useRef` evita el doble envío
 * frente a un remontaje con el mismo id). Con `eventId` en `null` (la ficha
 * todavía no cargó, o el id no es válido) no manda nada. Sin `await` en el
 * render: el `fetch` se dispara dentro del efecto, sin bloquear nada.
 */
export function useVistaEvento(eventId: string | null): void {
  const enviadoPara = useRef<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    if (enviadoPara.current === eventId) return
    enviadoPara.current = eventId

    registrarVistaEvento(eventId, { version: Constants.expoConfig?.version })
  }, [eventId])
}
