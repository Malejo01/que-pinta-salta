// La vista de la ficha, con origen `app` (R43, tarea 43-e; ver también
// `ops/rondas/43-sin-conexion/plan.md`, decisión 10). En la web,
// `components/view-beacon.tsx` manda `POST /api/metricas/vista` al montar la
// ficha; acá no hay `navigator.sendBeacon`, así que se usa `fetch` directo,
// con el `User-Agent` propio que exige `userAgentApp` (core) para no caer en
// `BOT_UA_RE` (que incluye `okhttp`, el que pone el `fetch` de React Native
// en Android si no se le pasa otro).
//
// Medir nunca rompe la ficha: `registrarVistaEvento` nunca tira ni loguea
// (todos los errores se atrapan en silencio), no hay cola ni reintento y no
// se guarda nada. Un `eventId` que no es uuid no hace ningún `fetch`
// (`cuerpoVista` da `null`).
//
// Puro (sin React ni `expo-constants`) a propósito: Vitest de esta app corre
// con `environment: 'node'` (ver `vitest.config.ts`) y, al transformar
// `node_modules/react-native/index.js` (que importa `expo-constants`),
// Rollup rompe con la sintaxis Flow `import typeof * as ... from '...'`
// (confirmado corriendo el test). `useVistaEvento` — que sí necesita React y
// `Constants.expoConfig?.version` — vive en `lib/metricas-hook.ts`.
import { cuerpoVista, urlVista, userAgentApp } from '@qps/core/metricas/vista-app'
import { fetchConTimeout } from '@/lib/red'

const TIMEOUT_VISTA_MS = 5000

export interface OpcionesVistaEvento {
  /** `fetch` a usar (inyectable para test); por defecto, el global. */
  fetch?: typeof fetch
  /** Versión de la app para el `User-Agent` (la pasa `useVistaEvento`, de `lib/metricas-hook.ts`); por defecto, `''` (da `QuePintaSaltaApp/0`). */
  version?: string
}

/**
 * Manda la vista de `eventId` con origen `app`, con un `User-Agent` propio.
 * Un id que no es uuid no hace ningún `fetch`. Nunca tira: cualquier error
 * (de red, de timeout o lo que sea) se atrapa y se ignora.
 */
export async function registrarVistaEvento(eventId: string, opciones: OpcionesVistaEvento = {}): Promise<void> {
  const body = cuerpoVista(eventId)
  if (!body) return

  const fetchBase = opciones.fetch ?? fetch
  const version = opciones.version ?? ''

  try {
    await fetchConTimeout(fetchBase, TIMEOUT_VISTA_MS)(urlVista(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgentApp(version),
      },
      body,
    })
  } catch {
    // Medir nunca debe romper la ficha: sin cola, sin reintento.
  }
}
