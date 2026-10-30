// Búsquedas recientes de Buscar (A5, nube Q1). Solo dibuja: la lista, guardar
// y borrar viven en `lib/busquedas-recientes.ts` (puro, con el almacén
// inyectable) y en `app/(tabs)/buscar.tsx`, que es quien decide cuándo se
// guarda una búsqueda.
//
// Dónde va (A5): en el `ListHeaderComponent` de la lista «Explorar por
// categoría» — o sea, solo con el campo vacío y sin filtros —, arriba del
// título de la grilla. El banner de Buscar va en el `ListFooterComponent`,
// debajo de toda la grilla: esta sección suma alto ARRIBA de la grilla, así
// que lo empuja más abajo del pliegue, nunca lo sube (regla (a) de Mauro,
// «ningún anuncio arriba del pliegue»; la cuenta de alturas está en el
// comentario del `ListFooterComponent` de resultados, en buscar.tsx). Sin
// búsquedas guardadas no dibuja nada (ni el título).
//
// Forma (A5, vuelta 1): UNA sola fila de chips con scroll horizontal (como
// `ChipsCategorias`), no chips que hacen salto de línea: a 360 dp, cinco
// búsquedas largas eran cinco renglones (~336 dp) y empujaban la grilla de
// categorías fuera de la pantalla. Así la sección ocupa siempre lo mismo:
// título (~24) + una fila de 48 + «Borrar historial» (48) + 24 de aire, unos
// 150 dp. Cada chip tiene `maxWidth` (`ANCHO_MAXIMO_CHIP`) y una sola línea
// con puntos suspensivos; la etiqueta accesible lleva el texto completo
// («Buscar de nuevo: <texto>»). Alto mínimo `AREA_TACTIL_MINIMA` en la clave
// de estilo del Pressable (es lo que mira el detector `area-chica` de
// `tests/accesibilidad-detector.test.ts`, mismo criterio que
// `ChipsCategorias`). Borde de `bordeChipInactivo` (>= 3:1 en claro y oscuro,
// R72 72-c) y colores de `useColoresQPS()`.
//
// «Borrar historial» va DESPUÉS de los chips en el árbol (debajo, alineado a
// la derecha): en el orden de foco del lector de pantalla, la acción
// destructiva no queda antes que el contenido. Pide confirmación (A5) con
// `Alert.alert` de React Native — nada que instalar, y el diálogo nativo ya
// maneja el foco. `cancelable: true` para que el botón atrás de Android y el
// toque afuera lo cierren (en RN 0.86 no lo hacen por defecto). Al borrar, la
// sección desaparece (y con ella el foco), así que se anuncia
// `ANUNCIO_HISTORIAL_BORRADO`, postergado `DEMORA_ANUNCIO_BORRADO_MS`: si se
// anuncia en el mismo instante, TalkBack lo tapa con el cierre del diálogo.
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { AREA_TACTIL_MINIMA } from '@/lib/accesibilidad'
import { anunciar } from '@/lib/anunciar'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'

/** Lo que lee el lector de pantalla después de borrar el historial. */
export const ANUNCIO_HISTORIAL_BORRADO = 'Listo, borraste tus búsquedas recientes.'

/** Cuánto se posterga ese anuncio (ms), para que no lo tape el cierre del diálogo. */
export const DEMORA_ANUNCIO_BORRADO_MS = 400

/** Ancho máximo de un chip (dp): a 360 dp entra más de uno por pantalla. */
const ANCHO_MAXIMO_CHIP = 240

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
    Alert.alert(
      '¿Borrar el historial?',
      'Se borran tus búsquedas recientes de este teléfono.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () => {
            onBorrarHistorial()
            setTimeout(() => anunciar(ANUNCIO_HISTORIAL_BORRADO), DEMORA_ANUNCIO_BORRADO_MS)
          },
        },
      ],
      { cancelable: true },
    )
  }

  return (
    <View style={estilos.seccion}>
      <Texto peso="semibold" accessibilityRole="header" style={estilos.titulo}>
        Búsquedas recientes
      </Texto>
      {/* Mismo truco que `ChipsCategorias` en Buscar: la lista ya trae 16 de
          padding horizontal, así que el scroll lo compensa con margen
          negativo y lo vuelve a poner adentro (los chips scrollean hasta el
          borde de la pantalla y el primero queda alineado con el título). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={estilos.scroll}
        contentContainerStyle={estilos.chips}
      >
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
      </ScrollView>
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
  )
}

const estilos = StyleSheet.create({
  seccion: { marginBottom: 24 },
  titulo: { fontSize: 16, marginBottom: 8 },
  scroll: { marginHorizontal: -16 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: ANCHO_MAXIMO_CHIP,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: AREA_TACTIL_MINIMA,
  },
  textoChip: { flexShrink: 1 },
  // Botón de texto sin borde, debajo de los chips y a la derecha: el alto
  // mínimo va en la clave de estilo (no en `hitSlop`), así el área táctil no
  // depende de cómo lo mida un detector.
  botonBorrar: {
    alignSelf: 'flex-end',
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
})
