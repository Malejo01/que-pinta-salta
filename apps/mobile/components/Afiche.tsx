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
//
// R29-q (integración de la tanda 3, punto C): `resizeMode` y `blurRadius`,
// opcionales, con los valores de hoy por omisión (`'cover'` y sin blur) —
// las agrega el Hero (ops/paridad-web-app.md §3.2 punto 2 y §2 punto 7) para
// poner el afiche entero en `contain` sobre su propia versión en `cover` +
// `blurRadius` de fondo, sin que `Hero.tsx` tenga que reimplementar la
// cadena variante → original → fallback con `onError` ni la validación de
// hosts (que sigue siendo, exactamente igual que antes, la que hace
// `fuentesDeImagen` comparando el host parseado con `URL`, nunca el texto —
// la regla de la R28, auditada por seguridad). Ninguna de las dos props
// toca esa cadena: solo cambian cómo se dibuja la `<Image>` una vez que ya
// se decidió qué URL mostrar.
import { type ReactNode, useState } from 'react'
import { Image, StyleSheet, View, type ImageResizeMode } from 'react-native'
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
  /**
   * Cómo encaja la imagen en su contenedor (`resizeMode` de `<Image>`).
   * `'cover'` por defecto — el comportamiento de siempre, sin cambios para
   * quien no pase esta prop. El Hero pasa `'contain'` para el afiche de
   * arriba (el que se ve entero, sobre su versión en `'cover'` + blur).
   */
  resizeMode?: ImageResizeMode
  /**
   * Radio de desenfoque de la imagen (prop nativa de `<Image>`, Android/iOS).
   * `undefined` por defecto — sin blur, el comportamiento de siempre. El
   * Hero lo usa para la capa de fondo desenfocada.
   */
  blurRadius?: number
  /**
   * R42, 42-d: avisa cuando termina de decidirse qué mostrar — `'imagen'`
   * si el `<Image>` real terminó de cargar (`onLoad`), `'marca'` si ya no
   * queda ninguna fuente que probar (el `onError` que fuerza el índice fuera
   * de rango). Si no hay ninguna fuente válida DESDE EL PRINCIPIO (sin URL,
   * host no permitido, o Storage sin `supabaseUrl`), `Afiche` devuelve el
   * `fallback` (o la marca de hoy) sin dibujar ningún `<Image>`: no hay
   * `onLoad` ni `onError`, así que esta prop NUNCA se llama en ese caso —
   * quien la use y necesite saber ese caso también (como `TarjetaCompartir`,
   * 42-d) lo resuelve por su cuenta con `fuentesDeImagen`, la misma función
   * pura que usa este componente. `undefined` por defecto: sin esta prop,
   * nada cambia.
   */
  alTerminar?: (resultado: 'imagen' | 'marca') => void
}

export function Afiche({ url, estilo, llenar, fallback, ancho, resizeMode, blurRadius, alTerminar }: AficheProps) {
  // `key={url}` remonta `AficheInterno` cada vez que cambia la URL, así el
  // índice de la fuente vuelve a 0 sin un efecto ni un setState sincrónico.
  return (
    <AficheInterno
      key={url ?? ''}
      url={url}
      estilo={estilo}
      llenar={llenar}
      fallback={fallback}
      ancho={ancho}
      resizeMode={resizeMode}
      blurRadius={blurRadius}
      alTerminar={alTerminar}
    />
  )
}

function AficheInterno({ url, estilo, llenar, fallback, ancho, resizeMode, blurRadius, alTerminar }: AficheProps) {
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
      resizeMode={resizeMode ?? 'cover'}
      blurRadius={blurRadius}
      onLoad={() => alTerminar?.('imagen')}
      onError={() => {
        const siguiente = siguienteFuente(fuentes, indice)
        if (siguiente !== null) {
          setIndice(indice + 1)
        } else {
          // No queda ninguna fuente: se fuerza un índice fuera de rango
          // para que `fuenteActual` dé `null` y se muestre la marca.
          setIndice(fuentes.length)
          alTerminar?.('marca')
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
