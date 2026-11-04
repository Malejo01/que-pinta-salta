// Q6-6 · El hook delgado de `lib/anunciar-aviso.ts`: le dice al lector de
// pantalla un aviso cuando aparece o cambia (errores, confirmaciones, el
// idioma nuevo). Vive aparte porque importa `react-native`, que Vitest no
// transforma (mismo motivo que `lib/anunciar-conteo-hook.ts`); se prueba con
// detectores sobre el fuente (tests/accesibilidad-q6.test.ts).
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { anunciar } from '@/lib/anunciar'
import { crearAnunciadorDeAviso } from '@/lib/anunciar-aviso'

/** Anuncia `texto` cuando aparece o cambia (`null` = no hay aviso). */
export function useAnunciarAviso(texto: string | null): void {
  const [anunciador] = useState(() =>
    crearAnunciadorDeAviso({ anunciar: (t) => anunciar(t), reloj: { setTimeout, clearTimeout }, plataforma: Platform.OS }),
  )

  useEffect(() => {
    anunciador.observar(texto)
  }, [anunciador, texto])

  useEffect(() => () => anunciador.cancelar(), [anunciador])
}
