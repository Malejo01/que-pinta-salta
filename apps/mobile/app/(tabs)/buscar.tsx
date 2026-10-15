// Buscar (R26, 26-b): búsqueda de texto, categoría, lugar (el `establishment`
// de la web) y "Solo gratis", sobre los eventos vigentes. Todo el filtrado
// es `filterEvents`/`soloGratis` de `@qps/core/home` — sin reglas propias.
// Mismo patrón de carga/error/reintentar que Inicio y Cines: una carga por
// toque; los filtros no vuelven a pedir nada a la red, se aplican en el
// cliente sobre lo ya cargado.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from 'expo-router'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { filterEvents } from '@qps/core/home/filters'
import { soloGratis } from '@qps/core/home/filtros-extra'
import type { DisplayEvent } from '@qps/core/home/types'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { obtenerCategorias, obtenerEventosVigentes, type CategoriaBasica } from '@/lib/datos/eventos'

type EstadoLista =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'ok'; eventos: DisplayEvent[]; categorias: CategoriaBasica[] }

export default function Buscar() {
  const { colors } = useTheme()

  const [estado, setEstado] = useState<EstadoLista>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // grilla sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)
  const [texto, setTexto] = useState('')
  const [lugar, setLugar] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [soloGratisActivo, setSoloGratisActivo] = useState(false)

  const obtenerDatos = useCallback(async (): Promise<EstadoLista> => {
    const [resultadoEventos, resultadoCategorias] = await Promise.all([
      obtenerEventosVigentes(),
      obtenerCategorias(),
    ])

    if (!resultadoEventos.ok) return { tipo: 'error', error: resultadoEventos.error }
    if (!resultadoCategorias.ok) return { tipo: 'error', error: resultadoCategorias.error }
    return { tipo: 'ok', eventos: resultadoEventos.eventos, categorias: resultadoCategorias.categorias }
  }, [])

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    setEstado(await obtenerDatos())
  }, [obtenerDatos])

  const refrescar = useCallback(async () => {
    setRefrescando(true)
    setEstado(await obtenerDatos())
    setRefrescando(false)
  }, [obtenerDatos])

  useEffect(() => {
    cargar()
  }, [cargar])

  const hayFiltros = Boolean(texto || lugar || categoria || soloGratisActivo)

  function limpiarFiltros() {
    setTexto('')
    setLugar('')
    setCategoria(null)
    setSoloGratisActivo(false)
  }

  const eventosFiltrados = useMemo(() => {
    if (estado.tipo !== 'ok') return []
    const saltaHoy = formatSaltaDayKey(new Date())
    // date=null, dateExact=null: Buscar no filtra por fecha, así que
    // `allDisplayEvents`/`todayDisplayEvents` resuelven igual (el segundo
    // solo se usa con date === "hoy").
    const filtrados = filterEvents(estado.eventos, estado.eventos, saltaHoy, texto, lugar, '', null, null, categoria, true)
    return soloGratisActivo ? soloGratis(filtrados) : filtrados
  }, [estado, texto, lugar, categoria, soloGratisActivo])

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      <View style={estilos.filtros}>
        <TextInput
          value={texto}
          onChangeText={setTexto}
          placeholder="Buscar eventos"
          placeholderTextColor={colors.border}
          style={[estilos.input, { borderColor: colors.border, color: colors.text }]}
        />
        <TextInput
          value={lugar}
          onChangeText={setLugar}
          placeholder="Lugar"
          placeholderTextColor={colors.border}
          style={[estilos.input, { borderColor: colors.border, color: colors.text }]}
        />

        {estado.tipo === 'ok' ? (
          <View style={estilos.filaChips}>
            {estado.categorias.map((cat) => {
              const seleccionada = categoria === cat.slug
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategoria(seleccionada ? null : cat.slug)}
                  style={[estilos.chip, { borderColor: colors.border }, seleccionada && { backgroundColor: colors.primary }]}
                >
                  <Text style={[estilos.textoChip, { color: seleccionada ? '#fff' : colors.text }]}>{cat.name}</Text>
                </Pressable>
              )
            })}
            <Pressable
              onPress={() => setSoloGratisActivo((valor) => !valor)}
              style={[estilos.chip, { borderColor: colors.border }, soloGratisActivo && { backgroundColor: colors.primary }]}
            >
              <Text style={[estilos.textoChip, { color: soloGratisActivo ? '#fff' : colors.text }]}>Solo gratis</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' ? (
        <FlatList
          data={eventosFiltrados}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={estilos.filaGrilla}
          contentContainerStyle={estilos.lista}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <Vacio
              mensaje={hayFiltros ? 'No encontramos eventos con esos filtros.' : 'No hay eventos por ahora.'}
              textoAccion={hayFiltros ? 'Limpiar filtros' : undefined}
              onAccion={hayFiltros ? limpiarFiltros : undefined}
            />
          }
          renderItem={({ item }) => (
            <View style={estilos.celda}>
              <TarjetaEvento evento={item} />
            </View>
          )}
        />
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  filtros: { padding: 16, gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10 },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  textoChip: { fontWeight: '600' },
  lista: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  filaGrilla: { gap: 12 },
  // Ver el comentario del mismo nombre en app/(tabs)/index.tsx: evita que la
  // última celda de un número impar de eventos se estire a todo el ancho.
  celda: { flex: 1, maxWidth: '50%' },
})
