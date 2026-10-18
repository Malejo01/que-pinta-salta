// Aviso de "mostrando lo último guardado" (R43, plan §7): una banda fija
// arriba del contenido, dentro del scroll — nunca un toast, nunca algo que
// tape la pantalla. Sigue visible mientras la persona recorre la caché;
// 43-c la hace desaparecer con pull-to-refresh o "Reintentar" cuando vuelve
// la red.
//
// Mismos tokens que `EstadoCarga` (`useColoresQPS`, `mutedForeground` para
// el texto). Fondo `muted` (no `card`, que son las tarjetas de contenido):
// así la banda se nota como un aviso aparte, no como una tarjeta más de la
// lista.
//
// Sin ícono: `components/Icono.tsx` es el único wrapper de íconos aprobado,
// y su lista (los 32 que también usa la web) no tiene ninguno de "sin
// señal" — el encargo permite ir sin ícono en ese caso.
import { StyleSheet, Text, View } from 'react-native'
import { useColoresQPS } from '@/lib/colores'
import { TITULO_SIN_CONEXION, textoGuardadoEn } from '@/lib/sin-conexion/aviso'

export interface AvisoSinConexionProps {
  /** Cuándo se guardó lo que se está mostrando (sale de `leerCache`, ya validado). */
  guardadoEn: Date
}

export function AvisoSinConexion({ guardadoEn }: AvisoSinConexionProps) {
  const colores = useColoresQPS()

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.muted }]} accessibilityRole="alert">
      <Text style={[estilos.titulo, { color: colores.mutedForeground }]}>{TITULO_SIN_CONEXION}</Text>
      <Text style={[estilos.subtitulo, { color: colores.mutedForeground }]}>
        {textoGuardadoEn(guardadoEn, new Date())}
      </Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { paddingVertical: 10, paddingHorizontal: 16, gap: 2 },
  titulo: { fontWeight: '600' },
  subtitulo: { fontSize: 13 },
})
