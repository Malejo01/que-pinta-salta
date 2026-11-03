// Q5-13 · Avisa «la app se abrió hoy» al arrancar y al volver al frente (una
// vez por día de Salta, ver lib/apertura.ts). No dibuja nada.
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import Constants from 'expo-constants'
import { avisarApertura } from '@/lib/apertura'
import { useSession } from '@/lib/session'
import { almacenPorDefecto } from '@/lib/sin-conexion/almacen'

export function SincronizadorApertura() {
  const { session, cargando } = useSession()
  const conCuenta = Boolean(session?.user.id)

  useEffect(() => {
    // Se espera a saber si hay sesión, así «con cuenta» es cierto desde el primer aviso.
    if (cargando) return
    const correr = () =>
      void avisarApertura({
        almacen: almacenPorDefecto,
        fetch,
        ahora: new Date(),
        plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
        version: Constants.expoConfig?.version ?? null,
        conCuenta,
      })
    correr()
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') correr()
    })
    return () => suscripcion.remove()
  }, [cargando, conCuenta])

  return null
}
