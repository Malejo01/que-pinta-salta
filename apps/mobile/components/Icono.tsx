// Único componente de ícono de la app (QPS-125, decisión 4 de Mauro del
// 13/10): envuelve `SymbolView` de `expo-symbols`. La doc del SDK 57
// (https://docs.expo.dev/versions/v57.0.0/sdk/symbols/) dice que en Android
// y en web usa Material Symbols, y que con un nombre suelto (un string) "On
// Android and web, nothing will be rendered unless you provide a
// `fallback`". Por eso `nombre` es siempre un objeto por plataforma, nunca
// un string: no hay ningún otro camino para pasarle un ícono a este
// componente.
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols'
import type { ColorValue } from 'react-native'

export interface NombreIcono {
  ios: SFSymbol
  /** Nombre de Material Symbols (https://fonts.google.com/icons). */
  android: AndroidSymbol
}

export interface IconoProps {
  nombre: NombreIcono
  tamanio?: number
  color?: ColorValue
}

export function Icono({ nombre, tamanio = 24, color }: IconoProps) {
  return (
    <SymbolView
      name={{ ios: nombre.ios, android: nombre.android, web: nombre.android }}
      size={tamanio}
      tintColor={color}
      style={{ width: tamanio, height: tamanio }}
    />
  )
}
