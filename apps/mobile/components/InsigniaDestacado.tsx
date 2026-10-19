// Ronda 50, 50-e: insignia "★ Destacado", antes dibujada a mano dentro de
// `components/TarjetaEvento.tsx` (líneas 85-91, con `estilos.badgeDestacado`
// y `estilos.textoBadgeDestacado`, mudados acá sin cambiar ningún valor:
// mismo fondo `#f59e0b`, mismo texto `#000`, mismo radio y padding). Ahora
// la comparten `TarjetaEvento`, `Hero` y la ficha (`app/evento/[id].tsx`),
// una sola vez cada una.
//
// La regla de "destacado" NO vive acá: la resuelve `@qps/core/events/destacados`
// (un evento está destacado si `events.featured_until` es posterior a
// "ahora"). Este componente solo lee el booleano `visible` que le pasan,
// nunca una fecha — `TarjetaEvento` y `Hero` le mandan `evento.isFeatured`
// directo, ya calculado por `transformEvent` (`@qps/core/home/transform`).
// `app/evento/[id].tsx` es la excepción: su `evento` NO pasa por
// `transformEvent` (ver el comentario de esa ficha, junto a `const
// destacado = estaDestacado(...)`), así que ahí SÍ se llama a
// `estaDestacado` antes de pasarle el resultado acá — documentado en el
// reporte de la tarea 50-e, no es un diseño nuevo de este componente.
import { StyleSheet, Text, View } from 'react-native'
import { ESCALA_MAXIMA_COMPACTA } from '@/lib/accesibilidad'

export interface InsigniaDestacadoProps {
  visible: boolean
}

export function InsigniaDestacado({ visible }: InsigniaDestacadoProps) {
  if (!visible) return null

  return (
    <View style={estilos.badgeDestacado}>
      <Text
        style={estilos.textoBadgeDestacado}
        numberOfLines={1}
        maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}
        accessibilityLabel="Evento destacado"
      >
        ★ Destacado
      </Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  badgeDestacado: { backgroundColor: '#f59e0b', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  textoBadgeDestacado: { fontSize: 10, fontWeight: '800', color: '#000' },
})
