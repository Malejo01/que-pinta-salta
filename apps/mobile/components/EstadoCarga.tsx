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
// mismo token que ya usan `PantallaRadar`/`SeccionNotificaciones` para sus
// mensajes secundarios ("No hay categorías todavía.", etc.).
//
// A6 (nube Q1): el botón de "Reintentar" pasa a ser un componente propio,
// `BotonReintentar`, para poder ponerlo también fuera de `ErrorCarga` — junto
// a `AvisoSinConexion` (con lo guardado a la vista) y en los vacíos que
// necesitan volver a pedir (Buscar sin categorías, Mis eventos y Radar sin
// sesión por falta de red) — sin que ninguna pantalla vuelva a escribir su
// propio `<Text>Reintentar</Text>` (`tests/estado-carga-detector.test.ts`).
// Los botones de este archivo dejan `useTheme()` de expo-router por
// `useColoresQPS()`: el texto en `foreground` y el borde en
// `bordeChipInactivo` (R72, 72-c: >= 3:1 contra el fondo; `colores.border`
// daba ~1,3:1 y el botón casi no se distinguía como botón).
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'

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

export interface BotonReintentarProps {
  onReintentar: () => void
  /** Mientras se reintenta (por ejemplo, un refresco en curso): el botón se apaga para no disparar dos pedidos. */
  deshabilitado?: boolean
}

/**
 * El botón "Reintentar", solo (A6): el mismo de `ErrorCarga`, para usarlo
 * afuera de un error a pantalla completa — por ejemplo al lado del aviso de
 * sin conexión, AFUERA del `View accessible` del aviso (ahí adentro no se
 * podría tocar con el lector de pantalla: `accessible` agrupa todo en un solo
 * elemento).
 */
export function BotonReintentar({ onReintentar, deshabilitado = false }: BotonReintentarProps) {
  const colores = useColoresQPS()
  return (
    <Pressable
      onPress={onReintentar}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado }}
      style={[estilos.boton, { borderColor: bordeChipInactivo(colores), opacity: deshabilitado ? 0.6 : 1 }]}
    >
      <Text style={[estilos.textoBoton, { color: colores.foreground }]}>Reintentar</Text>
    </Pressable>
  )
}

/** Mensaje de error + botón "Reintentar". */
export function ErrorCarga({ mensaje, onReintentar }: ErrorCargaProps) {
  const colores = useColoresQPS()
  return (
    <View style={estilos.contenedor}>
      <Text style={[estilos.mensaje, { color: colores.mutedForeground }]}>{mensaje}</Text>
      <BotonReintentar onReintentar={onReintentar} />
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
  const colores = useColoresQPS()
  return (
    <View style={estilos.contenedor}>
      <Text style={[estilos.mensaje, { color: colores.mutedForeground }]}>{mensaje}</Text>
      {textoAccion && onAccion ? (
        <Pressable
          onPress={onAccion}
          accessibilityRole="button"
          style={[estilos.boton, { borderColor: bordeChipInactivo(colores) }]}
        >
          <Text style={[estilos.textoBoton, { color: colores.foreground }]}>{textoAccion}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  cargando: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  contenedor: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 24 },
  mensaje: { textAlign: 'center' },
  // Al menos 48 dp de alto (46-c, AREA_TACTIL_MINIMA de lib/accesibilidad.ts;
  // antes 44, criterio de 28-c): minHeight + centrado, en vez de depender
  // solo del padding vertical. Los 4dp de más no se notan (botón grande,
  // centrado, sin nada pegado arriba/abajo).
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textoBoton: { fontWeight: '600' },
})
