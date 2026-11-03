// Q5-4 · El acceso a «Lugares para chicos» que aparece en Inicio y en Buscar
// con el chip «Para chicos» prendido (decisión 5 de docs/tanda-q5: lo mismo
// que la capa del mapa en la web, que se prende con el chip).
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { useTextos } from '@/lib/i18n'

export function AccesoLugaresChicos() {
  const colores = useColoresQPS()
  const router = useRouter()
  const t = useTextos().lugaresChicos
  return (
    <Pressable
      onPress={() => router.push('/lugares-chicos')}
      accessibilityRole="button"
      accessibilityLabel={`${t.titulo}: ${t.acceso}`}
      style={[estilos.accesoLugares, { backgroundColor: colores.card, borderColor: colores.border }]}
    >
      <Icono nombre="Balloon" tamanio={20} color={colores.foreground} />
      <View style={estilos.textos}>
        <Texto peso="bold">{t.titulo}</Texto>
        <Texto tono="secundario" style={estilos.bajada}>
          {t.acceso}
        </Texto>
      </View>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  accesoLugares: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textos: { flex: 1, gap: 2 },
  bajada: { fontSize: 13 },
})
