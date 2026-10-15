// Estados iguales en todas las pantallas que cargan datos (R28, 28-c).
// Tres componentes de presentación, sin lógica de carga propia (eso sigue
// siendo useState/useEffect en cada pantalla; useCarga queda para después,
// QPS-140): `Cargando` (indicador centrado), `ErrorCarga` (mensaje + botón
// "Reintentar") y `Vacio` (mensaje + acción opcional). Los mensajes de cada
// pantalla no cambian: esto solo unifica cómo se ven.
//
// El texto secundario usa `mutedForeground` (QPS-126, `useColoresQPS`), no
// el token `muted` (ese es el tono de fondo/placeholder, casi invisible
// como color de texto: lo usa `CampoTexto` para el placeholder). Es el
// mismo token que ya usan `SeccionRadar`/`SeccionNotificaciones` para sus
// mensajes secundarios ("No hay categorías todavía.", etc.).
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'expo-router'
import { useColoresQPS } from '@/lib/colores'

/** Indicador de carga centrado. Sin texto: el mensaje de cada pantalla, si
 * lo tiene, vive afuera (por ejemplo, un título que ya se ve). */
export function Cargando() {
  return (
    <View style={estilos.cargando}>
      <ActivityIndicator />
    </View>
  )
}

export interface ErrorCargaProps {
  /** El mensaje de error de la pantalla (no cambia, solo cómo se ve). */
  mensaje: string
  onReintentar: () => void
}

/** Mensaje de error + botón "Reintentar". */
export function ErrorCarga({ mensaje, onReintentar }: ErrorCargaProps) {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  return (
    <View style={estilos.contenedor}>
      <Text style={[estilos.mensaje, { color: colores.mutedForeground }]}>{mensaje}</Text>
      <Pressable
        onPress={onReintentar}
        accessibilityRole="button"
        style={[estilos.boton, { borderColor: colors.border }]}
      >
        <Text style={[estilos.textoBoton, { color: colors.text }]}>Reintentar</Text>
      </Pressable>
    </View>
  )
}

export interface VacioProps {
  /** El mensaje de la pantalla cuando no hay nada que mostrar (no cambia). */
  mensaje: string
  /** Acción opcional (por ejemplo "Limpiar filtros" o "Ir a Cuenta"). Si
   * falta cualquiera de los dos, no se muestra ningún botón. */
  textoAccion?: string
  onAccion?: () => void
}

/** Mensaje de "no hay nada" + acción opcional. */
export function Vacio({ mensaje, textoAccion, onAccion }: VacioProps) {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  return (
    <View style={estilos.contenedor}>
      <Text style={[estilos.mensaje, { color: colores.mutedForeground }]}>{mensaje}</Text>
      {textoAccion && onAccion ? (
        <Pressable
          onPress={onAccion}
          accessibilityRole="button"
          style={[estilos.boton, { borderColor: colors.border }]}
        >
          <Text style={[estilos.textoBoton, { color: colors.text }]}>{textoAccion}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  cargando: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  contenedor: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 24 },
  mensaje: { textAlign: 'center' },
  // Al menos 44 dp de alto (criterio de 28-c): minHeight + centrado, en vez
  // de depender solo del padding vertical.
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textoBoton: { fontWeight: '600' },
})
