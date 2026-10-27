// Búsquedas recientes de Buscar (A5, nube Q1). Solo dibuja: la lista, guardar
// y borrar viven en `lib/busquedas-recientes.ts` (puro, con el almacén
// inyectable) y en `app/(tabs)/buscar.tsx`, que es quien decide cuándo se
// guarda una búsqueda.
//
// Dónde va (A5): en el `ListHeaderComponent` de la lista «Explorar por
// categoria» — o sea, solo con el campo vacío y sin filtros —, arriba del
// título de la grilla. El banner de Buscar va en el `ListFooterComponent`,
// debajo de toda la grilla: esta sección suma alto ARRIBA de la grilla, así
// que lo empuja más abajo del pliegue, nunca lo sube (regla (a) de Mauro,
// «ningún anuncio arriba del pliegue»; la cuenta de alturas está en el
// comentario del `ListFooterComponent` de resultados, en buscar.tsx). Sin
// búsquedas guardadas no dibuja nada (ni el título).
//
// Forma (A5): chips que hacen salto de línea (`flexWrap`), no filas de 48 dp
// una abajo de la otra — cinco filas son ~260 dp y a 360 dp de ancho tapaban
// la grilla de categorías; los chips entran en dos o tres líneas. Cada chip
// es un botón «Buscar de nuevo: <texto>» de 48 dp de alto como mínimo
// (`AREA_TACTIL_MINIMA`, en la clave de estilo del Pressable: es lo que mira
// el detector `area-chica` de `tests/accesibilidad-detector.test.ts`, mismo
// criterio que `ChipsCategorias`). Borde de `bordeChipInactivo` (>= 3:1 en
// claro y oscuro, R72 72-c) y colores de `useColoresQPS()`.
//
// «Borrar historial» pide confirmación (A5) con `Alert.alert` de React Native
// — nada que instalar, y el diálogo nativo ya maneja el foco del lector de
// pantalla. Son pocas búsquedas, pero no se pueden recuperar, y el botón
// queda al lado de los chips: un toque de más no tiene que borrarlas. Al
// borrar, la sección desaparece (y con ella el foco), así que se anuncia
// `ANUNCIO_HISTORIAL_BORRADO` con `announceForAccessibility`.
import { AccessibilityInfo, Alert, Pressable, StyleSheet, View } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { AREA_TACTIL_MINIMA } from '@/lib/accesibilidad'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'

/** Lo que lee el lector de pantalla después de borrar el historial. */
export const ANUNCIO_HISTORIAL_BORRADO = 'Listo, borraste tus búsquedas recientes.'

/** La etiqueta de cada chip: el lector de pantalla dice qué hace, no solo el texto. */
export function etiquetaBusquedaReciente(busqueda: string): string {
  return `Buscar de nuevo: ${busqueda}`
}

export interface BusquedasRecientesProps {
  busquedas: readonly string[]
  onElegir: (busqueda: string) => void
  onBorrarHistorial: () => void
}

export function BusquedasRecientes({ busquedas, onElegir, onBorrarHistorial }: BusquedasRecientesProps) {
  const colores = useColoresQPS()
  const bordeInactivo = bordeChipInactivo(colores)

  if (busquedas.length === 0) return null

  function confirmarBorrado() {
    Alert.alert('¿Borrar el historial?', 'Se borran tus búsquedas recientes de este teléfono.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          onBorrarHistorial()
          AccessibilityInfo.announceForAccessibility(ANUNCIO_HISTORIAL_BORRADO)
        },
      },
    ])
  }

  return (
    <View style={estilos.seccion}>
      <View style={estilos.cabecera}>
        <Texto peso="semibold" accessibilityRole="header" style={estilos.titulo}>
          Búsquedas recientes
        </Texto>
        <Pressable
          onPress={confirmarBorrado}
          accessibilityRole="button"
          accessibilityLabel="Borrar historial de búsquedas"
          style={estilos.botonBorrar}
        >
          <Texto peso="semibold" style={estilos.subrayado}>
            Borrar historial
          </Texto>
        </Pressable>
      </View>
      <View style={estilos.chips}>
        {busquedas.map((busqueda) => (
          <Pressable
            key={busqueda}
            onPress={() => onElegir(busqueda)}
            accessibilityRole="button"
            accessibilityLabel={etiquetaBusquedaReciente(busqueda)}
            style={[estilos.chip, { borderColor: bordeInactivo, backgroundColor: colores.card }]}
          >
            <Icono nombre="Clock" tamanio={16} color={colores.mutedForeground} />
            <Texto numberOfLines={1} style={estilos.textoChip}>
              {busqueda}
            </Texto>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { marginBottom: 16 },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { fontSize: 16, flexShrink: 1 },
  // Botón de texto sin borde: el alto mínimo va en la clave de estilo (no en
  // `hitSlop`), así el área táctil no depende de cómo lo mida un detector.
  botonBorrar: {
    minHeight: AREA_TACTIL_MINIMA,
    minWidth: AREA_TACTIL_MINIMA,
    paddingHorizontal: 8,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mismo criterio que «Ver todos» de `FilaCategoria.tsx` (R49, QPS-241): texto
  // en `foreground` y subrayado para marcarse como tocable — nunca `primary`
  // para texto chico (`tests/primario-texto.test.ts`).
  subrayado: { textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: AREA_TACTIL_MINIMA,
  },
  textoChip: { flexShrink: 1 },
})
