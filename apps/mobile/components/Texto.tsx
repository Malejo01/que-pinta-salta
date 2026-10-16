// Montserrat global (29-g, punto 3): un `Text` base con `fontFamily` según
// el peso (los 3 que carga `app/_layout.tsx`: 400, 600 y 700) y el color
// según el tono, usando `useColoresQPS()`. El texto secundario va siempre en
// `mutedForeground`, nunca en `border` (ops/paridad-web-app.md §2, punto 10).
// Las pantallas se pasan a este componente en sus propias tareas (29-b en
// adelante); acá solo se define.
import { Text, type TextProps } from 'react-native'
import { useColoresQPS } from '@/lib/colores'

export type PesoTexto = 'normal' | 'semibold' | 'bold'
export type TonoTexto = 'texto' | 'secundario' | 'primario'

const FAMILIA_POR_PESO: Record<PesoTexto, string> = {
  normal: 'Montserrat_400Regular',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
}

export interface TextoProps extends TextProps {
  /** `'normal'` por defecto (Montserrat 400). */
  peso?: PesoTexto
  /** `'texto'` por defecto (`colores.foreground`). `'secundario'` usa
   * `colores.mutedForeground` — nunca `border`. */
  tono?: TonoTexto
}

export function Texto({ peso = 'normal', tono = 'texto', style, ...resto }: TextoProps) {
  const colores = useColoresQPS()
  const colorPorTono: Record<TonoTexto, string> = {
    texto: colores.foreground,
    secundario: colores.mutedForeground,
    primario: colores.primary,
  }

  return (
    <Text
      style={[{ fontFamily: FAMILIA_POR_PESO[peso], color: colorPorTono[tono] }, style]}
      {...resto}
    />
  )
}
