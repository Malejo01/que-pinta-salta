// Banner del Radar de la portada (R29, 29-h, ops/paridad-web-app.md §3.2
// punto 6 y §2 punto; va después de la 2.ª fila de categorías — eso lo
// decide `seccionesPortada` en `app/(tabs)/index.tsx`, no este componente).
// Texto copiado literal de `apps/web/components/home-content.tsx`.
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { useTextos } from '@/lib/i18n'

export function BannerRadar() {
  const router = useRouter()
  const colores = useColoresQPS()
  const t = useTextos().banners

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.card, borderColor: colores.border }]}>
      <View style={estilos.texto}>
        <Texto peso="bold" style={estilos.titulo}>
          {t.radarTitulo}
        </Texto>
        <Texto tono="secundario" style={estilos.subtitulo}>
          {t.radarTexto}
        </Texto>
      </View>

      <Pressable
        onPress={() => router.push('/radar')}
        accessibilityRole="button"
        style={[estilos.boton, { backgroundColor: colores.primary }]}
      >
        <Texto peso="bold" style={{ color: colores.primaryForeground }}>
          {t.radarBoton}
        </Texto>
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { marginHorizontal: 16, marginTop: 20, borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
  texto: { gap: 4 },
  titulo: { fontSize: 18 },
  subtitulo: { fontSize: 13, lineHeight: 18 },
  boton: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
})
