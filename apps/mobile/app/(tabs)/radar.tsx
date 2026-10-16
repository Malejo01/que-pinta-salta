// Pestaña Radar (29-g, Fase 0 de ops/paridad-web-app.md §4; decisión A de
// Mauro en §3.6): por ahora solo envuelve `SeccionRadar` (la de Cuenta, R27)
// en un ScrollView. 29-d la reemplaza por la pantalla completa de la web
// (cards de "Frecuencia y destinatario", "Categorías" y "Lugares y
// organizadores", con el buscador unificado).
import { ScrollView, StyleSheet } from 'react-native'
import { SeccionRadar } from '@/components/SeccionRadar'
import { useColoresQPS } from '@/lib/colores'

export default function RadarScreen() {
  const colores = useColoresQPS()

  return (
    <ScrollView
      style={[estilos.contenedor, { backgroundColor: colores.background }]}
      contentContainerStyle={estilos.contenido}
    >
      <SeccionRadar />
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  contenido: { paddingHorizontal: 16, paddingBottom: 32 },
})
