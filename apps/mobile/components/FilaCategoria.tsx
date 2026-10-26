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
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import type { DisplayEvent } from '@qps/core/home/types'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'

const ANCHO_TARJETA = 180
const ALTO_TARJETA = 270

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
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => <CeldaEvento evento={item} />}
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
  lista: { paddingHorizontal: 16, gap: 20 },
  celda: { width: ANCHO_TARJETA, height: ALTO_TARJETA },
})
