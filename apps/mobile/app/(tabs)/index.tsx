// Portada (R29, 29-h: ops/paridad-web-app.md §3.2 y §2 puntos 6, 7 y 9;
// paridad con `apps/web/components/home-content.tsx`). Estructura de la web:
// Hero → pills de fecha (acá, los atajos de la app, D3; desde la R67, 67-b van
// arriba de todo, en la cabecera fija, ver más abajo) → "Hoy en Salta" →
// filas por categoría (de más eventos a menos, el cine es una fila más) →
// banner del Radar después de la 2.ª fila. La Bienvenida se muestra antes de
// esto, una sola vez (lib/bienvenida.ts): mientras no se sepa si ya se vio,
// no se dibuja nada, y si no se vio, se redirige — sin cambios desde la R25.
//
// Los atajos (Hoy · Esta noche · Finde · Semana) siguen sin cambiar de
// comportamiento, pero desde 36-a (G2 del feedback del teléfono) se aplican
// **en memoria**: Inicio pide los eventos vigentes una sola vez
// (`obtenerEventosVigentesParaInicio`, sin `Atajo`), junto con las
// categorías y los cines, y solo vuelve a pedirlos al montar, con
// "Reintentar" o con pull-to-refresh. Cambiar de atajo filtra ese mismo
// listado con `eventoEnAtajo` (core) y la `ahora` guardada junto con la
// carga — nunca pasa por `Cargando`. "Ver esta semana" (en el vacío de "Hoy
// en Salta") y "Ver todos" de "Hoy en Salta" activan atajos
// (`semana`/`hoy`), igual que la web los traduce a su filtro de fecha.
//
// Las películas en cartel (`lib/datos/cines.ts`) se cargan en paralelo y se
// suman al conjunto con `transformMovie` (`@qps/core/home/transform`,
// `category: 'cine'`): como "Cine" ya es una categoría real de `categories`,
// `groupByCategory` las ubica en su propia fila sin lógica extra acá, igual
// que en la web.
//
// R66 (66-a): los chips de categoría (`components/ChipsCategorias.tsx`) van
// arriba de todo, en la cabecera fija (R67, 67-b). Sus categorías salen de `categoriasDisponibles` (core)
// sobre los eventos del atajo elegido (más las películas). Con "Todas" la
// portada queda como siempre; con una categoría, el cuerpo es un título
// ("Música · Finde") y una grilla de 2 columnas con `filtrarCombinado` (atajo +
// categoría), todo en memoria sobre lo ya cargado — así también anda con la
// caché de la R43. En ese modo no van el banner del Radar ni el anuncio (regla
// del pliegue) ni el Hero (mide ~60 % de la ventana y empujaba la grilla fuera
// de pantalla, además de mezclar categorías). "Ver todos" suma el atajo y un
// nonce `v` (`Date.now()` en el `onPress`): `/buscar?categoria=…&atajo=…&v=…`;
// Buscar lo usa para volver a aplicar los parámetros aunque sean idénticos.
// 66-c: sin eventos para la combinación hay una caja con "Ver <Nombre> en todas
// las fechas" (`/buscar?categoria=…&v=…` sin atajo; el cine, "Ver cartelera", va
// a `/cines`) y "Todas las
// categorías"; con eventos, una línea "N eventos" (live region) bajo el título.
// Sin chips que elegir no se dibuja la fila. Sin conexión: nada de esto pide
// red (todo es memoria sobre lo cargado), y `AvisoSinConexion` va debajo de la cabecera fija.
// R67, 67-c: con el chip "Cine", las películas se dibujan como la cartelera de
// `app/cines.tsx` (`components/TarjetaPelicula.tsx`, a ancho completo y con su
// acordeón por cine), no como tarjetas de evento en 2 columnas; los eventos
// reales de la categoría cine, si hay, van en la grilla debajo.
//
// R67, 67-b: orden nuevo de la portada: cabecera fija (chips de categoría
// arriba, pills de fecha debajo; `stickyHeaderIndices={[0]}`, fondo opaco) →
// aviso sin conexión → Hero (solo con "Todas") → resto, igual que antes. Antes
// los chips quedaban debajo del Hero y no se descubrían. Cambiar de chip o de
// pill vuelve el scroll arriba (`scrollTo` en el handler, no en un efecto).
//
// A2 (nube Q1): chip "Gratis" (`components/ChipGratis.tsx`), adelante de
// "Todas" en la fila de chips de la cabecera fija (prop `gratis` de
// `ChipsCategorias`; Buscar no la usa). Es un interruptor aparte de la
// categoría y de la fecha: los tres se combinan con `filtrarCombinado` (core,
// `soloGratis` = `price === 'gratis'`, o sea `is_free = true`), a través de
// `eventosDeLaGrilla` (`lib/portada-gratis.ts`, donde está la lógica pura y
// sus reglas). Con "Gratis" apagado la portada queda exactamente como antes.
// Prendido, la portada pasa al modo grilla (como con una categoría): título
// "Gratis · Hoy" o "Música gratis · Finde" (`tituloGratis`), la misma línea
// "N eventos" con su live region y su anuncio, y la grilla de 2 columnas; sin
// Hero, sin `InvitacionAvisos`, sin banners ni anuncio. Los chips de categoría
// salen solo de los eventos gratis de la fecha (`chipsDeLaPortada`), con la
// elegida siempre presente. Las películas no son gratis: con "Cine" + "Gratis"
// quedan afuera (el título va con la fecha, no "En cartel") y, si no hay
// eventos de cine gratis, el vacío lo explica. El vacío de "Gratis" dice por
// qué está vacío (`textoVacioGratis`) y ofrece "Ver todos los precios" (apaga
// "Gratis" y deja fecha y categoría) y una segunda salida que deja "Gratis"
// prendido (`segundaSalidaVacioGratis`: "Todas las categorías" o "Ver esta
// semana"). Cambiar "Gratis" vuelve el scroll arriba (`cambiarGratis`), igual
// que el chip y la pill.
//
// Lo que no se copia, a propósito (ops/paridad-web-app.md, inventario
// "Portada" y la tarea 29-h): "Más filtros" (lugar/zona) y el switch
// "Mostrar flyers de redes" — ninguno de los dos tiene un equivalente de
// ronda en la app todavía.
//
// AdSense SÍ tiene equivalente ahora (R60, 52-d: AdMob en la app, fase 2 de
// la R52): el banner (`components/BannerAnuncio.tsx`) va en esta pantalla
// (después de la 4.ª fila de categorías, ver `seccionesPortada`) y en
// Buscar — nunca arriba del pliegue (regla (a) de Mauro, 19/10: ningún
// anuncio arriba del pliegue) y nunca en la ficha de un evento ni en el Hero
// de esta misma pantalla. El detector que lo exige está en
// `tests/anuncios-lugares.test.ts`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { formatDateInSalta, transformMovie } from '@qps/core/home/transform'
import { selectCarouselEvents, sortCategories } from '@qps/core/home/carousel'
import { groupByCategory, selectTodayRow, type CategoryEventsRow } from '@qps/core/home/filters'
import { eventoEnAtajo, type Atajo } from '@qps/core/home/atajos'
import type { ItemFiltrable } from '@qps/core/home/filtros-combinados'
import type { DisplayEvent } from '@qps/core/home/types'
import type { Category } from '@qps/core/types'
import { AvisoSinConexion } from '@/components/AvisoSinConexion'
import { BannerAnuncio } from '@/components/BannerAnuncio'
import { BannerRadar } from '@/components/BannerRadar'
import { ChipsCategorias } from '@/components/ChipsCategorias'
import { Cargando, ErrorCarga } from '@/components/EstadoCarga'
import { FilaCategoria } from '@/components/FilaCategoria'
import { Hero } from '@/components/Hero'
import { InvitacionAvisos } from '@/components/InvitacionAvisos'
import { PillsAtajos } from '@/components/PillsAtajos'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { TarjetaPelicula } from '@/components/TarjetaPelicula'
import { Texto } from '@/components/Texto'
import { useBienvenidaVista } from '@/lib/bienvenida'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'
import { obtenerCines, type Pelicula } from '@/lib/datos/cines'
import {
  obtenerCategorias,
  obtenerEventosVigentesParaInicio,
  type CategoriaBasica,
  type EventoVigenteParaInicio,
} from '@/lib/datos/eventos'
import { cargarAgendaConCache } from '@/lib/sin-conexion/agenda'
import {
  chipsDeLaPortada,
  ETIQUETA_ATAJO,
  eventosDeLaGrilla,
  FRASE_ATAJO,
  segundaSalidaVacioGratis,
  textoVacioGratis,
  tituloGratis,
  type SegundaSalidaGratis,
} from '@/lib/portada-gratis'

type EstadoPortada =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | {
      tipo: 'ok'
      eventos: EventoVigenteParaInicio[]
      categorias: CategoriaBasica[]
      peliculas: Pelicula[]
      // Un único instante por carga (36-a): el mismo `ahora` que decidió
      // qué era "vigente" en la consulta alimenta después el filtro de
      // atajo y el armado de la portada, para que no se corra si pasa el
      // tiempo sin recargar (ver el `useMemo` de `datosPortada`, más abajo).
      ahora: Date
      // R43, 43-c: cuándo se guardó lo que se está mostrando, si viene de la
      // caché (`cargarAgendaConCache`, por una falla de red); `null` con una
      // carga fresca. `AvisoSinConexion` se dibuja solo cuando no es `null`.
      desdeCache: { guardadoEn: Date } | null
    }

export type SeccionPortada =
  | { tipo: 'hoy'; eventos: DisplayEvent[] }
  | { tipo: 'categoria'; fila: CategoryEventsRow }
  | { tipo: 'banner-radar' }
  | { tipo: 'anuncio' }

/**
 * Cuántas filas de categoría tienen que existir para que el anuncio se dibuje
 * al final (cuando no se llegó al índice 3). Es una constante con nombre y no
 * un `2` suelto porque lo que la fija es la regla (a) de Mauro y la cuenta de
 * alturas que está en el docstring de `seccionesPortada`: bajarla a 0 o a 1
 * devuelve el banner arriba del pliegue. `tests/portada.test.ts` exige por
 * texto que este archivo la siga declarando en 2.
 */
export const FILAS_MINIMAS_PARA_ANUNCIO = 2

/**
 * Arma la lista de secciones del cuerpo de la portada: "Hoy en Salta",
 * después cada fila de `filas` (el resultado de `groupByCategory`, en su
 * mismo orden), con el banner del Radar insertado justo después de la 2.ª
 * (índice 1) — misma posición que `apps/web/components/home-content.tsx`
 * ("Banner de Radar después de la segunda categoría"), contando sobre TODAS
 * las filas de `groupByCategory` (incluidas las que terminan sin eventos:
 * `FilaCategoria` ya no dibuja nada para esas, pero igual cuentan para la
 * posición, tal cual la web). Pura: sin React, para poder testearla sola.
 *
 * R60, 52-d: se suma el banner de AdMob (`tipo: 'anuncio'`), después de la
 * 4.ª fila (índice 3), contando también sobre TODAS las filas (igual que el
 * banner del Radar). Diferencia deliberada con la web (que no muestra el
 * anuncio si hay menos de 4 filas, porque ahí el anuncio va "en medio" de un
 * `.flatMap` fijo): acá, con 2 o 3 filas, el anuncio va al FINAL de la lista
 * de secciones en vez de desaparecer.
 *
 * **Con menos de 2 filas no hay anuncio**, y eso es la regla (a) de Mauro
 * ("ningún anuncio arriba del pliegue"), no una preferencia: la cuenta de
 * alturas de ux-ui para un celular de 360×800 (la medida de referencia) da,
 * con la caja vacía de "Hoy en Salta" (`estilos.vacioHoy`, ~188 dp) y
 * `PillsAtajos` (~68 dp), el banner arrancando a los ~256 dp con 0 filas y a
 * los ~582 dp con 1, contra un área visible de ~649 dp: en los dos casos
 * asoma **sin scrollear**. Con 2 filas, las dos `FilaCategoria` (~326 dp cada
 * una) más el banner del Radar lo empujan arriba de los 900 dp. O sea que el
 * umbral es dónde empieza a haber contenido real que mirar antes del aviso.
 *
 * R67, 67-b: las pills dejaron de ir después del Hero: ahora están, con los
 * chips, en una cabecera fija arriba de todo (≈113 dp con chips: 8 de aire + 60
 * de chips con su padding + 56 de pills − 12 del `marginTop` negativo + 1 del
 * borde; ≈65 dp sin chips, en vez de los ~68 dp de las pills solas). Con ese
 * valor el banner arranca a ~301 dp con 0 filas y a ~627 dp con 1 (113 + 188 +
 * 326), todavía dentro de los ~649 dp sin scrollear; y la cabecera fija tapa
 * ~113 dp del área visible útil al scrollear (quedan ~536 dp). O sea que el anuncio queda más abajo, nunca más arriba: la regla y
 * el umbral siguen valiendo sin cambios.
 *
 * Ojo con el porqué de las filas, que es contraintuitivo: `groupByCategory`
 * devuelve **una fila por cada categoría configurada en el admin**, con
 * eventos o sin ellos, así que `filas.length` NO baja porque la agenda esté
 * flojita — hoy en producción son bastantes más de 4. Llegar a menos de 2
 * filas quiere decir que casi no quedan categorías cargadas, no que sea un
 * día tranquilo.
 */
export function seccionesPortada(filas: CategoryEventsRow[], hoyEventos: DisplayEvent[]): SeccionPortada[] {
  const secciones: SeccionPortada[] = [{ tipo: 'hoy', eventos: hoyEventos }]
  let anuncioInsertado = false

  filas.forEach((fila, indice) => {
    secciones.push({ tipo: 'categoria', fila })
    if (indice === 1) secciones.push({ tipo: 'banner-radar' })
    if (indice === 3) {
      secciones.push({ tipo: 'anuncio' })
      anuncioInsertado = true
    }
  })

  if (!anuncioInsertado && filas.length >= FILAS_MINIMAS_PARA_ANUNCIO) secciones.push({ tipo: 'anuncio' })

  return secciones
}

// `ETIQUETA_ATAJO` (título, "Música · Finde") y `FRASE_ATAJO` (vacío, "No hay
// eventos de Música para hoy.") viven en `lib/portada-gratis.ts` desde A2 (nube
// Q1): los usan también el título y el vacío de "Gratis".

/**
 * Línea de conteo bajo el título de la categoría (R67, 67-c): "N eventos" como
 * siempre; con películas del chip "Cine", "N películas" y, si además hay
 * eventos reales, "N películas · M eventos". Singular/plural bien en ambos.
 */
export function conteoCategoria(peliculas: number, eventos: number): string {
  const textoEventos = `${eventos} ${eventos === 1 ? 'evento' : 'eventos'}`
  if (peliculas === 0) return textoEventos
  const textoPeliculas = `${peliculas} ${peliculas === 1 ? 'película' : 'películas'}`
  return eventos === 0 ? textoPeliculas : `${textoPeliculas} · ${textoEventos}`
}

function enFilasDeDos<T>(lista: T[]): T[][] {
  const filas: T[][] = []
  for (let i = 0; i < lista.length; i += 2) filas.push(lista.slice(i, i + 2))
  return filas
}

/**
 * Vacío del modo "Gratis" (A2, nube Q1): dice por qué está vacío
 * (`textoVacioGratis`) y ofrece "Ver todos los precios" (apaga "Gratis" y deja
 * fecha y categoría) y, si corresponde, una segunda salida que deja "Gratis"
 * prendido (`segundaSalidaVacioGratis`). Misma caja y mismos botones que el
 * vacío del modo categoría (botón principal relleno, secundario con contorno).
 */
function VacioGratis({
  texto,
  segunda,
  onVerTodosLosPrecios,
  onTodasLasCategorias,
  onEstaSemana,
  bordeSecundario,
}: {
  texto: string
  segunda: SegundaSalidaGratis | null
  onVerTodosLosPrecios: () => void
  onTodasLasCategorias: () => void
  onEstaSemana: () => void
  bordeSecundario: string
}) {
  const colores = useColoresQPS()
  return (
    <View style={[estilos.vacioHoy, estilos.vacioCategoria, { backgroundColor: colores.card, borderColor: colores.border }]}>
      <Texto tono="secundario">{texto}</Texto>
      <Pressable
        onPress={onVerTodosLosPrecios}
        accessibilityRole="button"
        style={[estilos.vacioHoyBoton, estilos.botonVacio, { backgroundColor: colores.primary }]}
      >
        <Texto peso="bold" style={{ color: colores.primaryForeground }}>
          Ver todos los precios
        </Texto>
      </Pressable>
      {segunda !== null ? (
        <Pressable
          onPress={segunda.tipo === 'todas-las-categorias' ? onTodasLasCategorias : onEstaSemana}
          accessibilityRole="button"
          style={[estilos.vacioHoyBoton, estilos.botonVacio, { borderWidth: 1, borderColor: bordeSecundario }]}
        >
          <Texto peso="bold">{segunda.texto}</Texto>
        </Pressable>
      ) : null}
    </View>
  )
}

export default function Inicio() {
  const { cargando: cargandoBienvenida, vista } = useBienvenidaVista()
  const colores = useColoresQPS()
  // A2 (nube Q1): borde del botón secundario del vacío de "Gratis" a 3:1.
  const bordeInactivo = bordeChipInactivo(colores)
  const router = useRouter()
  const [atajo, setAtajo] = useState<Atajo>('hoy')
  const [categoria, setCategoria] = useState<string | null>(null)
  // A2 (nube Q1): el chip "Gratis" (prendido/apagado), aparte de la categoría.
  const [gratis, setGratis] = useState(false)
  const [estado, setEstado] = useState<EstadoPortada>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, lo
  // que ya está armado sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  // Sin `atajo` entre las dependencias (36-a): cambiar de atajo ya no vuelve
  // a pedir nada, así que esta función queda estable entre renders.
  //
  // R43, 43-c: la carga en sí (las tres consultas en paralelo) pasa a ser el
  // `cargar` que le inyecta a `cargarAgendaConCache` (`@/lib/sin-conexion/agenda`):
  // si falla por red, esa función muestra la última caché buena en vez del
  // error. El `error` que se devuelve es el de la PRIMERA consulta que falló
  // (eventos, después categorías, después películas — mismo orden que antes
  // de esta ronda), pero `sinConexion` es el O lógico de las tres: una falla
  // de red en cualquiera alcanza para habilitar la caché, aunque la primera
  // en fallar no haya sido por red.
  const cargarDatos = useCallback(async (): Promise<EstadoPortada> => {
    // Un único instante por carga (no `new Date()` suelto por el componente):
    // decide qué es "vigente" en la consulta y queda guardado en `estado`
    // para que el filtro de atajo y el armado de la portada usen el mismo.
    // Es también la `ahora` con la que `cargarAgendaConCache` filtra la
    // caché al mostrarla: la de ESTA carga, no la de cuando se guardó.
    const ahora = new Date()

    const resultado = await cargarAgendaConCache({
      ahora,
      cargar: async () => {
        const [resEventos, resCategorias, resPeliculas] = await Promise.all([
          obtenerEventosVigentesParaInicio(ahora),
          obtenerCategorias(),
          obtenerCines(),
        ])

        const sinConexion =
          (!resEventos.ok && Boolean(resEventos.sinConexion)) ||
          (!resCategorias.ok && Boolean(resCategorias.sinConexion)) ||
          (!resPeliculas.ok && Boolean(resPeliculas.sinConexion))

        if (!resEventos.ok) return { ok: false, error: resEventos.error, sinConexion: sinConexion || undefined }
        if (!resCategorias.ok) return { ok: false, error: resCategorias.error, sinConexion: sinConexion || undefined }
        if (!resPeliculas.ok) return { ok: false, error: resPeliculas.error, sinConexion: sinConexion || undefined }

        return {
          ok: true,
          datos: { eventos: resEventos.eventos, categorias: resCategorias.categorias, peliculas: resPeliculas.peliculas },
        }
      },
    })

    if (resultado.tipo === 'error') return { tipo: 'error', error: resultado.error }

    return {
      tipo: 'ok',
      eventos: resultado.datos.eventos,
      categorias: resultado.datos.categorias,
      peliculas: resultado.datos.peliculas,
      ahora,
      desdeCache: resultado.desdeCache,
    }
  }, [])

  // Cuenta de "reintentos" (mismo patrón que `app/evento/[id].tsx` y
  // `app/pelicula/[id].tsx`, 28-l): el efecto no puede llamar, de forma
  // sincrónica, a una función que haga `setState` (lint
  // `react-hooks/set-state-in-effect`). El fetch va inline acá abajo con
  // `.then()` (el `setState` queda en el callback de la promesa, no en el
  // cuerpo sincrónico del efecto); "Reintentar" solo sube este contador.
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let cancelado = false

    cargarDatos().then((resultado) => {
      if (!cancelado) setEstado(resultado)
    })

    return () => {
      cancelado = true
    }
  }, [cargarDatos, intento])

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setIntento((valor) => valor + 1)
  }, [])

  const refrescar = useCallback(async () => {
    setRefrescando(true)
    setEstado(await cargarDatos())
    setRefrescando(false)
  }, [cargarDatos])

  const datosPortada = useMemo(() => {
    if (estado.tipo !== 'ok') return null

    // La misma `ahora` de la carga (guardada en `estado`), no una nueva: así
    // el filtro de atajo tampoco se corre si pasa el tiempo sin recargar.
    const { ahora } = estado
    const saltaTodayStr = formatDateInSalta(ahora)

    // El atajo se aplica en memoria (36-a): las películas de cine no entran
    // en este filtro, a propósito — se suman siempre, como antes (`peliculasComoEventos`).
    const eventosDelAtajo = estado.eventos
      .filter((item) => eventoEnAtajo(item.paraAtajo, atajo, ahora))
      .map((item) => item.evento)
    const peliculasComoEventos = estado.peliculas.map((pelicula) => transformMovie(pelicula, saltaTodayStr))
    const todosLosEventos = [...eventosDelAtajo, ...peliculasComoEventos]

    // `sortCategories`/`groupByCategory` (de core) solo usan `.slug` y
    // `.name` de cada categoría: `CategoriaBasica` (lib/datos/eventos.ts)
    // los tiene, aunque le falten las demás columnas del tipo `Category` de
    // core (`Tables<'categories'>` completo).
    const categorias = estado.categorias as unknown as Category[]
    const categoriasOrdenadas = sortCategories(categorias, todosLosEventos, ahora, [])
    const carrusel = selectCarouselEvents(todosLosEventos, categoriasOrdenadas, ahora)
    const filas = groupByCategory(categoriasOrdenadas, todosLosEventos, null, null, ahora)
    const hoyEventos = selectTodayRow(todosLosEventos, saltaTodayStr, ahora)

    // R66, 66-a: chips y modo "categoría elegida", sobre lo mismo ya cargado.
    // A2 (nube Q1): con "Gratis", los chips salen solo de los eventos gratis
    // (sin "Gratis", la misma `categoriasDisponibles` de siempre).
    const chips = chipsDeLaPortada(todosLosEventos, estado.categorias, categoria, gratis)
    let eventosCategoria: DisplayEvent[] = []
    let nombreCategoria = ''
    // R67, 67-c: con "Cine", las películas (`isCinemaMovie`, id `movie-<uuid>`)
    // salen como `Pelicula` completas (con sus funciones) en el mismo orden que
    // `eventosCategoria`; los eventos reales de la categoría quedan aparte.
    const peliculasCategoria: Pelicula[] = []
    let eventosSinPelicula: DisplayEvent[] = []
    // A2 (nube Q1): la grilla también se arma con "Gratis" prendido y "Todas".
    if (categoria !== null || gratis) {
      const items: ItemFiltrable[] = [
        ...estado.eventos,
        ...peliculasComoEventos.map((evento) => ({ evento, paraAtajo: null })),
      ]
      // `filtrarCombinado` (core) con atajo + categoría + gratis (A2).
      eventosCategoria = eventosDeLaGrilla(items, { atajo, categoria, gratis }, ahora)
      nombreCategoria = categoria === null ? '' : (estado.categorias.find((c) => c.slug === categoria)?.name ?? categoria)
      if (categoria === 'cine') {
        const porId = new Map(estado.peliculas.map((pelicula) => [`movie-${pelicula.id}`, pelicula]))
        for (const evento of eventosCategoria) {
          const pelicula = evento.isCinemaMovie ? porId.get(evento.id) : undefined
          if (pelicula) peliculasCategoria.push(pelicula)
          else eventosSinPelicula.push(evento)
        }
      } else {
        eventosSinPelicula = eventosCategoria
      }
    }

    return { carrusel, filas, hoyEventos, chips, eventosCategoria, peliculasCategoria, eventosSinPelicula, nombreCategoria }
  }, [estado, atajo, categoria, gratis])

  // Con una categoría elegida (R66) o con "Gratis" prendido (A2) no hay
  // secciones: ni "Hoy en Salta", ni filas, ni banners — el cuerpo es la
  // grilla de más abajo.
  const nombreCategoria = datosPortada?.nombreCategoria ?? ''
  const secciones = useMemo(
    () => (datosPortada && categoria === null && !gratis ? seccionesPortada(datosPortada.filas, datosPortada.hoyEventos) : []),
    [datosPortada, categoria, gratis]
  )

  // R67, 67-b: al cambiar de pill o de chip la portada vuelve arriba (así, con
  // la portada scrolleada, se ve el principio de lo nuevo y no un hueco). Va en
  // el handler, no en un efecto. Abrir el acordeón de una película no pasa por acá.
  const cambiarAtajo = useCallback((nuevo: Atajo) => {
    setAtajo(nuevo)
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [])
  const cambiarCategoria = useCallback((nueva: string | null) => {
    setCategoria(nueva)
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [])
  // A2 (nube Q1): lo mismo al prender o apagar "Gratis" (también desde "Ver
  // todos los precios" del vacío).
  const cambiarGratis = useCallback((nuevo: boolean) => {
    setGratis(nuevo)
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [])

  // R69, 69-b (QPS-354): el conteo tiene `accessibilityLiveRegion="polite"`,
  // pero Android anuncia los cambios de una live region, no su montaje: al
  // entrar al modo categoría la primera línea no se leía. Se anuncia con
  // `announceForAccessibility` cuando el conteo pasa de no estar a estar. Para
  // no leer dos veces el mismo texto, los cambios posteriores (la live region
  // ya montada) los anuncia la live region en Android y este efecto solo en
  // iOS, que ignora `accessibilityLiveRegion`. Un anuncio no es `setState`.
  // A2 (nube Q1): el modo "Gratis" usa la misma línea y el mismo anuncio.
  const textoConteo =
    datosPortada && (categoria !== null || gratis) && datosPortada.eventosCategoria.length > 0
      ? conteoCategoria(datosPortada.peliculasCategoria.length, datosPortada.eventosSinPelicula.length)
      : null
  const conteoVisible = useRef(false)
  useEffect(() => {
    if (textoConteo === null) {
      conteoVisible.current = false
      return
    }
    const primeraVez = !conteoVisible.current
    conteoVisible.current = true
    if (primeraVez || Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(textoConteo)
  }, [textoConteo])

  if (cargandoBienvenida) return null
  if (!vista) return <Redirect href="/bienvenida" />

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' && datosPortada ? (
        <ScrollView
          ref={scrollRef}
          stickyHeaderIndices={[0]}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primary} colors={[colores.primary]} />
          }
          contentContainerStyle={estilos.scroll}
        >
          {/* R67, 67-b: cabecera fija (primer hijo, siempre presente: el índice 0
              de `stickyHeaderIndices`). Fondo opaco para que el contenido no se
              vea por detrás. Chips arriba, pills de fecha debajo. */}
          <View style={[estilos.cabecera, { backgroundColor: colores.background, borderBottomColor: colores.border }]}>
            {/* A2 (nube Q1): con "Gratis" prendido la fila va siempre (aunque
                no queden chips de categoría), para poder apagarlo desde acá. */}
            {datosPortada.chips.length > 0 || categoria !== null || gratis ? (
              <ChipsCategorias
                categorias={datosPortada.chips}
                seleccionada={categoria}
                onCambiar={cambiarCategoria}
                gratis={{ activo: gratis, onCambiar: cambiarGratis }}
              />
            ) : null}
            <View style={datosPortada.chips.length > 0 || categoria !== null || gratis ? estilos.pillsBajoChips : null}>
              <PillsAtajos atajo={atajo} onCambiar={cambiarAtajo} />
            </View>
          </View>

          {estado.desdeCache ? <AvisoSinConexion guardadoEn={estado.desdeCache.guardadoEn} /> : null}

          {categoria === null && !gratis && datosPortada.carrusel.length > 0 ? <Hero eventos={datosPortada.carrusel} /> : null}

          {categoria === null && !gratis ? <InvitacionAvisos /> : null}

          {categoria !== null || gratis ? (
            <View style={estilos.bloqueCategoria}>
              <Texto peso="bold" accessibilityRole="header" style={estilos.tituloCategoria}>
                {/* R67, 67-r1: las películas no se filtran por fecha, así que
                    con "Cine" el título dice "En cartel" y no el atajo.
                    A2 (nube Q1): con "Gratis", "Gratis · Hoy" o "Música gratis ·
                    Finde" (con "Cine" también va la fecha: no hay películas). */}
                {gratis ? (
                  tituloGratis(categoria === null ? null : nombreCategoria, atajo)
                ) : (
                  <>
                    {nombreCategoria} · {categoria === 'cine' ? 'En cartel' : ETIQUETA_ATAJO[atajo]}
                  </>
                )}
              </Texto>
              {/* El vacío del modo categoría va primero; el de "Gratis" (A2),
                  en la rama siguiente. */}
              {datosPortada.eventosCategoria.length === 0 && categoria !== null && !gratis ? (
                <View style={[estilos.vacioHoy, estilos.vacioCategoria, { backgroundColor: colores.card, borderColor: colores.border }]}>
                  <Texto tono="secundario">
                    No hay eventos de {nombreCategoria} para {FRASE_ATAJO[atajo]}.
                  </Texto>
                  <Pressable
                    onPress={() => {
                      // Igual que "Ver todos" de su fila: el cine va a Cines.
                      if (categoria === 'cine') router.push('/cines')
                      // `v`: nonce para que Buscar vuelva a aplicar los
                      // parámetros aunque sean iguales a los de la vez anterior.
                      else router.push(`/buscar?categoria=${encodeURIComponent(categoria)}&v=${Date.now()}`)
                    }}
                    accessibilityRole="button"
                    style={[estilos.vacioHoyBoton, estilos.botonVacio, { backgroundColor: colores.primary }]}
                  >
                    <Texto peso="bold" style={{ color: colores.primaryForeground }}>
                      {categoria === 'cine' ? 'Ver cartelera' : `Ver ${nombreCategoria} en todas las fechas`}
                    </Texto>
                  </Pressable>
                  <Pressable
                    onPress={() => cambiarCategoria(null)}
                    accessibilityRole="button"
                    style={[estilos.vacioHoyBoton, estilos.botonVacio, { borderWidth: 1, borderColor: colores.border }]}
                  >
                    <Texto peso="bold">Todas las categorías</Texto>
                  </Pressable>
                </View>
              ) : datosPortada.eventosCategoria.length === 0 ? (
                <VacioGratis
                  texto={textoVacioGratis(categoria, nombreCategoria, atajo)}
                  segunda={segundaSalidaVacioGratis(categoria, atajo)}
                  onVerTodosLosPrecios={() => cambiarGratis(false)}
                  onTodasLasCategorias={() => cambiarCategoria(null)}
                  onEstaSemana={() => cambiarAtajo('semana')}
                  bordeSecundario={bordeInactivo}
                />
              ) : (
                <>
                  <Texto tono="secundario" accessibilityLiveRegion="polite">
                    {conteoCategoria(datosPortada.peliculasCategoria.length, datosPortada.eventosSinPelicula.length)}
                  </Texto>
                  {/* (el primer anuncio lo hace el efecto de `textoConteo`) */}
                  {/* R67, 67-c: el scroll no salta al abrir el acordeón de la
                      película 2 o 3 porque las tarjetas cuelgan de este mismo
                      `ScrollView` con `key` estables (`pelicula.id`), la lista
                      sale del `useMemo` de `datosPortada` (misma referencia
                      entre renders, no se recalcula acá) y el cine abierto es
                      estado de cada `TarjetaPelicula`: abrir uno solo vuelve
                      a dibujar esa tarjeta, ni se remonta ni se mueve otra. */}
                  {datosPortada.peliculasCategoria.map((pelicula) => (
                    <TarjetaPelicula key={pelicula.id} pelicula={pelicula} compacta />
                  ))}
                  {enFilasDeDos(datosPortada.eventosSinPelicula).map((fila) => (
                  <View key={fila[0].id} style={estilos.filaGrilla}>
                    {fila.map((evento) => (
                      <View key={evento.id} style={estilos.celda}>
                        <TarjetaEvento evento={evento} />
                      </View>
                    ))}
                  </View>
                  ))}
                </>
              )}
            </View>
          ) : null}

          {secciones.map((seccion) => {
            if (seccion.tipo === 'hoy') {
              if (seccion.eventos.length > 0) {
                return (
                  <FilaCategoria
                    key="hoy-en-salta"
                    categoria="hoy"
                    titulo="Hoy en Salta"
                    eventos={seccion.eventos}
                    alVerTodos={() => cambiarAtajo('hoy')}
                  />
                )
              }

              return (
                <View key="hoy-en-salta-vacio" style={[estilos.vacioHoy, { backgroundColor: colores.card, borderColor: colores.border }]}>
                  <View style={estilos.vacioHoyTexto}>
                    <Texto peso="bold" style={estilos.vacioHoyTitulo}>
                      Hoy en Salta
                    </Texto>
                    <Texto tono="secundario">
                      Hoy no hay eventos cargados. Mirá qué viene en los próximos días.
                    </Texto>
                  </View>
                  <Pressable
                    onPress={() => cambiarAtajo('semana')}
                    accessibilityRole="button"
                    style={[estilos.vacioHoyBoton, { backgroundColor: colores.primary }]}
                  >
                    <Texto peso="bold" style={{ color: colores.primaryForeground }}>
                      Ver esta semana
                    </Texto>
                  </Pressable>
                </View>
              )
            }

            if (seccion.tipo === 'categoria') {
              const { category: catSlug, title, events } = seccion.fila
              return (
                <FilaCategoria
                  key={catSlug}
                  categoria={catSlug}
                  titulo={title}
                  eventos={events}
                  alVerTodos={() => {
                    // "Ver todos" del cine va a la pantalla Cines aparte
                    // (Mauro la quiere así); el resto, a Buscar con la
                    // categoría filtrada (coordinación con 29-j: el mismo
                    // nombre de parámetro, `categoria`, con el slug).
                    if (catSlug === 'cine') {
                      router.push('/cines')
                    } else {
                      router.push(
                        `/buscar?categoria=${encodeURIComponent(catSlug)}&atajo=${encodeURIComponent(atajo)}&v=${Date.now()}`
                      )
                    }
                  }}
                />
              )
            }

            if (seccion.tipo === 'banner-radar') return <BannerRadar key="banner-radar" />

            return <BannerAnuncio key="anuncio" lugar="inicio" sinConexion={estado.desdeCache !== null} />
          })}
        </ScrollView>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  scroll: { paddingBottom: 24 },
  // R67, 67-b: cabecera fija. ≈113 dp con chips: 8 de aire + 60 de chips (con su
  // padding) + 56 de pills − 12 (`pillsBajoChips`, que descuenta el padding
  // superior de las pills) + 1 del borde inferior (R67, 67-r1, para que se
  // distinga del contenido que pasa por debajo). Sin chips: ≈65 dp.
  cabecera: { paddingTop: 8, borderBottomWidth: 1 },
  pillsBajoChips: { marginTop: -12 },
  vacioHoy: {
    marginHorizontal: 16,
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  vacioHoyTexto: { gap: 4 },
  vacioHoyTitulo: { fontSize: 20 },
  bloqueCategoria: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  tituloCategoria: { fontSize: 20 },
  filaGrilla: { flexDirection: 'row', gap: 12 },
  // Evita que la última celda de un número impar se estire a todo el ancho.
  celda: { flex: 1, maxWidth: '50%' },
  vacioHoyBoton: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  // El bloque de la categoría ya tiene su propio padding horizontal.
  vacioCategoria: { marginHorizontal: 0, marginTop: 0, gap: 12 },
  botonVacio: { minHeight: 48, justifyContent: 'center' },
})
