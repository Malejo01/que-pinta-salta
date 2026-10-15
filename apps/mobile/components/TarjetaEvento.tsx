// Tarjeta única de evento para Inicio, Buscar y Favoritos (R28, 28-f: F1).
// Replica `apps/web/components/event-card.tsx` en el tamaño de una grilla de
// 2 columnas: flyer 2:3 a sangre, degradé negro abajo y texto blanco encima,
// en vez de la fila con afiche de 64×64 que tenían las tres pantallas.
//
// Sin favorito ni compartir acá: esos botones viven en la ficha
// (`app/evento/[id].tsx`), así la lógica de favoritos no se duplica.
//
// El degradé no usa `expo-linear-gradient` (no es dependencia aprobada):
// son 4 `View` absolutos apilados, con negro de opacidad creciente hacia
// abajo, sobre la mitad inferior de la tarjeta.
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { formatEventDateShort } from '@qps/core/date-format'
import type { DisplayEvent } from '@qps/core/home/types'
import { Afiche } from '@/components/Afiche'
import { Icono } from '@/components/Icono'
import { useColoresQPS } from '@/lib/colores'
import { textoPrecio } from '@/lib/formato'

export interface TarjetaEventoProps {
  evento: DisplayEvent
}

export function TarjetaEvento({ evento }: TarjetaEventoProps) {
  const router = useRouter()
  const colores = useColoresQPS()

  // `evento.date` es la fecha calendario ("YYYY-MM-DD", `formatDateInSalta`
  // en `@qps/core/home/transform`), igual que `event.date` en la web:
  // `formatEventDateShort` le aplica el mismo formato corto ("vie 12 oct").
  const fecha = formatEventDateShort(evento.date)
  const precio = textoPrecio(evento.price)
  const inicialCategoria = (evento.categoryName || 'Q').charAt(0).toUpperCase()
  const otrasFechas = evento.occurrences && evento.occurrences.length > 1 ? evento.occurrences.length - 1 : 0

  const etiqueta = `${evento.title}, ${fecha}${evento.time ? ` ${evento.time}` : ''}, en ${evento.venue}`

  return (
    <Pressable
      onPress={() => router.push(`/evento/${evento.id}`)}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={[estilos.contenedor, { backgroundColor: colores.card }]}
    >
      <Afiche
        url={evento.image}
        llenar
        fallback={
          <View style={[estilos.marca, { backgroundColor: colores.primary }]}>
            <Text style={[estilos.marcaInicial, { color: colores.primaryForeground }]} numberOfLines={1}>
              {inicialCategoria}
            </Text>
            <Text style={[estilos.marcaTexto, { color: colores.primaryForeground }]} numberOfLines={1}>
              QUÉ PINTA SALTA
            </Text>
          </View>
        }
      />

      <View style={estilos.degrade} pointerEvents="none">
        <View style={[estilos.franja, { opacity: 0 }]} />
        <View style={[estilos.franja, { opacity: 0.4 }]} />
        <View style={[estilos.franja, { opacity: 0.75 }]} />
        <View style={[estilos.franja, { opacity: 0.9 }]} />
      </View>

      <View style={estilos.arriba} pointerEvents="none">
        <View style={[estilos.badge, { backgroundColor: colores.primary }]}>
          <Text style={[estilos.textoBadge, { color: colores.primaryForeground }]} numberOfLines={1}>
            {evento.categoryName}
          </Text>
        </View>
        {evento.isFeatured ? (
          <View style={estilos.badgeDestacado}>
            <Text style={estilos.textoBadgeDestacado} numberOfLines={1}>
              ★ Destacado
            </Text>
          </View>
        ) : null}
      </View>

      <View style={estilos.abajo} pointerEvents="none">
        <Text style={estilos.titulo} numberOfLines={2}>
          {evento.title}
        </Text>

        <View style={estilos.filaLugar}>
          <Icono nombre={{ ios: 'mappin', android: 'location_on' }} tamanio={12} color="rgba(255,255,255,0.8)" />
          <Text style={estilos.lugar} numberOfLines={1}>
            {evento.venue}
          </Text>
        </View>

        <Text style={estilos.fecha} numberOfLines={1}>
          {fecha}
          {evento.time ? ` ${evento.time}` : ''}
        </Text>

        {otrasFechas > 0 ? (
          <Text style={estilos.masFechas} numberOfLines={1}>
            +{otrasFechas} fechas
          </Text>
        ) : null}

        {precio ? (
          <Text style={[estilos.precio, evento.price === 'gratis' && estilos.precioGratis]} numberOfLines={1}>
            {precio}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    aspectRatio: 2 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  marca: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  marcaInicial: { fontSize: 48, fontWeight: '800', opacity: 0.9 },
  marcaTexto: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, opacity: 0.8 },
  // Clara hasta la mitad de la tarjeta, oscura hacia el borde inferior
  // (4 franjas, opacidad creciente: ver el comentario de arriba).
  degrade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '50%', flexDirection: 'column' },
  franja: { flex: 1, backgroundColor: '#000' },
  arriba: { position: 'absolute', left: 8, top: 8, gap: 4, alignItems: 'flex-start' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 140 },
  textoBadge: { fontSize: 11, fontWeight: '700' },
  badgeDestacado: { backgroundColor: '#f59e0b', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  textoBadgeDestacado: { fontSize: 10, fontWeight: '800', color: '#000' },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  titulo: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  filaLugar: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  lugar: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  fecha: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  masFechas: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  precio: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 4 },
  precioGratis: { color: '#4ade80' },
})
