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
import { sembrarPreferenciasDeCuenta } from '@/lib/notificaciones'
import { sincronizarPush } from './registro'
import type { EstadoPush } from './estado'

export interface ContextoPush {
  estado: EstadoPush
  /** `true` cuando ya resolvió la primera sincronización con sesión de esta persona; antes, `estado` es provisorio. */
  sincronizado: boolean
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
  sincronizado: false,
  activar: sinEfectoSinSesion,
  reintentar: sinEfecto,
  abrirAjustes: () => {},
}

const PushContext = createContext<ContextoPush>(CONTEXTO_POR_DEFECTO)

/** Clave de sincronización de quien usa la app sin cuenta (R82 / Q4-2). */
const SIN_CUENTA = '__sin-cuenta__'

export function PushProvider({ children }: { children: ReactNode }) {
  const { session, cargando } = useSession()
  // El resultado de la última sincronización (automática o manual), con o
  // sin sesión. Nunca se setea sincrónico dentro del efecto (eso dispara
  // "Calling setState synchronously within an effect",
  // `react-hooks/set-state-in-effect`).
  const [estadoSincronizado, setEstadoSincronizado] = useState<EstadoPush>('sin-pedir')
  // La «clave» de quien está usando el teléfono: el `user.id` o, sin sesión,
  // `SIN_CUENTA` (R82 / Q4-2: los avisos también funcionan sin cuenta). La
  // clave cuya primera sincronización ya resolvió se guarda en estado y
  // `sincronizado` se deriva en el render comparándola con la actual; el único
  // `setState` está dentro de `.then`/`.catch`, nunca sincrónico en el efecto.
  const [claveResuelta, setClaveResuelta] = useState<string | null>(null)
  const ultimaClaveSincronizada = useRef<string | null>(null)

  const userId = session?.user?.id ?? null
  const clave = userId ?? SIN_CUENTA

  // Un intento por arranque y por cambio de sesión (41-r, "nada de
  // reintentos automáticos"): corre `sincronizarPush({ preguntar: false })`
  // una sola vez por clave (al entrar: vincula el teléfono a la cuenta; al
  // salir: lo vuelve a registrar sin cuenta). Con `preguntar: false` nunca
  // se pide el permiso en frío: si no estaba concedido, solo se lee.
  useEffect(() => {
    if (cargando) return
    if (ultimaClaveSincronizada.current === clave) return
    ultimaClaveSincronizada.current = clave

    let vigente = true
    sincronizarPush({ preguntar: false, conSesion: userId !== null })
      .then((resultado) => {
        if (!vigente) return
        setEstadoSincronizado(resultado)
        setClaveResuelta(clave)
        // Al entrar a la cuenta con el teléfono ya registrado sin cuenta: si
        // la cuenta todavía no eligió preferencias, se siembran con lo que
        // el teléfono tenía. Si ya tenía, mandan las de la cuenta. No tira.
        if (resultado === 'activo' && userId) void sembrarPreferenciasDeCuenta(userId)
      })
      .catch(() => {
        // Red de última instancia (`sincronizarPush` no debería tirar): deja
        // el botón de "Reintentar" en vez de congelar el estado.
        if (!vigente) return
        setEstadoSincronizado('error-registro')
        setClaveResuelta(clave)
      })

    return () => {
      vigente = false
      // Si el efecto se limpia antes de resolver (cambió la sesión a mitad),
      // la clave vuelve a quedar pendiente para la próxima vez.
      if (ultimaClaveSincronizada.current === clave) ultimaClaveSincronizada.current = null
    }
  }, [clave, userId, cargando])

  // R82 / Q4-2: con el provider montado, el estado ya no es `sin-sesion`
  // (ese valor queda solo para el contexto por defecto, sin provider).
  const estado: EstadoPush = estadoSincronizado
  const sincronizado = !cargando && claveResuelta === clave

  const correr = useCallback(async (preguntar: boolean): Promise<EstadoPush> => {
    setEstadoSincronizado('pidiendo')
    try {
      const resultado = await sincronizarPush({ preguntar, conSesion: userId !== null })
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
  }, [userId])

  const activar = useCallback(() => correr(true), [correr])
  const reintentar = useCallback(async () => {
    await correr(true)
  }, [correr])
  const abrirAjustes = useCallback(() => {
    Linking.openSettings().catch(() => {})
  }, [])

  const value: ContextoPush = { estado, sincronizado, activar, reintentar, abrirAjustes }

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

/** `{ estado, activar, reintentar, abrirAjustes }`. Sin provider montado, el contexto por defecto (`sin-sesion`, funciones que no hacen nada). */
export function usePush(): ContextoPush {
  return useContext(PushContext)
}
