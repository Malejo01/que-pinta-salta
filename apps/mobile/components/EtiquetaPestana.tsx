// QPS-243 (Ronda 49, 49-c): la etiqueta de texto de las pestañas de abajo
// (`app/(tabs)/_layout.tsx`), con tope de escala de fuente.
//
// Antes, `screenOptions.tabBarLabelStyle` (un objeto de estilo) traía el
// `fontSize`/`fontFamily` de la etiqueta, pero un objeto de estilo no acepta
// `maxFontSizeMultiplier` (eso es una prop de `<Text>`, no un atributo de
// estilo) — ver el párrafo de `ESCALA_MAXIMA_COMPACTA` en
// `lib/accesibilidad.ts`. Por eso la etiqueta pasa a dibujarse con este
// componente propio, usado desde `screenOptions.tabBarLabel`.
//
// Componente con nombre (no una flecha anónima): evita el warning de
// `react/display-name`, mismo motivo que `crearTabBarIcon` en `_layout.tsx`.
//
// `color` es el que manda react-navigation (la firma real de `tabBarLabel`,
// en `expo-router/build/react-navigation/bottom-tabs/types.d.ts`, lo tipa
// como `ColorValue`, no como `string`); `children` ahí es siempre `string`.
import type { ColorValue } from 'react-native'
import { Texto } from '@/components/Texto'
import { ESCALA_MAXIMA_COMPACTA } from '@/lib/accesibilidad'

export interface EtiquetaPestanaProps {
  color: ColorValue
  children: string
}

export function EtiquetaPestana({ color, children }: EtiquetaPestanaProps) {
  return (
    <Texto
      style={{ fontSize: 12, fontFamily: 'Montserrat_600SemiBold', color }}
      maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}
      numberOfLines={1}
    >
      {children}
    </Texto>
  )
}
