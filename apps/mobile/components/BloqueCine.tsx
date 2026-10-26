// Un cine dentro del acordeón de una película (R67, 67-c). Antes estaba
// duplicado en `app/cines.tsx` y `app/pelicula/[id].tsx`; ahora lo comparten
// `components/TarjetaPelicula.tsx` (la lista de Cines y la portada con el chip
// "Cine") y la ficha de la película. Los colores salen de `useColoresQPS()`
// acá adentro, así quien lo usa no tiene que pasarlos.
import * as Linking from 'expo-linking'
import { Pressable, StyleSheet, View } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { urlCompraCineSegura, type FuncionesDeCine } from '@/lib/datos/cines'

/** El nombre del cine como trigger y, abierto, los formatos con sus horarios
 * en chips y "Comprar Entradas". */
export function BloqueCine({
  cine,
  abierto,
  esUltimo,
  onToggle,
}: {
  cine: FuncionesDeCine
  abierto: boolean
  esUltimo: boolean
  onToggle: () => void
}) {
  const colores = useColoresQPS()
  // Único origen válido para abrir una URL de compra (R28, 28-g): el
  // `booking_url` crudo (`cine.urlCompra`) nunca llega a `Linking.openURL`
  // directo — siempre pasa por `urlCompraCineSegura` (ver
  // `tests/aperturas-url.test.ts`).
  const urlCompra = urlCompraCineSegura(cine.urlCompra)

  return (
    <View style={[estilos.bloqueCine, !esUltimo && { borderBottomWidth: 1, borderColor: colores.border }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: abierto }} style={estilos.triggerCine}>
        <View style={estilos.triggerTexto}>
          <View style={[estilos.punto, { backgroundColor: colores.primary }]} />
          <Texto peso="semibold" style={estilos.nombreCine}>
            {cine.cine}
          </Texto>
        </View>
        <View style={abierto ? estilos.chevronAbierto : undefined}>
          <Icono nombre="ChevronDown" tamanio={18} color={colores.mutedForeground} />
        </View>
      </Pressable>

      {abierto ? (
        <View style={estilos.contenidoCine}>
          {cine.formatos.map((formato, indice) => (
            <View key={`${formato.tipo}-${indice}`} style={[estilos.cajaFormato, { backgroundColor: colores.muted, borderColor: colores.border }]}>
              <Texto tono="secundario" peso="semibold" style={estilos.tipoFormato}>
                {formato.tipo}
              </Texto>
              <View style={estilos.filaChips}>
                {formato.horarios.map((horario, indiceHorario) => (
                  <View key={`${horario}-${indiceHorario}`} style={[estilos.chip, { backgroundColor: colores.card, borderColor: colores.border }]}>
                    <Texto style={estilos.textoChip}>{horario}</Texto>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {urlCompra ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(urlCompra).catch(() => {})}
              style={[estilos.botonComprar, { backgroundColor: colores.muted }]}
            >
              <Icono nombre="Ticket" tamanio={14} color={colores.primary} />
              <Texto peso="semibold" style={estilos.textoComprar}>
                Comprar Entradas
              </Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  bloqueCine: { paddingVertical: 4 },
  triggerCine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingVertical: 4 },
  triggerTexto: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  punto: { width: 6, height: 6, borderRadius: 3 },
  nombreCine: { fontSize: 15, flexShrink: 1 },
  chevronAbierto: { transform: [{ rotate: '180deg' }] },
  contenidoCine: { gap: 8, paddingBottom: 10 },
  cajaFormato: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  tipoFormato: { fontSize: 12 },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  textoChip: { fontSize: 12 },
  botonComprar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 10 },
  textoComprar: { fontSize: 12 },
})
