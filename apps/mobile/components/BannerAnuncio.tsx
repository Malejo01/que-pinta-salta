// R60/52-c: AdMob en la app (fase 2 de la R52; la web ya tiene AdSense desde
// la R52 principal). Este archivo es el segundo (y último) lugar, dentro de
// lib/, components/ y app/, que importa el SDK de anuncios — ver el
// detector en `tests/anuncios-ids.test.ts`.
//
// Corrección del lead sobre el texto original de la tarea: la tarea decía
// "si no hay conexión (el mismo indicador que usa AvisoSinConexion)", pero
// ese indicador no existe — `AvisoSinConexion` solo recibe `guardadoEn: Date`
// y la decisión de mostrarlo la toma la pantalla (`app/(tabs)/index.tsx:249`,
// `estado.desdeCache`); `lib/red.ts` es por respuesta, no un estado global.
// Por eso este componente recibe `sinConexion` como prop (`false` por
// omisión) y es la pantalla la que la pasa — este archivo NO importa
// `lib/red.ts` ni inventa un detector de conexión propio.
import { useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Constants from 'expo-constants'
import {
  BannerAd,
  // `ANCHORED_ADAPTIVE_BANNER` está `@deprecated` en el `.d.ts` del SDK a
  // favor de `LARGE_ANCHORED_ADAPTIVE_BANNER` (otro formato, más alto). Se
  // usa el deprecado a propósito: es lo que fija la tarea aprobada; el
  // cambio de formato es una decisión de producto, ya anotada para Mauro —
  // no se cambia por cuenta propia acá.
  BannerAdSize,
  TestIds,
  type AdErrorPayload,
} from 'react-native-google-mobile-ads'
import { Texto } from '@/components/Texto'
import { ESCALA_MAXIMA_COMPACTA } from '@/lib/accesibilidad'
import { idBloque, type LugarAnuncio } from '@/lib/anuncios/ids'
import { anunciosListos, suscribirse } from '@/lib/anuncios/consentimiento'
import { leerEnv } from '@/lib/env'

export interface BannerAnuncioProps {
  lugar: LugarAnuncio
  /** La pantalla decide (ver el comentario de cabecera): `false` por omisión. */
  sinConexion?: boolean
}

export function BannerAnuncio({ lugar, sinConexion = false }: BannerAnuncioProps) {
  // Mismo patrón que `app/(tabs)/cuenta.tsx` (`lib/version.ts`): se lee acá y
  // se le pasa a `idBloque` tal cual (ese módulo no importa `expo-constants`).
  // Vuelta 1 de revisión (seguridad): SIN fallback a `''` acá — `idBloque`
  // ahora recibe `unknown` y es quien decide, fail closed, qué cuenta como
  // "no producción" (ver su docstring). Resolver a `''` en este archivo
  // reintroduciría el mismo agujero que se corrigió ahí.
  const entorno = Constants.expoConfig?.extra?.entorno

  const env = leerEnv()
  const id = idBloque(lugar, { entorno, plataforma: Platform.OS, env, idPrueba: TestIds.ADAPTIVE_BANNER })

  const [listo, setListo] = useState(anunciosListos)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    if (listo) return
    return suscribirse(() => setListo(anunciosListos()))
  }, [listo])

  if (!env.anunciosHabilitados) return null
  if (id === null) return null
  if (!listo) return null
  if (sinConexion) return null
  if (fallo) return null

  function onAdFailedToLoad(_error: Error & Partial<AdErrorPayload>): void {
    // Sin cartel de respaldo en la app (decisión 5 de Mauro): el componente
    // entero se cierra y no vuelve a intentar.
    setFallo(true)
  }

  return (
    <View style={estilos.contenedor} accessible accessibilityLabel="Publicidad">
      <Texto tono="secundario" style={estilos.rotulo} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
        Publicidad
      </Texto>
      {/* Banner adaptativo: el propio SDK calcula su ancho (sin medir la pantalla a mano). */}
      <BannerAd unitId={id} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} onAdFailedToLoad={onAdFailedToLoad} />
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    alignItems: 'center',
  },
  rotulo: {
    fontSize: 11,
    marginBottom: 2,
  },
})
