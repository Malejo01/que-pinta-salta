// Chips de categoría de la portada (R66, 66-a): "Todas" y una por cada
// categoría con eventos en el atajo elegido (`categoriasDisponibles`, core).
// Pill redondeada como `PillsAtajos`, pero la activa va con tinte y contorno
// de `primary` (las pills de fecha van rellenas: así no se confunden), sin el
// resaltado animado; el chip activo se trae a la vista con `scrollTo`. El área táctil se resuelve con
// `minHeight: 48` en la clave de estilo del Pressable, que es lo que mira el
// detector `area-chica` (mismo criterio que `chipGratis` de Buscar).
import { useRef } from 'react'
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
  // N2: el chip elegido puede quedar fuera de pantalla (la elegida sin eventos
  // va al final, o se llega a Buscar con una categoría lejana). El ref solo se
  // usa dentro del `onLayout` del chip activo (un handler, no el render), y no
  // hay `setState` en efectos.
  const scrollRef = useRef<ScrollView>(null)

  const chips: { slug: string | null; nombre: string; etiqueta: string }[] = [
    { slug: null, nombre: 'Todas', etiqueta: 'Todas las categorías' },
    ...categorias.map((categoria) => ({ slug: categoria.slug, nombre: categoria.name, etiqueta: categoria.name })),
  ]

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.contenido}>
      {chips.map((chip) => {
        const activo = chip.slug === seleccionada
        return (
          <Pressable
            key={chip.slug ?? 'todas'}
            onPress={() => onCambiar(chip.slug)}
            onLayout={
              activo
                ? (evento) => scrollRef.current?.scrollTo({ x: Math.max(0, evento.nativeEvent.layout.x - 16), animated: false })
                : undefined
            }
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={chip.etiqueta}
            style={[
              estilos.chip,
              // N1: activo con tinte y contorno (así no se confunde con la pill
              // de fecha, rellena); el borde es de 1 en los dos estados y el
              // ancho no salta.
              activo
                ? { backgroundColor: `${colores.primary}26`, borderWidth: 1, borderColor: colores.primary }
                : { borderWidth: 1, borderColor: colores.border },
            ]}
          >
            {chip.slug !== null ? (
              <Icono nombre={iconoPorCategoria(chip.slug)} tamanio={16} color={activo ? colores.primary : colores.foreground} />
            ) : null}
            <Texto peso="semibold" style={{ color: colores.foreground }}>
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
