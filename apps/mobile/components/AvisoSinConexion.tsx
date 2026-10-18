// Aviso de "mostrando lo último guardado" (R43, plan §7): una banda fija
// arriba del contenido, dentro del scroll — nunca un toast, nunca algo que
// tape la pantalla. Sigue visible mientras la persona recorre la caché;
// 43-c la hace desaparecer con pull-to-refresh o "Reintentar" cuando vuelve
// la red.
//
// Mismos tokens que `EstadoCarga` (`useColoresQPS`, `mutedForeground` para
// el texto, acá vía `tono="secundario"` de `Texto`). Fondo `muted` (no
// `card`, que son las tarjetas de contenido) se mantiene, pero 43-c2
// (pasada de ux-ui) encontró que en oscuro —el único esquema que la app usa
// hoy: `lib/colores.ts` llama siempre a `coloresSegunEsquema('dark')`—
// `muted` y `card` casi no se distinguen (contraste ~1,09:1): el fondo solo
// no alcanza para que la banda se note como un aviso aparte. Lo que de
// verdad la separa es el borde inferior en `colores.border`, que en oscuro
// queda bastante más arriba que `muted` y que `card` (mismo patrón que el
// separador de `Encabezado.tsx`).
//
// Sin ícono: `components/Icono.tsx` es el único wrapper de íconos aprobado,
// y su lista (los 32 que también usa la web) no tiene ninguno de "sin
// señal" — el encargo permite ir sin ícono en ese caso.
import { StyleSheet, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { TITULO_SIN_CONEXION, textoGuardadoEn } from '@/lib/sin-conexion/aviso'

export interface AvisoSinConexionProps {
  /** Cuándo se guardó lo que se está mostrando (sale de `leerCache`, ya validado). */
  guardadoEn: Date
}

export function AvisoSinConexion({ guardadoEn }: AvisoSinConexionProps) {
  const colores = useColoresQPS()
  // Una sola vez: el texto visible y el `accessibilityLabel` tienen que decir
  // exactamente lo mismo. Si se llamara `textoGuardadoEn` dos veces (una para
  // cada lugar) con dos `new Date()` distintos, podrían caer en lados
  // opuestos de la medianoche de Salta y el lector de pantalla anunciaría
  // algo distinto de lo que se ve.
  const textoSegundaLinea = textoGuardadoEn(guardadoEn, new Date())

  return (
    <View
      style={[estilos.contenedor, { backgroundColor: colores.muted, borderBottomColor: colores.border }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${TITULO_SIN_CONEXION}. ${textoSegundaLinea}`}
    >
      <Texto peso="semibold" tono="secundario">
        {TITULO_SIN_CONEXION}
      </Texto>
      <Texto tono="secundario" style={estilos.subtitulo}>
        {textoSegundaLinea}
      </Texto>
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 2,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  subtitulo: { fontSize: 13 },
})
