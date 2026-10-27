// Fila horizontal de una categoría de la portada (R29, 29-h, ops/paridad-web-app.md
// §3.2 punto 5 y §2 punto 6; paridad con `apps/web/components/category-row.tsx`):
// `FlatList` horizontal de `TarjetaEvento` 180×270, gap 20 y padding lateral
// 16; header con el ícono `primary`, el nombre (~20, bold), el contador en
// una pill y "Ver todos". Devuelve `null` sin eventos, igual que `CategoryRow`.
//
// El ícono por categoría (R29-q, integración de la tanda 3, punto D): sale
// de `iconoPorCategoria`, `components/Icono.tsx` — el mismo mapeo que usa
// `app/(tabs)/buscar.tsx`, replicando `getCategoryIcon` de la web
// (`apps/web/lib/category-icons.ts`): "cine" y el resto de las categorías
// reales tienen su ícono propio; "hoy" (la fila "Hoy en Salta", que no es
// una categoría real) cae en el mismo fallback que la web, `Calendar`.
//
// A7 (nube Q1), rendimiento: la fila es una `FlatList` horizontal de ancho
// FIJO por tarjeta, así que lleva `getItemLayout` (la lista no tiene que
// medir cada celda para saber dónde está la siguiente). Las medidas salen de
// las mismas constantes que los estilos (`ANCHO_TARJETA`, `SEPARACION`,
// `MARGEN_LATERAL`), así no se pueden desfasar. `keyExtractor` y
// `renderItem` son funciones de módulo (no flechas nuevas en cada render): con
// la misma `eventos`, la `FlatList` (PureComponent) ni se vuelve a dibujar
// cuando Inicio sí. Ventana: ver `VENTANA_FILA`.
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native'
import type { DisplayEvent } from '@qps/core/home/types'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'

const ANCHO_TARJETA = 180
const ALTO_TARJETA = 270
// A7 (nube Q1): el `gap` y el `paddingHorizontal` de `estilos.lista`, con
// nombre porque también los usa `layoutDeTarjetaEnFila`.
const SEPARACION = 20
const MARGEN_LATERAL = 16

/**
 * `getItemLayout` de la fila (A7, nube Q1). Cada celda mide `ANCHO_TARJETA`
 * de ancho, siempre (no depende del texto ni de la escala de fuente: la
 * tarjeta es 180×270 fija, `estilos.celda`); entre celda y celda hay
 * `SEPARACION` (el `gap` del contenedor) y antes de la primera,
 * `MARGEN_LATERAL` (su `paddingHorizontal`).
 *
 * `length` es SOLO el ancho de la celda, sin el gap (corrección de A7, vuelta
 * 1): la lista reemplaza las celdas desmontadas por un hueco de
 * `último.offset + último.length − primero.offset`, y Yoga le pone al hueco
 * su propio `gap` a cada lado, como a una celda más. Con `length` = ancho +
 * gap el hueco quedaba 20 dp largo: en filas de 10+ eventos las tarjetas
 * saltaban 20 dp al desmontarse celdas y sobraba blanco al final. Con
 * `length` = 180, n celdas escondidas dan 180·n + 20·(n − 1), y con los 2 gaps
 * del hueco suman lo mismo que n celdas reales con sus n + 1 gaps
 * (`tests/renders-listas.test.ts` lo cuenta). `offset` = margen + índice ×
 * (ancho + separación): donde arranca de verdad la celda `index`.
 */
export function layoutDeTarjetaEnFila(_data: ArrayLike<DisplayEvent> | null | undefined, index: number) {
  return { length: ANCHO_TARJETA, offset: MARGEN_LATERAL + (ANCHO_TARJETA + SEPARACION) * index, index }
}

/**
 * Ventana de la fila horizontal (A7, nube Q1). En 360 dp de ancho entran ~1,8
 * tarjetas (16 + 180 + 20 + 180…), así que 3 alcanzan para el primer
 * pantallazo con una de reserva (antes eran 10 por fila, el valor por
 * omisión, y la portada tiene una fila por categoría). Vuelta 1: lotes de 4
 * y `windowSize: 9` (~4 pantallas a cada lado, en vez de 21): con 3/5 un
 * deslizamiento rápido en un teléfono de gama baja dejaba huecos en blanco y
 * remontaba corazones (cada remontaje vuelve a consultar si es favorito).
 */
export const VENTANA_FILA = { initialNumToRender: 3, maxToRenderPerBatch: 4, windowSize: 9 } as const

const claveDeEvento = (evento: DisplayEvent) => evento.id
const dibujarCelda: ListRenderItem<DisplayEvent> = ({ item }) => <CeldaEvento evento={item} />

export interface FilaCategoriaProps {
  /** Slug de la categoría (o `'hoy'` para la fila "Hoy en Salta": no es una
   * categoría real, así que cae en el ícono por defecto, `Calendar` — igual
   * que en la web, `getCategoryIcon('hoy')`). */
  categoria: string
  titulo: string
  eventos: DisplayEvent[]
  alVerTodos: () => void
}

export function FilaCategoria({ categoria, titulo, eventos, alVerTodos }: FilaCategoriaProps) {
  const colores = useColoresQPS()

  if (eventos.length === 0) return null

  return (
    <View style={estilos.seccion}>
      <View style={estilos.encabezado}>
        <View style={estilos.tituloFila}>
          <Icono nombre={iconoPorCategoria(categoria)} tamanio={20} color={colores.primary} />
          <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
            {titulo}
          </Texto>
          <View style={[estilos.pillContador, { backgroundColor: colores.muted }]}>
            <Texto tono="secundario" style={estilos.textoContador}>
              {eventos.length}
            </Texto>
          </View>
        </View>

        <Pressable onPress={alVerTodos} accessibilityRole="button" style={estilos.botonVerTodos}>
          {/* Ronda 49 (QPS-241, grupo 2): `primary` da 3,83 sobre `background`
              como texto chico, abajo de 4,5 — pasa a `foreground` (tono por
              defecto de `Texto`), subrayado para no perder la señal de que
              se toca (no tiene ícono ni borde propio). */}
          <Texto peso="semibold" style={[estilos.textoVerTodos, estilos.subrayado]}>
            Ver todos
          </Texto>
        </Pressable>
      </View>

      <FlatList
        data={eventos}
        keyExtractor={claveDeEvento}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={estilos.lista}
        renderItem={dibujarCelda}
        getItemLayout={layoutDeTarjetaEnFila}
        initialNumToRender={VENTANA_FILA.initialNumToRender}
        maxToRenderPerBatch={VENTANA_FILA.maxToRenderPerBatch}
        windowSize={VENTANA_FILA.windowSize}
        // A7 (nube Q1), vuelta 1: `FlatList` lo PRENDE por omisión en Android
        // (`removeClippedSubviewsOrDefault`): saca de la jerarquía las
        // tarjetas fuera de pantalla y TalkBack deja de encontrarlas al
        // recorrer la fila. Apagado a propósito.
        removeClippedSubviews={false}
      />
    </View>
  )
}

// R67, 67-a: la capa transparente para películas ya no hace falta;
// `TarjetaEvento` navega con `rutaDeEvento` (lib/rutas.ts).
function CeldaEvento({ evento }: { evento: DisplayEvent }) {
  return (
    <View style={estilos.celda}>
      <TarjetaEvento evento={evento} />
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { paddingTop: 20 },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  titulo: { fontSize: 20 },
  pillContador: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  textoContador: { fontSize: 12 },
  // 46-c: 44 -> 48 (AREA_TACTIL_MINIMA de lib/accesibilidad.ts). Los 4dp de
  // más no se notan: es texto solo ("Ver todos"), sin fondo/borde, con
  // `marginVertical` negativo que ya compensa el padding para no empujar la
  // fila — el único cambio real es que el `Pressable` pasa a medir 2dp más
  // arriba y abajo de lo que medía antes.
  botonVerTodos: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, marginVertical: -12 },
  textoVerTodos: { fontSize: 14 },
  // Ronda 49 (QPS-241, grupo 2): "Ver todos" pasa de `tono="primario"` a
  // `foreground` (ver el comentario de arriba) — subrayado para seguir
  // marcándose como tocable sin volver a usar `primary`.
  subrayado: { textDecorationLine: 'underline' },
  lista: { paddingHorizontal: MARGEN_LATERAL, gap: SEPARACION },
  celda: { width: ANCHO_TARJETA, height: ALTO_TARJETA },
})
