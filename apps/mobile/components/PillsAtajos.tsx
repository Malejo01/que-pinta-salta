// Pills de atajos de la portada (R29, 29-h, D3 de ops/paridad-web-app.md §1:
// "dejar los atajos de la app con el estilo de las pills de la web"). Los 4
// atajos de siempre (Hoy · Esta noche · Finde · Semana, `@qps/core/home/atajos`),
// en scroll horizontal, con la pill activa en fondo `primary` que se desliza
// con `Animated` (spring) al cambiar — las demás con borde. El comportamiento
// de los atajos no cambia: esto solo decide cómo se ven.
//
// `Animated.Value` con `useState(() => new Animated.Value(...))` (no
// `useRef(...).current`, que dispara `react-hooks/refs` al leerse durante el
// render — mismo criterio que el pulso de `components/PantallaRadar.tsx`).
// La posición y el ancho del resaltado salen de medir cada pill con
// `onLayout` (evento nativo, no un efecto: no hay problema de
// `set-state-in-effect`); animarlos sí vive en un `useEffect`, pero
// `Animated.spring(...).start()` no es un `setState`, así que tampoco
// dispara ese lint.
import { useEffect, useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native'
import type { Atajo } from '@qps/core/home/atajos'
import { Texto } from '@/components/Texto'
import { AREA_TACTIL_MINIMA, hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'

// 46-c: `estilos.pill` mide 44 de alto (minHeight), 4dp corto de
// `AREA_TACTIL_MINIMA`. El ancho sí llega (paddingHorizontal 16 + texto), así
// que el déficit es solo vertical. Subir `minHeight` a 48 desalinearía el
// resaltado animado (`estilos.resaltado`, con `top`/`bottom` fijos en 12, que
// mide el layout real de cada pill con `onLayout`) y agrandaría visiblemente
// la pill (tiene fondo/borde propios, a diferencia del ojito o el botón de
// usuario) — por eso va con `hitSlop`, no con `minHeight`. El detector
// estático no ve `hitSlop`: sigue en `tests/a11y/pendientes-componentes.ts`.
const HIT_SLOP_PILL = hitSlopPara(AREA_TACTIL_MINIMA, 44)

const ATAJOS: { id: Atajo; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'esta-noche', etiqueta: 'Esta noche' },
  { id: 'finde', etiqueta: 'Finde' },
  { id: 'semana', etiqueta: 'Semana' },
]

interface Medida {
  x: number
  width: number
}

export interface PillsAtajosProps {
  atajo: Atajo
  onCambiar: (atajo: Atajo) => void
}

export function PillsAtajos({ atajo, onCambiar }: PillsAtajosProps) {
  const colores = useColoresQPS()
  const [medidas, setMedidas] = useState<Partial<Record<Atajo, Medida>>>({})
  const [animX] = useState(() => new Animated.Value(0))
  const [animWidth] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const medida = medidas[atajo]
    if (!medida) return
    Animated.spring(animX, { toValue: medida.x, useNativeDriver: false, bounciness: 6 }).start()
    Animated.spring(animWidth, { toValue: medida.width, useNativeDriver: false, bounciness: 6 }).start()
  }, [atajo, medidas, animX, animWidth])

  function registrarMedida(id: Atajo, evento: LayoutChangeEvent) {
    const { x, width } = evento.nativeEvent.layout
    setMedidas((actual) => ({ ...actual, [id]: { x, width } }))
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.contenido}>
      <Animated.View
        pointerEvents="none"
        style={[estilos.resaltado, { backgroundColor: colores.primary, transform: [{ translateX: animX }], width: animWidth }]}
      />
      {ATAJOS.map((item) => {
        const activo = item.id === atajo
        return (
          <Pressable
            key={item.id}
            onLayout={(e) => registrarMedida(item.id, e)}
            onPress={() => onCambiar(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={item.etiqueta}
            hitSlop={HIT_SLOP_PILL}
            style={[estilos.pill, !activo && { borderWidth: 1, borderColor: colores.border }]}
          >
            <Texto peso="semibold" style={{ color: activo ? colores.primaryForeground : colores.foreground }}>
              {item.etiqueta}
            </Texto>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenido: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  resaltado: { position: 'absolute', left: 0, top: 12, bottom: 12, borderRadius: 20 },
  pill: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center', zIndex: 1 },
})
