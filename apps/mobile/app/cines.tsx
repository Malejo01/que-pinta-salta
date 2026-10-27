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
// R67 (67-c): la tarjeta (`components/TarjetaPelicula.tsx`) y el acordeón de
// un cine (`components/BloqueCine.tsx`) ya no son locales: los comparte la
// portada con el chip "Cine" y la ficha de la película. `funcionesPorCine`
// (R28, `lib/datos/cines.ts`) agrupa `showings` por cine adentro de la tarjeta.
//
// A8 (nube Q1, QPS-339): el buscador filtra la lista sin mostrar un conteo, y
// el único aviso visible es el vacío ("No hay resultados para…"), que un lector
// de pantalla no se enteraba que aparecía. Se anuncia con `useAnunciarConteo`
// (reglas en `lib/anunciar-conteo.ts`, la misma estrategia que la portada y
// Buscar): con texto, "2 películas para "dune"" o el vacío; al limpiar, "N
// películas en cartel". Lo tipeado espera `DEMORA_TEXTO_MS` sin teclas nuevas
// (no se anuncia en cada tecla); limpiar se anuncia al toque. El montaje no
// se anuncia (sin texto no hay nada que decir). El vacío no es una live
// region (`Vacio` no la tiene), así que no hay doble lectura.
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { TarjetaPelicula } from '@/components/TarjetaPelicula'
import { Texto } from '@/components/Texto'
import { hitSlopPara } from '@/lib/accesibilidad'
import { estadoAnunciableCines } from '@/lib/anunciar-conteo'
import { useAnunciarConteo } from '@/lib/anunciar-conteo-hook'
import { useColoresQPS } from '@/lib/colores'
import { obtenerCines, type Pelicula } from '@/lib/datos/cines'

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

  // A8 (nube Q1, QPS-339): `null` mientras carga o con error ("no hay nada").
  useAnunciarConteo(
    estado.tipo === 'ok'
      ? estadoAnunciableCines({ busqueda, cantidad: filtradas.length, total: peliculas.length, textoVacio: mensajeVacio })
      : null,
  )

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
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
            hitSlop={hitSlopPara(18)}
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
          renderItem={({ item }) => <TarjetaPelicula pelicula={item} />}
        />
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
})
