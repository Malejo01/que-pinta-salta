// Chips de categoría de la portada (R66, 66-a): "Todas" y una por cada
// categoría con eventos en el atajo elegido (`categoriasDisponibles`, core).
// Mismo lenguaje que `PillsAtajos` (pill redondeada, activa en `primary`, las
// demás con borde), sin el resaltado animado. El área táctil se resuelve con
// `minHeight: 48` en la clave de estilo del Pressable, que es lo que mira el
// detector `area-chica` (mismo criterio que `chipGratis` de Buscar).
import { Pressable, ScrollView, StyleSheet } from 'react-native'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'

export interface CategoriaChip {
  slug: string
  name: string
  cantidad: number
}

export interface ChipsCategoriasProps {
  categorias: CategoriaChip[]
  seleccionada: string | null
  onCambiar: (slug: string | null) => void
}

export function ChipsCategorias({ categorias, seleccionada, onCambiar }: ChipsCategoriasProps) {
  const colores = useColoresQPS()

  const chips: { slug: string | null; nombre: string; etiqueta: string }[] = [
    { slug: null, nombre: 'Todas', etiqueta: 'Todas las categorías' },
    ...categorias.map((categoria) => ({ slug: categoria.slug, nombre: categoria.name, etiqueta: categoria.name })),
  ]

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.contenido}>
      {chips.map((chip) => {
        const activo = chip.slug === seleccionada
        const colorTexto = activo ? colores.primaryForeground : colores.foreground
        return (
          <Pressable
            key={chip.slug ?? 'todas'}
            onPress={() => onCambiar(chip.slug)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={chip.etiqueta}
            style={[
              estilos.chip,
              activo ? { backgroundColor: colores.primary } : { borderWidth: 1, borderColor: colores.border },
            ]}
          >
            {chip.slug !== null ? <Icono nombre={iconoPorCategoria(chip.slug)} tamanio={16} color={colorTexto} /> : null}
            <Texto peso="semibold" style={{ color: colorTexto }}>
              {chip.nombre}
            </Texto>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenido: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
  },
})
