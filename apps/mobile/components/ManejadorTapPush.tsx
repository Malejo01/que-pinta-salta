// Ronda 41, tarea 41-d: qué pasa cuando alguien toca un aviso push (o lo
// tocó antes de abrir la app) y el aviso que se ve con la app abierta.
// Renderiza `null`: no tiene interfaz propia.
//
// Ronda 51, tarea 51-e: suma el botón de baja rápida de los avisos
// patrocinados ("No recibir más"): `registrarCategoriasPush` (al montar,
// `lib/push/categorias.ts`) y `interpretarRespuestaPush` (en vez de
// `eventoIdDesdeDatosPush` directo) para decidir si el tap abre la ficha (con
// o sin la franja de `AvisoPatrocinado`) o baja la preferencia.
//
// Vuelta 1 de revisión de 51-e: con la app CERRADA (el caso para el que
// existe `opensAppToForeground: true`, `lib/push/categorias.ts`), la
// respuesta del botón puede llegar ANTES de que `lib/session/index.tsx`
// termine de resolver `getSession()` — en ese instante hay sesión, pero
// `cargando` todavía es `true`. `decidirBajaPatrocinados` (`lib/push/tap.ts`)
// es quien distingue ese caso ("esperar") de "no hay sesión de verdad"
// ("pedir-sesion"): acá solo se cablea el estado pendiente (`bajaPendienteRef`)
// y se la vuelve a evaluar cuando la sesión se resuelve.
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  setNotificationHandler,
  type NotificationResponse,
} from 'expo-notifications'
import { useRouter } from 'expo-router'
import { avisar } from '@/lib/aviso'
import { cambiarPatrocinados } from '@/lib/notificaciones'
import { registrarCategoriasPush } from '@/lib/push/categorias'
import { claveRespuesta, decidirBajaPatrocinados, interpretarRespuestaPush, type DecisionBajaPatrocinados } from '@/lib/push/tap'
import { useSession } from '@/lib/session'

/** El estado de la sesión que necesita `decidirBajaPatrocinados`, espejado en una `ref` (ver `ManejadorTapPush`). */
type EstadoCuentaParaBaja = { userId: string | null; cargando: boolean }

/**
 * Aplica una decisión YA resuelta (nunca `'esperar'`: `resolverBajaPendiente`
 * filtra ese caso antes de llamar acá) — guarda la preferencia o avisa que
 * hace falta iniciar sesión. Nunca navega. Función de módulo (no del
 * componente): no depende de ninguna variable de render, así que no hace
 * falta memoizarla ni declararla en ningún arreglo de dependencias.
 */
function aplicarDecisionBaja(decision: DecisionBajaPatrocinados): void {
  if (decision.accion === 'esperar') return // defensivo: no debería llegar nunca (ver resolverBajaPendiente)

  if (decision.accion === 'pedir-sesion') {
    avisar('Entrá a tu cuenta para apagar los avisos patrocinados.')
    return
  }

  cambiarPatrocinados(decision.userId, false).then((resultadoCambio) => {
    if (resultadoCambio.ok) {
      avisar('Listo: no te vamos a mandar más avisos patrocinados. Podés volver a prenderlos en Cuenta.')
    } else {
      avisar(resultadoCambio.mensaje)
    }
  })
}

/**
 * Si hay una baja pendiente (`bajaPendienteRef.current`), la vuelve a
 * evaluar con el estado ACTUAL de la sesión (`estadoCuentaRef.current`): si
 * todavía no se sabe (`'esperar'`), no hace nada y la deja pendiente; si ya
 * se sabe (`'guardar'`/`'pedir-sesion'`), la aplica y limpia la pendiente —
 * se aplica UNA SOLA VEZ. Función de módulo, igual que `aplicarDecisionBaja`
 * (recibe las `ref` por parámetro en vez de cerrarlas por closure, así no
 * depende de ningún valor de un render en particular).
 */
function resolverBajaPendiente(
  bajaPendienteRef: MutableRefObject<boolean>,
  estadoCuentaRef: MutableRefObject<EstadoCuentaParaBaja>,
): void {
  if (!bajaPendienteRef.current) return
  const decision = decidirBajaPatrocinados(estadoCuentaRef.current)
  if (decision.accion === 'esperar') return
  bajaPendienteRef.current = false
  aplicarDecisionBaja(decision)
}

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
  const { session, cargando } = useSession()
  // No en estado: un `setState` en el camino de la navegación es un
  // re-render de más, y `react-hooks/set-state-in-effect` es error de lint
  // en este repo (no warning).
  const clavesProcesadas = useRef<Set<string>>(new Set())

  // El efecto de más abajo (el que escucha el tap) se suscribe UNA SOLA VEZ
  // (deps `[router]`, igual que antes de la R51): si le sumáramos
  // `session`/`cargando` a esas deps, cada login/logout (o la resolución
  // inicial de `getSession()`) desuscribiría y volvería a suscribir el
  // listener sin necesidad. La solución es una `ref` con el estado actual de
  // la sesión (`userId`/`cargando`, lo que necesita `decidirBajaPatrocinados`),
  // leída recién en el momento de procesar la respuesta (no en el momento en
  // que se armó el listener) — la escritura de esa `ref` NO puede ir directo
  // en el cuerpo del componente (leer/escribir una ref durante el render es
  // el error de lint `react-hooks/refs` de este repo): va en su propio
  // efecto, con `session`/`cargando` en sus deps.
  const estadoCuentaRef = useRef<EstadoCuentaParaBaja>({ userId: session?.user.id ?? null, cargando })
  // Una baja rápida que llegó mientras la sesión todavía estaba cargando
  // (arranque en frío, ver el comentario de cabecera): queda marcada acá
  // hasta que la sesión se resuelva.
  const bajaPendienteRef = useRef(false)

  useEffect(() => {
    estadoCuentaRef.current = { userId: session?.user.id ?? null, cargando }
    // La sesión acaba de resolver (o cambió): si quedó una baja pendiente
    // del arranque en frío, reintentarla ahora con el estado ya conocido.
    resolverBajaPendiente(bajaPendienteRef, estadoCuentaRef)
  }, [session, cargando])

  // Un intento por arranque, no por aviso: ver `registrarCategoriasPush`
  // (`lib/push/categorias.ts`, nunca propaga su error) sobre qué pasa si
  // falla — el aviso igual llega, solo que sin el botón de baja rápida.
  useEffect(() => {
    registrarCategoriasPush()
  }, [])

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
      // nunca se loguea su contenido. `interpretarRespuestaPush` es el único
      // filtro (también decide el botón de baja rápida de los patrocinados).
      const resultado = interpretarRespuestaPush(respuesta)

      if (resultado.accion === 'abrir') {
        const { id, patrocinado } = resultado
        // Navegación interna, siempre con el objeto tipado: nunca un
        // template string ni `Linking.openURL` con algo que venga del push.
        router.push({ pathname: '/evento/[id]', params: patrocinado ? { id, patrocinado: '1' } : { id } })
        return
      }

      if (resultado.accion === 'baja-patrocinados') {
        // El `userId` sale SOLO de la sesión activa del teléfono
        // (`estadoCuentaRef.current`, nunca del `data` del push: la única
        // garantía de que el usuario es quien dice ser es la sesión, no el
        // contenido del push — ver el comentario de `cambiarPatrocinados` en
        // `lib/notificaciones.ts`). `decidirBajaPatrocinados` es quien decide
        // si ya se puede guardar, si hay que esperar (arranque en frío, la
        // sesión todavía está cargando) o si de verdad no hay sesión —
        // marcar la baja como pendiente ANTES de intentar resolverla cubre
        // los tres casos: si ya se puede, se aplica ahora mismo; si no, la
        // deja para el efecto que actualiza `estadoCuentaRef` (arriba).
        bajaPendienteRef.current = true
        resolverBajaPendiente(bajaPendienteRef, estadoCuentaRef)
        return
      }

      // 'nada': no hay nada que hacer (no navega, no guarda nada).
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
