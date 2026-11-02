// Q4-13 (rendimiento de Buscar): el tile de «Explorar por categoría», sacado
// del `renderItem` en línea de `app/(tabs)/buscar.tsx` y con `memo`. Con la
// misma categoría, la misma cantidad y el mismo `onTocar` (estable, con
// `useCallback` en Buscar), no se vuelve a dibujar cuando Buscar se dibuja de
// nuevo (refrescar, el aviso de «no se actualizó», las búsquedas recientes).
// Se ve y se anuncia igual que antes.
import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'
import { textoCantidadEventos } from '@/lib/formato'

export interface TileCategoriaProps {
  slug: string
  nombre: string
  cantidad: number
  onTocar: (slug: string) => void
}

function TileCategoriaSinMemo({ slug, nombre, cantidad, onTocar }: TileCategoriaProps) {
  const colores = useColoresQPS()
  return (
    <Pressable
      onPress={() => onTocar(slug)}
      accessibilityRole="button"
      style={[estilos.tileCategoria, { backgroundColor: colores.card, borderColor: bordeChipInactivo(colores) }]}
    >
      <View style={[estilos.iconoCategoria, { backgroundColor: `${colores.primary}1A` }]}>
        <Icono nombre={iconoPorCategoria(slug)} tamanio={20} color={colores.primary} />
      </View>
      <View style={estilos.textoTile}>
        <Texto peso="semibold" numberOfLines={1}>
          {nombre}
        </Texto>
        <Texto tono="secundario" style={estilos.cantidadTile}>
          {textoCantidadEventos(cantidad)}
        </Texto>
      </View>
    </Pressable>
  )
}

export const TileCategoria = memo(TileCategoriaSinMemo)

const estilos = StyleSheet.create({
  tileCategoria: {
    flex: 1,
    maxWidth: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
  },
  iconoCategoria: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  textoTile: { flex: 1 },
  cantidadTile: { fontSize: 13, marginTop: 2 },
})
