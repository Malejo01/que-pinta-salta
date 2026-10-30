// R81, 81-a: los filtros de la portada en una hoja. Antes la cabecera fija
// apilaba tres filas (Gratis + Para chicos, chips de categoría, pills de fecha)
// y se comía el 25–30 % de la pantalla; ahora es UNA fila: el botón «Filtros»
// (`BotonFiltros`, con el contador de activos) a la izquierda y las pills de
// fecha a su lado. El botón abre `HojaFiltros`, una hoja inferior con
// «Gratis», «Para chicos» y las categorías en grilla. `ChipsRemovibles` repite
// los filtros activos después de las pills, para quitarlos sin abrir la hoja.
// La lógica pura (conteo, etiquetas, chips) está en `lib/portada-filtros.ts`.
//
// La hoja es el `Modal` de React Native, con el mismo patrón que la hoja de
// `components/InvitacionAvisos.tsx`: el fondo (toca-para-cerrar, fuera del
// árbol de accesibilidad) y la hoja son hermanos, la hoja se marca como modal
// para el lector de pantalla y Atrás la cierra (`onRequestClose`).
//
// Los filtros se aplican al tocar (son los mismos `cambiarGratis`,
// `cambiarParaChicos` y `cambiarCategoria` de la portada, que además vuelven
// el scroll arriba): «Ver N eventos» solo cierra, y «Limpiar» apaga Gratis,
// Para chicos y la categoría, sin tocar la fecha.
//
// Accesibilidad:
//   - El botón dice «Filtros» o «Filtros, 2 activos», con
//     `accessibilityRole="button"`.
//   - Al abrir, el foco arranca en el título de la hoja (`onShow`); al cerrar
//     vuelve al botón (un efecto sobre `visible`, con una pequeña espera: en
//     Android el Modal tarda en irse y el foco se perdería).
//   - Con la hoja abierta la portada no anuncia cada toque: lo resuelve el
//     `pausado` de `useAnunciarConteo`, que anuncia el resultado una sola vez
//     al cerrar.
//   - Áreas táctiles de 48 dp (`minHeight`).
// Reducir movimiento: `animationType="none"` si el ajuste está prendido (o
// todavía no se sabe), `"slide"` si no (`lib/reducir-movimiento.ts`).
import { useEffect, useRef, type Ref, type RefObject } from 'react'
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChipGratis } from '@/components/ChipGratis'
import { ChipParaChicos } from '@/components/ChipParaChicos'
import { ChipsCategorias, type CategoriaChip } from '@/components/ChipsCategorias'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'
import {
  chipsRemovibles,
  etiquetaAccesibleFiltros,
  etiquetaVisibleFiltros,
  textoVerEventos,
  type ClaveFiltro,
  type FiltrosPortada,
} from '@/lib/portada-filtros'
import { useReducirMovimiento } from '@/lib/reducir-movimiento'

/** Cuánto espera el foco para volver al botón después de cerrar la hoja (el Modal tarda en irse). */
const ESPERA_FOCO_MS = 350

/** El botón «Filtros» de la fila fija: ícono + etiqueta con el contador de activos. */
export function BotonFiltros({
  activos,
  onPress,
  botonRef,
}: {
  activos: number
  onPress: () => void
  botonRef: Ref<View>
}) {
  const colores = useColoresQPS()
  const hay = activos > 0
  return (
    <Pressable
      ref={botonRef}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesibleFiltros(activos)}
      style={[
        estilos.boton,
        // Con filtros activos va con tinte y contorno de `primary` (como el chip
        // de categoría elegido); sin filtros, con el borde a 3:1 de los inactivos.
        // 2 + 15 = 1 + 16: mide lo mismo con y sin filtros.
        hay
          ? { backgroundColor: `${colores.primary}26`, borderWidth: 2, borderColor: colores.primary, paddingHorizontal: 15 }
          : { backgroundColor: colores.card, borderWidth: 1, borderColor: bordeChipInactivo(colores) },
      ]}
    >
      {/* Sin ícono de "filtros" en `Icono`: la flecha hacia abajo dice que se despliega algo. */}
      <Icono nombre="ChevronDown" tamanio={16} color={hay ? colores.primary : colores.foreground} />
      <Texto peso={hay ? 'bold' : 'semibold'}>{etiquetaVisibleFiltros(activos)}</Texto>
    </Pressable>
  )
}

/**
 * Los chips chicos de los filtros activos, para ir DENTRO de la fila de las
 * pills (`despues` de `PillsAtajos`): no son una segunda fila. Cada uno quita
 * su filtro. Sin filtros no dibuja nada.
 */
export function ChipsRemovibles({
  filtros,
  nombreCategoria,
  onQuitar,
}: {
  filtros: FiltrosPortada
  nombreCategoria: string
  onQuitar: (clave: ClaveFiltro) => void
}) {
  const colores = useColoresQPS()
  const bordeInactivo = bordeChipInactivo(colores)
  const chips = chipsRemovibles(filtros, nombreCategoria)
  if (chips.length === 0) return null
  return (
    <>
      {chips.map((chip) => (
        <Pressable
          key={chip.clave}
          onPress={() => onQuitar(chip.clave)}
          accessibilityRole="button"
          accessibilityLabel={chip.etiqueta}
          style={[estilos.chipRemovible, { borderColor: bordeInactivo, backgroundColor: colores.card }]}
        >
          <Texto peso="semibold" style={estilos.textoChipRemovible}>
            {chip.texto}
          </Texto>
          <Icono nombre="X" tamanio={14} color={colores.foreground} />
        </Pressable>
      ))}
    </>
  )
}

export interface HojaFiltrosProps {
  visible: boolean
  onCerrar: () => void
  gratis: boolean
  paraChicos: boolean
  categoria: string | null
  /** Las categorías que da `datosPortada.chips`. */
  categorias: CategoriaChip[]
  /** El «N» de «Ver N eventos». */
  cantidad: number
  onCambiarGratis: (activo: boolean) => void
  onCambiarParaChicos: (activo: boolean) => void
  onCambiarCategoria: (slug: string | null) => void
  /** Apaga Gratis, Para chicos y la categoría (no la fecha). */
  onLimpiar: () => void
  /** Cuántos filtros hay activos (Gratis, Para chicos, categoría): con 0, «Limpiar» queda deshabilitado. */
  activos: number
  /** El botón «Filtros», para devolverle el foco al cerrar. */
  botonRef: RefObject<View | null>
}

export function HojaFiltros({
  visible,
  onCerrar,
  gratis,
  paraChicos,
  categoria,
  categorias,
  cantidad,
  onCambiarGratis,
  onCambiarParaChicos,
  onCambiarCategoria,
  onLimpiar,
  activos,
  botonRef,
}: HojaFiltrosProps) {
  const colores = useColoresQPS()
  const insets = useSafeAreaInsets()
  const reducir = useReducirMovimiento()
  const tituloRef = useRef<View>(null)
  const estuvoAbierta = useRef(false)

  // Al cerrar, el foco vuelve al botón «Filtros». Solo toca refs y un timer.
  useEffect(() => {
    if (visible) {
      estuvoAbierta.current = true
      return
    }
    if (!estuvoAbierta.current) return
    estuvoAbierta.current = false
    const temporizador = setTimeout(() => {
      const nodo = findNodeHandle(botonRef.current)
      if (nodo !== null) AccessibilityInfo.setAccessibilityFocus(nodo)
    }, ESPERA_FOCO_MS)
    return () => clearTimeout(temporizador)
  }, [visible, botonRef])

  return (
    <Modal
      visible={visible}
      transparent
      // Con "Reducir movimiento" prendido (o sin saber todavía): sin animar.
      animationType={reducir === false ? 'slide' : 'none'}
      onRequestClose={onCerrar}
      // El foco arranca adentro de la hoja, en el título.
      onShow={() => {
        const nodo = findNodeHandle(tituloRef.current)
        if (nodo !== null) AccessibilityInfo.setAccessibilityFocus(nodo)
      }}
    >
      <View style={estilos.fondo}>
        {/* Hermanos (fondo y hoja), como en `InvitacionAvisos`: el fondo
            toca-para-cerrar queda fuera del árbol de accesibilidad. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCerrar}
          accessible={false}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
        <View
          accessibilityViewIsModal
          style={[
            estilos.hoja,
            { backgroundColor: colores.card, borderColor: colores.border, paddingBottom: Math.max(20, insets.bottom + 12) },
          ]}
        >
          <View ref={tituloRef} accessible accessibilityRole="header" style={estilos.tituloCaja}>
            <Texto peso="bold" style={estilos.titulo}>
              Filtros
            </Texto>
          </View>
          <ScrollView style={estilos.cuerpo} contentContainerStyle={estilos.cuerpoContenido}>
            <View style={estilos.filaFiltros}>
              <ChipGratis activo={gratis} onCambiar={onCambiarGratis} />
              <ChipParaChicos activo={paraChicos} onCambiar={onCambiarParaChicos} />
            </View>
            {categorias.length > 0 ? (
              <>
                <Texto peso="bold" tono="secundario" accessibilityRole="header">
                  Categorías
                </Texto>
                <ChipsCategorias categorias={categorias} seleccionada={categoria} onCambiar={onCambiarCategoria} envolver />
              </>
            ) : null}
          </ScrollView>
          <View style={estilos.acciones}>
            <Pressable
              onPress={onCerrar}
              accessibilityRole="button"
              style={[estilos.accion, estilos.accionPrincipal, { backgroundColor: colores.primary }]}
            >
              <Texto peso="bold" style={{ color: colores.primaryForeground }}>
                {textoVerEventos(cantidad)}
              </Texto>
            </Pressable>
            <Pressable
              onPress={onLimpiar}
              // R81, 81-c: sin filtros activos no hay nada que limpiar.
              disabled={activos === 0}
              accessibilityRole="button"
              accessibilityLabel="Limpiar filtros"
              accessibilityState={{ disabled: activos === 0 }}
              style={[
                estilos.accion,
                { borderWidth: 1, borderColor: bordeChipInactivo(colores), opacity: activos === 0 ? 0.5 : 1 },
              ]}
            >
              <Texto peso="semibold">Limpiar</Texto>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  // Botón «Filtros»: misma forma de chip que los demás (alto 48, borde de 1).
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  // Chip removible: 48 de área táctil, pero ocupa 44 en la fila (los 2 dp de
  // cada lado caen en el aire de la fila, que tiene 12), así la altura de la
  // cabecera y el resaltado de las pills no se mueven al aparecer un chip.
  chipRemovible: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 48,
    marginVertical: -2,
  },
  textoChipRemovible: { fontSize: 13 },
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  hoja: {
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 16,
    maxHeight: '85%',
  },
  tituloCaja: { minHeight: 48, justifyContent: 'center' },
  titulo: { fontSize: 20 },
  cuerpo: { flexGrow: 0 },
  cuerpoContenido: { gap: 12, paddingBottom: 12 },
  filaFiltros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acciones: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  accion: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  accionPrincipal: { flex: 1 },
})
