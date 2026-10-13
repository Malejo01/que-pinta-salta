// Bandera "ya se mostró la Bienvenida" (R25, decisión 2 de Mauro del 13/10).
// Clave propia en SecureStore, sin usar el adaptador de la sesión
// (`lib/session/`, `lib/secure-storage.ts`, que son de la R24 y no se
// tocan): esto es un solo booleano, bien por debajo del límite de 2048
// bytes de SecureStore, así que no necesita partirse en pedazos.
import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'

export const CLAVE_BIENVENIDA_VISTA = 'qps.bienvenida.vista'

/** `true` si el teléfono ya marcó la Bienvenida como vista. */
export async function bienvenidaFueVista(): Promise<boolean> {
  const valor = await SecureStore.getItemAsync(CLAVE_BIENVENIDA_VISTA)
  return valor === '1'
}

/** Marca la Bienvenida como vista: no se vuelve a mostrar en este teléfono. */
export async function marcarBienvenidaVista(): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_BIENVENIDA_VISTA, '1')
}

export interface EstadoBienvenida {
  /** `true` mientras se lee SecureStore la primera vez. */
  cargando: boolean
  /** Solo válido cuando `cargando` es `false`. */
  vista: boolean
}

/** Lee la bandera al montar. Mientras `cargando` es `true`, `vista` no es confiable. */
export function useBienvenidaVista(): EstadoBienvenida {
  const [estado, setEstado] = useState<EstadoBienvenida>({ cargando: true, vista: false })

  useEffect(() => {
    let activo = true
    bienvenidaFueVista().then((vista) => {
      if (activo) setEstado({ cargando: false, vista })
    })
    return () => {
      activo = false
    }
  }, [])

  return estado
}
