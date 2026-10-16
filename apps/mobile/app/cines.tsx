// Cines (R25; R29, 29-k: ops/paridad-web-app.md §3.8 e inventario, "Cines").
// Mismo armado que `CinesView`/`MovieCard` de la web (`apps/web/components/
// cines-view.tsx` y `movie-card.tsx`): buscador por título (sin acentos: la
// web tampoco lo hace, solo `toLowerCase()`) y una columna de tarjetas con
// el afiche 2:3 a ancho completo, el badge "N Cines" y, DENTRO de la propia
// tarjeta, el acordeón por cine (nombre, formatos con los horarios en chips
// y "Comprar Entradas"). A diferencia de la versión de la R28 (28-g), la
// tarjeta de la lista ya no navega a `/pelicula/<id>`: en la web el acordeón
// vive directo en `MovieCard`, sin una página aparte — esa ruta queda solo
// para Favoritos y la fila de cine de la portada (`FilaCategoria`), que no
// tienen la tarjeta completa disponible (ver el comentario de
// `app/pelicula/[id].tsx`).
//
// `funcionesPorCine` (R28, `lib/datos/cines.ts`) se reusa tal cual para
// agrupar `showings` por cine; `BloqueCine` (acordeón de un cine) está
// duplicado a propósito en este archivo y en `app/pelicula/[id].tsx`: no hay
// un componente compartido en los archivos permitidos de esta tarea.
import { useCallback, useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native'
import { Afiche } from '@/components/Afiche'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS, type ColoresQPS } from '@/lib/colores'
import {
  cantidadDeSalas,
  funcionesPorCine,
  obtenerCines,
  urlCompraCineSegura,
  type FuncionesDeCine,
  type Pelicula,
} from '@/lib/datos/cines'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'ok'; peliculas: Pelicula[] }

/**
 * Mismo filtro que `CinesView` (`movie.title.toLowerCase().includes(query.toLowerCase())`):
 * sin distinguir mayúsculas/minúsculas, sin normalizar acentos (la web
 * tampoco lo hace). Exportada para `tests/cines.test.ts`.
 */
export function filtrarPeliculasPorTitulo(peliculas: Pelicula[], busqueda: string): Pelicula[] {
  if (!busqueda) return peliculas
  const query = busqueda.toLowerCase()
  return peliculas.filter((pelicula) => pelicula.title.toLowerCase().includes(query))
}

export default function Cines() {
  const colores = useColoresQPS()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // lista sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  // Cuenta de "reintentos" (mismo patrón que `app/evento/[id].tsx` y
  // `app/(tabs)/buscar.tsx`, 29-b/29-j): el efecto no puede llamar, de forma
  // sincrónica, a una función que haga `setState` (lint
  // react-hooks/set-state-in-effect) — por eso el fetch va inline en el
  // efecto con `.then()`, y "Reintentar" solo sube este contador para que el
  // efecto se repita.
  const [intento, setIntento] = useState(0)

  const obtenerDatos = useCallback(async (): Promise<Estado> => {
    const resultado = await obtenerCines()
    return resultado.ok ? { tipo: 'ok', peliculas: resultado.peliculas } : { tipo: 'error', error: resultado.error }
  }, [])

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setIntento((valor) => valor + 1)
  }, [])

  const refrescar = useCallback(async () => {
    setRefrescando(true)
    setEstado(await obtenerDatos())
    setRefrescando(false)
  }, [obtenerDatos])

  useEffect(() => {
    let cancelado = false
    obtenerDatos().then((resultado) => {
      if (!cancelado) setEstado(resultado)
    })
    return () => {
      cancelado = true
    }
  }, [obtenerDatos, intento])

  const peliculas = estado.tipo === 'ok' ? estado.peliculas : []
  const filtradas = filtrarPeliculasPorTitulo(peliculas, busqueda)

  // Mismos dos mensajes que el estado vacío de `CinesView` (según haya o no
  // una búsqueda activa).
  const mensajeVacio = busqueda
    ? `No hay resultados para "${busqueda}". Probá buscando con otro título.`
    : 'No hay películas en cartelera actualmente.'

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      <Texto peso="bold" style={estilos.titulo}>
        Cines
      </Texto>

      <View style={[estilos.cajaBusqueda, { backgroundColor: colores.card, borderColor: colores.border }]}>
        <Icono nombre="Search" tamanio={20} color={colores.mutedForeground} />
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar película por nombre..."
          placeholderTextColor={colores.mutedForeground}
          style={[estilos.inputBusqueda, { color: colores.foreground }]}
        />
        {busqueda ? (
          <Pressable
            onPress={() => setBusqueda('')}
            accessibilityRole="button"
            accessibilityLabel="Limpiar búsqueda"
            hitSlop={8}
          >
            <Icono nombre="X" tamanio={18} color={colores.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' ? (
        <FlatList
          data={filtradas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={estilos.lista}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primary} colors={[colores.primary]} />
          }
          ListEmptyComponent={<Vacio mensaje={mensajeVacio} />}
          renderItem={({ item }) => <TarjetaPelicula pelicula={item} colores={colores} />}
        />
      ) : null}
    </View>
  )
}

/** Una tarjeta de la lista: afiche 2:3, badge "N Cines", título y el
 * acordeón por cine (igual que `MovieCard` de la web). */
function TarjetaPelicula({ pelicula, colores }: { pelicula: Pelicula; colores: ColoresQPS }) {
  const cines = funcionesPorCine(pelicula.showings)
  const cantidad = cantidadDeSalas(pelicula)
  // `Accordion type="single" collapsible` de la web: un solo cine abierto a
  // la vez dentro de la misma tarjeta.
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <View style={[estilos.tarjeta, { backgroundColor: colores.card, borderColor: colores.border }]}>
      <View style={estilos.contenedorAfiche}>
        <Afiche url={pelicula.poster_url} llenar />
        <View style={estilos.badge}>
          <Texto peso="semibold" style={estilos.textoBadge}>
            {cantidad} {cantidad === 1 ? 'Cine' : 'Cines'}
          </Texto>
        </View>
      </View>

      <Texto peso="bold" style={estilos.tituloPelicula} numberOfLines={2}>
        {pelicula.title}
      </Texto>

      <View style={[estilos.divisor, { borderColor: colores.border }]} />

      {cines.length === 0 ? (
        <Texto tono="secundario" style={estilos.sinFunciones}>
          Sin funciones para hoy
        </Texto>
      ) : (
        cines.map((cine, indice) => (
          <BloqueCine
            key={`${cine.cine}-${indice}`}
            cine={cine}
            colores={colores}
            abierto={abierto === cine.cine}
            esUltimo={indice === cines.length - 1}
            onToggle={() => setAbierto((actual) => (actual === cine.cine ? null : cine.cine))}
          />
        ))
      )}
    </View>
  )
}

/** Un cine dentro del acordeón: el nombre como trigger y, abierto, los
 * formatos con sus horarios en chips y "Comprar Entradas". Mismo componente
 * (duplicado) en `app/pelicula/[id].tsx`. */
function BloqueCine({
  cine,
  colores,
  abierto,
  esUltimo,
  onToggle,
}: {
  cine: FuncionesDeCine
  colores: ColoresQPS
  abierto: boolean
  esUltimo: boolean
  onToggle: () => void
}) {
  // Único origen válido para abrir una URL de compra (R28, 28-g): el
  // `booking_url` crudo (`cine.urlCompra`) nunca llega a `Linking.openURL`
  // directo — siempre pasa por `urlCompraCineSegura` (ver
  // `tests/aperturas-url.test.ts`).
  const urlCompra = urlCompraCineSegura(cine.urlCompra)

  return (
    <View style={[estilos.bloqueCine, !esUltimo && { borderBottomWidth: 1, borderColor: colores.border }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: abierto }} style={estilos.triggerCine}>
        <View style={estilos.triggerTexto}>
          <View style={[estilos.punto, { backgroundColor: colores.primary }]} />
          <Texto peso="semibold" style={estilos.nombreCine}>
            {cine.cine}
          </Texto>
        </View>
        <View style={abierto ? estilos.chevronAbierto : undefined}>
          <Icono nombre="ChevronDown" tamanio={18} color={colores.mutedForeground} />
        </View>
      </Pressable>

      {abierto ? (
        <View style={estilos.contenidoCine}>
          {cine.formatos.map((formato, indice) => (
            <View key={`${formato.tipo}-${indice}`} style={[estilos.cajaFormato, { backgroundColor: colores.muted, borderColor: colores.border }]}>
              <Texto tono="secundario" peso="semibold" style={estilos.tipoFormato}>
                {formato.tipo}
              </Texto>
              <View style={estilos.filaChips}>
                {formato.horarios.map((horario, indiceHorario) => (
                  <View key={`${horario}-${indiceHorario}`} style={[estilos.chip, { backgroundColor: colores.card, borderColor: colores.border }]}>
                    <Texto style={estilos.textoChip}>{horario}</Texto>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {urlCompra ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(urlCompra).catch(() => {})}
              style={[estilos.botonComprar, { backgroundColor: colores.muted }]}
            >
              <Icono nombre="Ticket" tamanio={14} color={colores.primary} />
              <Texto peso="semibold" style={estilos.textoComprar}>
                Comprar Entradas
              </Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  titulo: { fontSize: 20, padding: 16, paddingBottom: 12 },
  cajaBusqueda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputBusqueda: { flex: 1, fontSize: 15, paddingVertical: 10 },
  lista: { padding: 16, gap: 16 },
  tarjeta: { borderWidth: 1, borderRadius: 16, padding: 16 },
  contenedorAfiche: { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  textoBadge: { color: '#fff', fontSize: 11 },
  tituloPelicula: { fontSize: 17, marginTop: 12 },
  divisor: { borderTopWidth: 1, marginTop: 10, marginBottom: 2 },
  sinFunciones: { textAlign: 'center', fontStyle: 'italic', paddingVertical: 8 },
  bloqueCine: { paddingVertical: 4 },
  triggerCine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingVertical: 4 },
  triggerTexto: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  punto: { width: 6, height: 6, borderRadius: 3 },
  nombreCine: { fontSize: 14, flexShrink: 1 },
  chevronAbierto: { transform: [{ rotate: '180deg' }] },
  contenidoCine: { gap: 8, paddingBottom: 10 },
  cajaFormato: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  tipoFormato: { fontSize: 12 },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  textoChip: { fontSize: 12 },
  botonComprar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 10 },
  textoComprar: { fontSize: 12 },
})
