// Afiche de un evento, flyer o película de cine (R28, 28-e: F2). Decide con
// `fuentesDeImagen` (pura, en lib/imagenes/) qué URLs vale la pena pedir —
// nuestro Storage (`flyers_ig`, con la variante WebP primero — 400 por
// defecto, 800 en la ficha, R29 §3.4 — y `flyers`) y los hosts de
// ticketeras/cines que ya acepta la CSP de la web (R28 revierte la decisión
// de la R25 de no pedirle nada a un host de tercero) — y va probando una
// por una con `onError`: si falla la variante, cae al original; si falla
// también el original, muestra la marca (o el `fallback` que pase quien use
// `Afiche`). `Image` de React Native en todos los casos (nunca
// `expo-image`, que no está aprobada).
import { type ReactNode, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { useTheme } from 'expo-router'
import type { VariantWidth } from '@qps/core/images/variants'
import { leerEnv } from '@/lib/env'
import { fuentesDeImagen, siguienteFuente } from '@/lib/imagenes/url-segura'
import LOGO_MARCA from '@/assets/logo-circular.png'

// Solo el tamaño: así el mismo valor sirve para el `<View>` de la marca
// (espera ViewStyle) y para el `<Image>` (espera ImageStyle) sin pelearse
// con sus diferencias de tipos (por ejemplo `overflow`).
export interface AficheEstilo {
  width?: number
  height?: number
  borderRadius?: number
}

export interface AficheProps {
  url: string | null | undefined
  estilo?: AficheEstilo
  /**
   * Si es `true`, ocupa el 100% del contenedor (`width`/`height: '100%'`,
   * `resizeMode="cover"`) en vez del tamaño chico de 64×64: para el flyer a
   * sangre de la tarjeta 2:3 (28-f). Ignora `estilo` (el tamaño lo pone el
   * contenedor).
   */
  llenar?: boolean
  /**
   * Qué mostrar cuando no queda ninguna fuente válida (sin URL, host no
   * permitido, o todas las fuentes fallaron). Si no viene, se muestra la
   * marca de hoy (el logo circular).
   */
  fallback?: ReactNode
  /**
   * Ancho de la variante WebP a pedir primero para `flyers_ig` (400 u 800,
   * como en la web, `VariantWidth`). Por defecto 400 (tarjeta y el resto);
   * la ficha (`app/evento/[id].tsx`) pasa 800.
   */
  ancho?: VariantWidth
}

export function Afiche({ url, estilo, llenar, fallback, ancho }: AficheProps) {
  // `key={url}` remonta `AficheInterno` cada vez que cambia la URL, así el
  // índice de la fuente vuelve a 0 sin un efecto ni un setState sincrónico.
  return <AficheInterno key={url ?? ''} url={url} estilo={estilo} llenar={llenar} fallback={fallback} ancho={ancho} />
}

function AficheInterno({ url, estilo, llenar, fallback, ancho }: AficheProps) {
  const { colors } = useTheme()
  const supabaseUrl = leerEnv().supabase?.url ?? null
  const fuentes = fuentesDeImagen(url, supabaseUrl, ancho)
  const [indice, setIndice] = useState(0)

  const fuenteActual = fuentes[indice] ?? null

  if (!fuenteActual) {
    if (fallback !== undefined) return <>{fallback}</>

    return (
      <View
        style={[
          llenar ? estilos.marcaLlenar : estilos.marca,
          { backgroundColor: colors.card, borderColor: colors.border },
          !llenar ? estilo : undefined,
        ]}
      >
        <Image source={LOGO_MARCA} style={estilos.logo} resizeMode="contain" />
      </View>
    )
  }

  return (
    <Image
      source={{ uri: fuenteActual }}
      style={llenar ? estilos.imagenLlenar : [estilos.imagen, estilo]}
      resizeMode="cover"
      onError={() => {
        const siguiente = siguienteFuente(fuentes, indice)
        if (siguiente !== null) {
          setIndice(indice + 1)
        } else {
          // No queda ninguna fuente: se fuerza un índice fuera de rango
          // para que `fuenteActual` dé `null` y se muestre la marca.
          setIndice(fuentes.length)
        }
      }}
    />
  )
}

const estilos = StyleSheet.create({
  imagen: { width: 64, height: 64, borderRadius: 8 },
  imagenLlenar: { width: '100%', height: '100%' },
  marca: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaLlenar: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 32, height: 32, opacity: 0.6 },
})
