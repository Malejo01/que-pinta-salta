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
// A6 (nube Q1) · Vacíos y sin conexión. Sin red, el error dice que no hay
// conexión; con un error del servidor, un texto neutro (`mensajeErrorCarga`,
// `lib/vacios.ts`). Un refresco que falla con la cartelera a la vista la
// conserva y avisa (`decidirRefresco` + `AvisoNoSeActualizo`). El vacío
// (`vacioCines`) dice por qué está vacío y ofrece una acción: con búsqueda,
// "Limpiar búsqueda"; sin búsqueda, "Ver eventos de hoy" (Buscar con la
// fecha "Hoy", `/buscar?atajo=hoy&v=<Date.now()>`: el mismo nonce que usa
// "Ver todos" de la portada para que Buscar vuelva a aplicar la fecha). La
// cartelera no se guarda sin conexión (la de ayer no sirve, R43).
import { useCallback, useEffect, useState } from 'react'
import { AccessibilityInfo, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AvisoNoSeActualizo } from '@/components/AvisoSinConexion'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { TarjetaPelicula } from '@/components/TarjetaPelicula'
import { Texto } from '@/components/Texto'
import { hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { obtenerCines, type Pelicula } from '@/lib/datos/cines'
import { decidirRefresco, mensajeErrorCarga, vacioCines } from '@/lib/vacios'

// A6: `error` ya es el texto para la pantalla (`mensajeErrorCarga`).
type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string; sinConexion?: boolean }
  | { tipo: 'ok'; peliculas: Pelicula[] }

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
  const router = useRouter()
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
    return resultado.ok
      ? { tipo: 'ok', peliculas: resultado.peliculas }
      : { tipo: 'error', error: mensajeErrorCarga('cines', resultado), sinConexion: resultado.sinConexion }
  }, [])

  // A6: "No pudimos actualizar..." cuando un refresco falla con la cartelera
  // a la vista; se limpia con cada carga nueva.
  const [notaRefresco, setNotaRefresco] = useState<string | null>(null)

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setNotaRefresco(null)
    setIntento((valor) => valor + 1)
  }, [])

  // A6: `decidirRefresco` (lib/vacios.ts) conserva la cartelera que se veía
  // (`estado`, por eso está en las dependencias) si el refresco falla.
  const refrescar = useCallback(async () => {
    setRefrescando(true)
    const decision = decidirRefresco(estado, await obtenerDatos())
    setEstado(decision.estado)
    setNotaRefresco(decision.nota)
    if (decision.anuncio) AccessibilityInfo.announceForAccessibility(decision.anuncio)
    setRefrescando(false)
  }, [obtenerDatos, estado])

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

  // Con búsqueda, el mismo mensaje que el estado vacío de `CinesView`; sin
  // búsqueda, desde A6, el porqué (la cartelera del día todavía no se cargó)
  // en vez de "No hay películas en cartelera actualmente." — y cada uno con
  // su acción (`vacioCines`, lib/vacios.ts).
  const vacio = vacioCines(busqueda)
  const alTocarAccionVacio = () => {
    if (vacio.accion.destino === 'limpiar-busqueda') setBusqueda('')
    else router.push(`/buscar?atajo=hoy&v=${Date.now()}`)
  }

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
          // A6: un refresco que falló con la cartelera a la vista: banda al
          // principio de la lista (dentro del scroll, nunca un toast).
          ListHeaderComponent={
            notaRefresco ? (
              <View style={estilos.avisoEnLista}>
                <AvisoNoSeActualizo texto={notaRefresco} onReintentar={refrescar} reintentando={refrescando} />
              </View>
            ) : null
          }
          ListEmptyComponent={<Vacio mensaje={vacio.texto} textoAccion={vacio.accion.texto} onAccion={alTocarAccionVacio} />}
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
  // A6: la banda de "No pudimos actualizar" va de borde a borde (compensa el padding de la lista).
  avisoEnLista: { marginHorizontal: -16, marginTop: -16 },
})
