// Pills de atajos de la portada (R29, 29-h, D3 de ops/paridad-web-app.md §1:
// "dejar los atajos de la app con el estilo de las pills de la web"). Los 4
// atajos de siempre (Hoy · Esta noche · Finde · Semana, `@qps/core/home/atajos`),
// en scroll horizontal, con la pill activa en fondo `primary` que se desliza
// con `Animated` (spring) al cambiar — las demás con borde. El comportamiento
// de los atajos no cambia: esto solo decide cómo se ven.
//
// R66 (66-b): con `etiquetaTodas` se dibuja antes de los 4 una pill más que
// representa "sin fecha" (`atajo === null`; Buscar la usa con "Cualquier
// fecha"). El resaltado animado también se mueve a ella. Sin la prop todo
// queda como estaba: `atajo` es siempre un `Atajo` (la portada no cambia).
//
// `Animated.Value` con `useState(() => new Animated.Value(...))` (no
// `useRef(...).current`, que dispara `react-hooks/refs` al leerse durante el
// render — mismo criterio que el pulso de `components/PantallaRadar.tsx`).
// La posición y el ancho del resaltado salen de medir cada pill con
// `onLayout` (evento nativo, no un efecto: no hay problema de
// `set-state-in-effect`); animarlos sí vive en un `useEffect`, pero
// `Animated.spring(...).start()` no es un `setState`, así que tampoco
// dispara ese lint.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native'
import type { Atajo } from '@qps/core/home/atajos'
import { Texto } from '@/components/Texto'
import { AREA_TACTIL_MINIMA, hitSlopPara } from '@/lib/accesibilidad'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'
import { useReducirMovimiento } from '@/lib/reducir-movimiento'

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

// Unión discriminada por `etiquetaTodas`: sin ella no hay estado "sin fecha";
// con ella, `atajo` y `onCambiar` admiten `null`.
//
// R81, 81-a: `despues` (opcional) se dibuja dentro del mismo scroll, a
// continuación de las pills: la portada pone ahí los chips removibles de los
// filtros activos, para que la cabecera siga siendo UNA sola fila. Con
// `sinAireIzquierdo` el scroll arranca pegado al botón «Filtros» que lo
// precede en la fila (8 dp de aire en vez de 16).
interface AdicionalesPills {
  despues?: ReactNode
  sinAireIzquierdo?: boolean
}
export type PillsAtajosProps = AdicionalesPills &
  (
    | { atajo: Atajo; onCambiar: (atajo: Atajo) => void; etiquetaTodas?: undefined }
    | { atajo: Atajo | null; onCambiar: (atajo: Atajo | null) => void; etiquetaTodas: string }
  )

const CLAVE_TODAS = 'todas'

export function PillsAtajos(props: PillsAtajosProps) {
  const { atajo, etiquetaTodas, despues, sinAireIzquierdo = false } = props
  const onCambiar = props.onCambiar as (atajo: Atajo | null) => void
  const colores = useColoresQPS()
  // R72, 72-c (QPS-362): borde de la pill inactiva a >= 3:1 (cálculo en `lib/colores.ts`).
  const bordeInactivo = bordeChipInactivo(colores)
  const [medidas, setMedidas] = useState<Record<string, Medida>>({})
  const pills: { id: Atajo | null; etiqueta: string }[] = etiquetaTodas
    ? [{ id: null, etiqueta: etiquetaTodas }, ...ATAJOS]
    : ATAJOS
  const [animX] = useState(() => new Animated.Value(0))
  const [animWidth] = useState(() => new Animated.Value(0))

  // A1 (nube Q1, ronda de correcciones): el resaltado se movía siempre con un
  // spring con rebote, aunque "Quitar animaciones" estuviera prendido (y en
  // Buscar se ve mientras carga el esqueleto). Ahora el spring va solo con
  // `reducir === false`; con el ajuste prendido, y también mientras la
  // consulta no resolvió (`null`), el resaltado salta a su lugar con
  // `setValue`. La primera medida de la pill activa tampoco se anima nunca
  // (antes crecía desde x = 0 y ancho 0 al montar): `posicionado` es un ref
  // porque solo lo leen y escriben los efectos, nunca el render.
  const reducir = useReducirMovimiento()
  const posicionado = useRef(false)

  useEffect(() => {
    const medida = medidas[atajo ?? CLAVE_TODAS]
    if (!medida) return
    if (!posicionado.current || reducir !== false) {
      posicionado.current = true
      animX.setValue(medida.x)
      animWidth.setValue(medida.width)
      return
    }
    Animated.spring(animX, { toValue: medida.x, useNativeDriver: false, bounciness: 6 }).start()
    Animated.spring(animWidth, { toValue: medida.width, useNativeDriver: false, bounciness: 6 }).start()
  }, [atajo, medidas, animX, animWidth, reducir])

  function registrarMedida(id: string, evento: LayoutChangeEvent) {
    const { x, width } = evento.nativeEvent.layout
    setMedidas((actual) => ({ ...actual, [id]: { x, width } }))
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[estilos.contenido, sinAireIzquierdo ? estilos.sinAireIzquierdo : null]}
    >
      <Animated.View
        pointerEvents="none"
        style={[estilos.resaltado, { backgroundColor: colores.primary, transform: [{ translateX: animX }], width: animWidth }]}
      />
      {pills.map((item) => {
        const activo = item.id === atajo
        return (
          <Pressable
            key={item.id ?? CLAVE_TODAS}
            onLayout={(e) => registrarMedida(item.id ?? CLAVE_TODAS, e)}
            onPress={() => onCambiar(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={item.etiqueta}
            hitSlop={HIT_SLOP_PILL}
            // R72, 72-c (vuelta 1): borde de 1 en los dos estados (el activo,
            // del color del relleno) para que no se achique 2 dp al tocarla.
            style={[estilos.pill, { borderWidth: 1, borderColor: activo ? colores.primary : bordeInactivo }]}
          >
            {/* R72, 72-c: la activa ya se distingue por el relleno (claro contra
                oscuro, no solo matiz); se suma la negrita como segunda señal. */}
            <Texto peso={activo ? 'bold' : 'semibold'} style={{ color: activo ? colores.primaryForeground : colores.foreground }}>
              {item.etiqueta}
            </Texto>
          </Pressable>
        )
      })}
      {despues}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenido: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sinAireIzquierdo: { paddingLeft: 8 },
  resaltado: { position: 'absolute', left: 0, top: 12, bottom: 12, borderRadius: 20 },
  pill: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center', zIndex: 1 },
})
