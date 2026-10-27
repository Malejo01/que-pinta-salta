// Chips de categoría de la portada (R66, 66-a): "Todas" y una por cada
// categoría con eventos en el atajo elegido (`categoriasDisponibles`, core).
// Pill redondeada como `PillsAtajos`, pero la activa va con tinte y contorno
// de `primary` (las pills de fecha van rellenas: así no se confunden), sin el
// resaltado animado; el chip activo se trae a la vista con `scrollTo`. El área táctil se resuelve con
// `minHeight: 48` en la clave de estilo del Pressable, que es lo que mira el
// detector `area-chica` (mismo criterio que `chipGratis` de Buscar).
import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet } from 'react-native'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'

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
  // R69, 69-b (QPS-338): borde de los inactivos a 3:1 (cálculo en `lib/colores.ts`).
  const bordeInactivo = bordeChipInactivo(colores)
  // N2: el chip elegido puede quedar fuera de pantalla (la elegida sin eventos
  // va al final, o se llega a Buscar con una categoría lejana).
  // R69, 69-b (QPS-354): antes el `scrollTo` salía solo del `onLayout` del chip
  // activo, y si `seleccionada` cambiaba desde afuera ("Todas las categorías"
  // del vacío, "Ver todos" de una fila) sin que el layout se volviera a
  // disparar, el chip quedaba fuera de vista. Ahora cada chip guarda su `x` en
  // `posiciones` desde su `onLayout`, y un efecto sobre `seleccionada` hace el
  // `scrollTo`. El efecto solo toca un ref del ScrollView (no es `setState`);
  // el `onLayout` del activo se mantiene para el primer posicionamiento al
  // montar, cuando la `x` todavía no estaba medida al correr el efecto.
  const scrollRef = useRef<ScrollView>(null)
  const posiciones = useRef<Record<string, number>>({})

  useEffect(() => {
    const x = posiciones.current[seleccionada ?? 'todas']
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: false })
  }, [seleccionada])

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
            onLayout={(evento) => {
              const x = evento.nativeEvent.layout.x
              posiciones.current[chip.slug ?? 'todas'] = x
              if (activo) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: false })
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={chip.etiqueta}
            style={[
              estilos.chip,
              // N1: activo con tinte y contorno (así no se confunde con la pill
              // de fecha, rellena).
              // R72, 72-c (QPS-362): además del matiz, el activo se distingue
              // por la forma: contorno de 2 (el inactivo de 1) y texto en
              // negrita. El borde de 2 se compensa con 1 menos de padding en
              // cada lado (16 -> 15 y 10 -> 9): 2 + 15 = 1 + 16 y 2 + 9 = 1 + 10,
              // así el chip mide lo mismo (el texto en negrita puede ensanchar
              // unos dp, como cualquier chip de scroll horizontal).
              activo
                ? { backgroundColor: `${colores.primary}26`, borderWidth: 2, borderColor: colores.primary, paddingHorizontal: 15, paddingVertical: 9 }
                : { borderWidth: 1, borderColor: bordeInactivo },
            ]}
          >
            {chip.slug !== null ? (
              <Icono nombre={iconoPorCategoria(chip.slug)} tamanio={16} color={activo ? colores.primary : colores.foreground} />
            ) : null}
            <Texto peso={activo ? 'bold' : 'semibold'} style={{ color: colores.foreground }}>
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
