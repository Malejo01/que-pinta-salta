// Chips de categoría de la portada (R66, 66-a): "Todas" y una por cada
// categoría con eventos en el atajo elegido (`categoriasDisponibles`, core).
// Pill redondeada como `PillsAtajos`, pero la activa va con tinte y contorno
// de `primary` (las pills de fecha van rellenas: así no se confunden), sin el
// resaltado animado; el chip activo se trae a la vista con `scrollTo`. El área táctil se resuelve con
// `minHeight: 48` en la clave de estilo del Pressable, que es lo que mira el
// detector `area-chica` (mismo criterio que `chipGratis` de Buscar).
//
// A2 (nube Q1; reemplazado en la ronda de correcciones de A3, ver abajo):
// prop opcional `gratis`. Si viene (la portada), adelante de
// "Todas" va el chip "Gratis" (`components/ChipGratis.tsx`), un interruptor
// aparte de la categoría, y un separador vertical que lo aparta de los chips
// de categoría. Si no viene (Buscar, que tiene su propio "Solo gratis"), la
// fila queda igual que antes. El chip "Gratis" no entra en `posiciones`.
// En la portada, además, la fila muestra su barra de desplazamiento (en
// Android, siempre): con "Gratis" y el separador, a 360 dp casi no asoma la
// segunda categoría y la fila parecía completa.
//
// A2, ronda de correcciones: el chip elegido se trae a la vista solo si no
// entra en la ventana visible (`destinoScrollChip`, `lib/chips-desplazamiento.ts`),
// y una sola vez por cada `seleccionada`. Ver el comentario de los refs.
//
// A3 (nube Q1), ronda de correcciones: "Gratis" y "Para chicos" salen de
// esta fila. Con los dos adelante (más el separador), a 360 dp "Todas"
// quedaba cortada, no asomaba ninguna categoría al abrir y elegir cualquiera
// sacaba los filtros de la vista. Ahora los dos filtros van en una fila
// propia, fija y sin scroll, en la cabecera de la portada (`filaFiltros` de
// `app/(tabs)/index.tsx`), y esta fila vuelve a ser solo "Todas" + categorías,
// como antes de A2: "Todas" arranca en x = 16 y el desplazamiento sigue con
// `destinoScrollChip` (criterio de A2). Se van las props `gratis` y
// `paraChicos` y el separador. La barra de desplazamiento sigue en la
// portada (ayuda a descubrir que hay más categorías a la derecha), ahora con
// su propia prop `mostrarBarra`; Buscar no la pasa y queda sin barra.
import { useEffect, useRef, type RefObject } from 'react'
import { Pressable, ScrollView, StyleSheet } from 'react-native'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { destinoScrollChip, type MedidaChip } from '@/lib/chips-desplazamiento'
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
  /**
   * A3 (nube Q1, ronda de correcciones): la barra de desplazamiento horizontal
   * (persistente en Android). La pasa la portada; Buscar no.
   */
  mostrarBarra?: boolean
}

/**
 * Desplaza la fila para que se vea el chip `clave`, si todavía no se hizo para
 * esta selección (`posicionada`) y ya están las dos medidas (el chip y el
 * ancho visible). Fuera del componente para que el efecto no dependa de una
 * función nueva en cada render: solo toca refs, nunca `setState`.
 */
function traerALaVista(
  scroll: RefObject<ScrollView | null>,
  posiciones: RefObject<Record<string, MedidaChip>>,
  anchoVisible: RefObject<number | null>,
  posicionada: RefObject<string | null>,
  clave: string,
): void {
  if (posicionada.current === clave) return
  const destino = destinoScrollChip(posiciones.current[clave], anchoVisible.current)
  if (destino === null) return
  scroll.current?.scrollTo({ x: destino, animated: false })
  posicionada.current = clave
}

export function ChipsCategorias({ categorias, seleccionada, onCambiar, mostrarBarra = false }: ChipsCategoriasProps) {
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
  //
  // A2 (nube Q1, ronda de correcciones): cada chip guarda `x` y `width`, y el
  // ScrollView su ancho visible (`anchoVisible`, de su `onLayout`). El destino
  // sale de `destinoScrollChip`: 0 si el chip entra con la fila al principio
  // (así "Gratis" no se va por la izquierda al elegir una categoría cercana),
  // `x - 16` si no. Y se desplaza UNA vez por cada `seleccionada`
  // (`posicionada`): el efecto la limpia y prueba; si falta una medida, la
  // prueban el `onLayout` del chip activo o el del ScrollView cuando llega.
  // Antes el `onLayout` del activo desplazaba cada vez que el chip cambiaba
  // de lugar (con "Gratis" la lista de chips cambia), y la fila saltaba.
  const scrollRef = useRef<ScrollView>(null)
  const posiciones = useRef<Record<string, MedidaChip>>({})
  const anchoVisible = useRef<number | null>(null)
  const posicionada = useRef<string | null>(null)

  useEffect(() => {
    posicionada.current = null
    traerALaVista(scrollRef, posiciones, anchoVisible, posicionada, seleccionada ?? 'todas')
  }, [seleccionada])

  const chips: { slug: string | null; nombre: string; etiqueta: string }[] = [
    { slug: null, nombre: 'Todas', etiqueta: 'Todas las categorías' },
    ...categorias.map((categoria) => ({ slug: categoria.slug, nombre: categoria.name, etiqueta: categoria.name })),
  ]

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      // A2: la barra solo en la portada; Buscar queda sin barra. A3, ronda de
      // correcciones: depende de `mostrarBarra` (ya no de la prop `gratis`).
      showsHorizontalScrollIndicator={mostrarBarra}
      persistentScrollbar={mostrarBarra}
      onLayout={(evento) => {
        anchoVisible.current = evento.nativeEvent.layout.width
        traerALaVista(scrollRef, posiciones, anchoVisible, posicionada, seleccionada ?? 'todas')
      }}
      contentContainerStyle={estilos.contenido}
    >
      {chips.map((chip) => {
        const activo = chip.slug === seleccionada
        return (
          <Pressable
            key={chip.slug ?? 'todas'}
            onPress={() => onCambiar(chip.slug)}
            onLayout={(evento) => {
              const { x, width } = evento.nativeEvent.layout
              posiciones.current[chip.slug ?? 'todas'] = { x, width }
              // Primer posicionamiento al montar (o cuando el chip elegido
              // recién aparece); `traerALaVista` no repite si ya se hizo.
              if (activo) traerALaVista(scrollRef, posiciones, anchoVisible, posicionada, chip.slug ?? 'todas')
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
