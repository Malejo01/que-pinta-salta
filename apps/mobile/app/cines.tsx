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
// Buscar): con texto, "2 películas para dune" o "Ninguna película para dune"
// (el vacío visible no cambia); al limpiar, "N películas en cartel". Lo
// tipeado espera `DEMORA_TEXTO_MS` sin teclas nuevas (no se anuncia en cada
// tecla); limpiar y enviar con el teclado (`onSubmitEditing`, nonce
// `toqueBusqueda`) se anuncian al toque. El montaje no se anuncia (sin texto
// no hay nada que decir). El vacío no es una live region (`Vacio` no la
// tiene), así que no hay doble lectura. Una línea de conteo visible quedó
// descartada en la revisión de A8: se mantiene solo el anuncio.
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
//
// Ronda de correcciones: "Ver eventos de hoy" usa `router.dismissTo`, no
// `push` ni `navigate`. Cines es una pantalla del Stack raíz, apilada encima
// de `(tabs)`; verificado en el expo-router instalado (57.0.26,
// `build/global-state/getNavigationAction.js` + el `StackRouter` que trae en
// `build/react-navigation/routers/StackRouter.js`): `push` y también
// `navigate` (acción `NAVIGATE` sin `pop`, y `(tabs)` no es la ruta de
// arriba) agregan un SEGUNDO `(tabs)` al Stack; `dismissTo` (acción `POP_TO`)
// vuelve al `(tabs)` que ya está abajo con los parámetros nuevos (y si Cines
// se abrió sola, desde un push, reemplaza Cines por `(tabs)`).
//
// Integración (R76): los avisos de A6 (refresco que falla, reintento que
// vuelve a fallar) pasan por `anunciar` (`lib/anunciar.ts`), no por
// `AccessibilityInfo` directo. No chocan con A8: ese anuncia el conteo/vacío
// de la búsqueda; estos, errores de carga, y no se pisan (no hay lista).
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AvisoNoSeActualizo } from '@/components/AvisoSinConexion'
import { EsqueletoCines } from '@/components/Esqueleto'
import { ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { TarjetaPelicula } from '@/components/TarjetaPelicula'
import { Texto } from '@/components/Texto'
import { hitSlopPara } from '@/lib/accesibilidad'
import { anunciar } from '@/lib/anunciar'
import { estadoAnunciableCines } from '@/lib/anunciar-conteo'
import { useAnunciarConteo } from '@/lib/anunciar-conteo-hook'
import { useColoresQPS } from '@/lib/colores'
import { obtenerCines, type Pelicula } from '@/lib/datos/cines'
import { anuncioDeReintento, decidirRefresco, mensajeErrorCarga, vacioCines } from '@/lib/vacios'

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
  // A8 (nube Q1, QPS-339): nonce del texto enviado con la tecla del teclado.
  const [toqueBusqueda, setToqueBusqueda] = useState(0)
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
    const decision = decidirRefresco(estado, await obtenerDatos(), notaRefresco)
    setEstado(decision.estado)
    setNotaRefresco(decision.nota)
    const aviso = decision.anuncio
    if (aviso) anunciar(aviso)
    setRefrescando(false)
  }, [obtenerDatos, estado, notaRefresco])

  useEffect(() => {
    let cancelado = false
    obtenerDatos().then((resultado) => {
      if (cancelado) return
      setEstado(resultado)
      // A6: un "Reintentar" de `ErrorCarga` (`intento > 0`) que vuelve a dar
      // error se anuncia; si no, parecía que el botón no hizo nada.
      const avisoError = anuncioDeReintento(intento > 0, resultado)
      if (avisoError) anunciar(avisoError)
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
    else router.dismissTo(`/buscar?atajo=hoy&v=${Date.now()}`)
  }

  // A8 (nube Q1, QPS-339): `null` mientras carga o con error ("no hay nada").
  useAnunciarConteo(
    estado.tipo === 'ok'
      ? estadoAnunciableCines({ busqueda, cantidad: filtradas.length, total: peliculas.length, toque: toqueBusqueda })
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
          onSubmitEditing={() => setToqueBusqueda((n) => n + 1)}
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

      {/* A1 (nube Q1): esqueleto de la lista de `TarjetaPelicula` en vez de
          `Cargando`, debajo del título y el buscador. El pull-to-refresh no
          cambia (sigue la lista a la vista). */}
      {estado.tipo === 'cargando' ? <EsqueletoCines /> : null}

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
          ListEmptyComponent={
            <Vacio mensaje={vacio.texto} textoAccion={vacio.accion.texto} onAccion={alTocarAccionVacio} accionPrincipal />
          }
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
