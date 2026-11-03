// Q5-4 · Chip de filtro de «Lugares para chicos» (tipo, Gratis, Abierto
// ahora, barrio). Mismas reglas que ChipGratis / ChipParaChicos: botón con
// `selected`, 48 de alto, prendido distinto por forma (relleno, borde de 2,
// negrita y tilde) y no solo por color.
import { Pressable, StyleSheet } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'

export function ChipFiltroLugar({ texto, activo, onPress, etiqueta }: { texto: string; activo: boolean; onPress: () => void; etiqueta?: string }) {
  const colores = useColoresQPS()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={etiqueta ?? texto}
      style={[
        estilos.chipLugar,
        activo
          ? { backgroundColor: colores.primary, borderWidth: 2, borderColor: colores.primary, paddingHorizontal: 13 }
          : { backgroundColor: colores.card, borderWidth: 1, borderColor: bordeChipInactivo(colores) },
      ]}
    >
      {activo ? <Icono nombre="Check" tamanio={14} color={colores.primaryForeground} /> : null}
      <Texto peso={activo ? 'bold' : 'semibold'} style={{ color: activo ? colores.primaryForeground : colores.foreground }}>
        {texto}
      </Texto>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  chipLugar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
  },
})
