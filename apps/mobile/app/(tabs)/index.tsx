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
// en la hoja «Filtros» (R81, 81-a; antes, en la cabecera fija de R67, 67-b).
// Sus categorías salen de `categoriasDisponibles` (core)
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
// categorías"; con eventos, una línea "N eventos" bajo el título (desde A8, nube
// Q1, QPS-339, anunciada con `useAnunciarConteo` y sin live region).
// Sin chips que elegir no se dibuja la fila. Sin conexión: nada de esto pide
// red (todo es memoria sobre lo cargado), y `AvisoSinConexion` va debajo de la cabecera fija.
// R67, 67-c: con el chip "Cine", las películas se dibujan como la cartelera de
// `app/cines.tsx` (`components/TarjetaPelicula.tsx`, a ancho completo y con su
// acordeón por cine), no como tarjetas de evento en 2 columnas; los eventos
// reales de la categoría cine, si hay, van en la grilla debajo.
//
// R67, 67-b: orden nuevo de la portada: cabecera fija (`stickyHeaderIndices={[0]}`,
// fondo opaco) → aviso sin conexión → Hero (solo con "Todas") → resto, igual
// que antes. Cambiar de filtro o de pill vuelve el scroll arriba (`scrollTo` en
// el handler, no en un efecto).
//
// R81, 81-a: la cabecera fija es UNA sola fila: el botón «Filtros»
// (`components/HojaFiltros.tsx`, con el contador de activos: «Filtros · 2») y a
// su lado las pills de fecha, con scroll horizontal si no entran; con filtros
// activos, después de las pills, un chip removible por filtro (✕, «Quitar
// Gratis»), en el mismo scroll. «Filtros» abre una hoja inferior (`Modal`) con
// «Gratis», «Para chicos» y las categorías en grilla, más «Ver N eventos»
// (cierra) y «Limpiar» (apaga los tres filtros, no la fecha). Los filtros se
// aplican al tocar, con los mismos `cambiarGratis`, `cambiarParaChicos` y
// `cambiarCategoria`; con la hoja abierta no se anuncia cada toque (el hook
// `useAnunciarConteo` recibe `hojaAbierta` como `pausado`): al cerrarla se
// anuncia el resultado una sola vez. La lógica pura está en `lib/portada-filtros.ts`. Buscar no cambió.
//
// A2 (nube Q1): chip "Gratis" (`components/ChipGratis.tsx`), hoy dentro de la
// hoja «Filtros» (antes, adelante de "Todas" en la fila de chips y, desde la
// ronda de correcciones de A3, en una fila propia). Es un interruptor aparte de la
// categoría y de la fecha: los tres se combinan con `filtrarCombinado` (core,
// `soloGratis` = `price === 'gratis'`, o sea `is_free = true`), a través de
// `eventosDeLaGrilla` (`lib/portada-gratis.ts`, donde está la lógica pura y
// sus reglas). Con "Gratis" apagado la portada queda exactamente como antes.
// Prendido, la portada pasa al modo grilla (como con una categoría): título
// "Gratis · Hoy" o "Música gratis · Finde" (`tituloGratis`), la misma línea
// "N eventos" con su anuncio, y la grilla de 2 columnas; sin
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
// Ronda de correcciones de A2: "categoría o Gratis" sale siempre de
// `enModoGrilla` (`modoGrilla`); el anuncio para lectores de pantalla es el
// conteo si hay resultados o el texto del vacío si no (`anuncioDeLaGrilla`);
// los botones secundarios de los dos vacíos usan `bordeChipInactivo` (3:1).
//
// A3 (nube Q1): chip "Para chicos" (`components/ChipParaChicos.tsx`), después
// de "Gratis" en la hoja «Filtros» (R81, 81-a). Otro
// interruptor aparte, que se combina con fecha, categoría y "Gratis" a la vez
// (los dos prendidos = eventos gratis Y para chicos). `filtrarCombinado` no
// sabe de público: `eventosDeLaGrilla` filtra los items por `paraChicos`
// antes (`lib/para-chicos.ts`, donde está la regla y el caso de la caché
// vieja). Prendido pasa al modo grilla como "Gratis": título "Para chicos ·
// Finde", "Música para chicos · Hoy" o "Gratis para chicos · Hoy"
// (`tituloParaChicos`, `lib/portada-para-chicos.ts`), la misma línea "N
// eventos" y el mismo anuncio (`anuncioDeLaGrilla`). Los chips de categoría
// salen de lo que queda (`eventosDeLosChips` + `chipsDeLaPortada`). Las
// películas no son para chicos (su categoría es `cine`): con "Cine" quedan
// afuera y el vacío lo explica. El vacío (`VacioParaChicos`) dice por qué
// está vacío y ofrece "Ver todas las edades" (apaga "Para chicos") y una
// segunda salida (`salidasVacioParaChicos`). Cambiarlo vuelve el scroll
// arriba (`cambiarParaChicos`).
//
// Ronda de correcciones de A3: con Infantil elegida, el vacío no ofrece "Ver
// todas las edades" (no cambiaría nada): ver `salidasVacioParaChicos`. (Que
// "Gratis" y "Para chicos" salgan de la fila con scroll de las categorías, para
// que "Todas" no quedara cortada a 360 dp, lo resuelve ahora la hoja «Filtros».)
//
// A8 (nube Q1, QPS-339): el conteo y los vacíos de la grilla se anuncian a
// mano en Android y en iOS (`useAnunciarConteo`, `lib/anunciar-conteo-hook.ts`;
// la decisión pura de qué y cuándo, en `lib/anunciar-conteo.ts`), y esos nodos
// ya no son live regions: un solo anuncio por cambio. Se anuncia la entrada al
// modo grilla y cada cambio de filtro (conteo + título, aunque el número sea el
// mismo: "3 eventos, Música gratis, Hoy"), y la salida ("Sin filtros: todos
// los eventos de hoy"). El título de la grilla es un solo string
// (`tituloGrilla`) que usan el encabezado y el anuncio. Ronda de correcciones
// de A8: la prohibición de live regions es por nodo (el conteo y los tres
// vacíos), no por archivo: otras (p. ej. `AvisoSinConexion`) siguen.
//
// Lo que no se copia, a propósito (ops/paridad-web-app.md, inventario
// "Portada" y la tarea 29-h): "Más filtros" (lugar/zona) y el switch
// "Mostrar flyers de redes" — ninguno de los dos tiene un equivalente de
// ronda en la app todavía.
//
// A6 (nube Q1) · Vacíos y sin conexión. (1) Un error de carga distingue "no
// hay conexión y todavía no hay nada guardado" de un error del servidor
// (`mensajeErrorCarga`, `lib/vacios.ts`: `cargarAgendaConCache` ahora trae
// `sinConexion` en la rama de error). (2) El vacío de "Hoy en Salta" es
// honesto con la pill elegida (`vacioHoyEnSalta`): con "Finde" o "Semana" ya
// no dice "Hoy no hay eventos cargados" a secas habiendo eventos más abajo, y
// su acción nunca es la pill en la que ya se está; la caja (`vacioHoy`) no se
// achica — la regla (a) del anuncio cuenta con su alto (docstring de
// `seccionesPortada`). (3) Con lo guardado a la vista, "Reintentar" está al
// lado del aviso (`AvisoSinConexion`), y un refresco que vuelve a caer en lo
// guardado avisa "Seguimos sin conexión"; un refresco que falla con datos ya
// en pantalla los CONSERVA y avisa que no se pudo actualizar
// (`decidirRefresco`). Los anuncios van en el mismo handler del refresco,
// nunca en un efecto. Nada de toasts: todo es banda dentro del scroll.
//
// Integración (R76) de A6 con A2, A3 y A8:
//   - Los avisos de A6 (sin conexión, refresco, reintento) pasan por `anunciar`
//     (`lib/anunciar.ts`), no por `AccessibilityInfo`.
//   - El efecto de A6 que anunciaba el conteo de la categoría
//     (`textoConteo`/`conteoVisible`, con `Platform`) se descartó: el conteo y
//     los vacíos de la grilla los anuncia SOLO `useAnunciarConteo` (A8), que
//     además cubre "Gratis" y "Para chicos". Anunciar los dos era leerlo dos
//     veces.
//   - El texto del vacío del modo categoría es el de A6 (`textoVacioCategoria`
//     de `lib/vacios.ts`, con el porqué sin conexión y la cartelera); `textoVacio`
//     lo usa tanto el nodo visible como el anuncio de A8, así que lo que se ve
//     y lo que se oye siguen siendo lo mismo. El vacío de "Gratis" y el de "Para
//     chicos" (A2/A3) no cambian.
//
// AdSense SÍ tiene equivalente ahora (R60, 52-d: AdMob en la app, fase 2 de
// la R52): el banner (`components/BannerAnuncio.tsx`) va en esta pantalla
// (después de la 4.ª fila de categorías, ver `seccionesPortada`) y en
// Buscar — nunca arriba del pliegue (regla (a) de Mauro, 19/10: ningún
// anuncio arriba del pliegue) y nunca en la ficha de un evento ni en el Hero
// de esta misma pantalla. El detector que lo exige está en
// `tests/anuncios-lugares.test.ts`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { formatDateInSalta, transformMovie } from '@qps/core/home/transform'
import { selectCarouselEvents, sortCategories } from '@qps/core/home/carousel'
import { groupByCategory, selectTodayRow, type CategoryEventsRow } from '@qps/core/home/filters'
import { eventoEnAtajo, type Atajo } from '@qps/core/home/atajos'
import type { DisplayEvent } from '@qps/core/home/types'
import type { Category } from '@qps/core/types'
import { AvisoNoSeActualizo, AvisoSinConexion } from '@/components/AvisoSinConexion'
import { BannerAnuncio } from '@/components/BannerAnuncio'
import { BannerRadar } from '@/components/BannerRadar'
import { EsqueletoPortada } from '@/components/Esqueleto'
import { ErrorCarga } from '@/components/EstadoCarga'
import { FilaCategoria } from '@/components/FilaCategoria'
import { Hero } from '@/components/Hero'
import { BotonFiltros, ChipsRemovibles, HojaFiltros } from '@/components/HojaFiltros'
import { InvitacionAvisos } from '@/components/InvitacionAvisos'
import { PillsAtajos } from '@/components/PillsAtajos'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { TarjetaPelicula } from '@/components/TarjetaPelicula'
import { Texto } from '@/components/Texto'
import { anunciar } from '@/lib/anunciar'
import { estadoAnunciablePortada } from '@/lib/anunciar-conteo'
import { useAnunciarConteo } from '@/lib/anunciar-conteo-hook'
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
import type { ItemConPublico } from '@/lib/para-chicos'
import {
  anuncioDeLaGrilla,
  chipsDeLaPortada,
  enModoGrilla,
  ETIQUETA_ATAJO,
  eventosDeLaGrilla,
  eventosDeLosChips,
  segundaSalidaVacioGratis,
  textoVacioGratis,
  tituloGratis,
  type SegundaSalidaGratis,
} from '@/lib/portada-gratis'
import {
  salidasVacioParaChicos,
  textoVacioParaChicos,
  tituloParaChicos,
  type SalidaParaChicos,
} from '@/lib/portada-para-chicos'
import { contarFiltrosActivos, type ClaveFiltro } from '@/lib/portada-filtros'
import { TITULO_SIN_CONEXION } from '@/lib/sin-conexion/aviso'
import {
  anuncioDeReintento,
  decidirRefresco,
  mensajeErrorCarga,
  textoVacioCategoria,
  vacioHoyEnSalta,
  type DestinoInicio,
} from '@/lib/vacios'

type EstadoPortada =
  | { tipo: 'cargando' }
  // A6: `error` ya es el texto para la pantalla (`mensajeErrorCarga`), y
  // `sinConexion` queda para `decidirRefresco`.
  | { tipo: 'error'; error: string; sinConexion?: boolean }
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
 * R67, 67-b: las pills dejaron de ir después del Hero: ahora están en una
 * cabecera fija arriba de todo. Con las tres filas de A3 (Gratis + Para
 * chicos, chips de categoría, pills) medía ≈173 dp con chips y ≈113 dp sin
 * ellos.
 *
 * R81, 81-a: la cabecera es UNA fila (el botón «Filtros» + las pills de fecha +
 * los chips removibles de los filtros activos): ≈69 dp (44 de pill + 12 de aire
 * arriba y 12 abajo + 1 del borde), con o sin filtros. Con ese valor el banner
 * arrancaría a ~257 dp con 0 filas y a ~583 dp con 1 (69 + 188 + 326), todavía
 * dentro de los ~649 dp sin scrollear, igual que antes: la caja vacía y las
 * filas empujan el anuncio arriba de los 900 dp recién con 2 o más. Una
 * cabecera más baja no mueve la regla (el umbral lo fija el contenido real, no
 * la cabecera), y devuelve área útil al scrollear (~580 dp, contra ~476 dp).
 * La regla y el umbral (`FILAS_MINIMAS_PARA_ANUNCIO = 2`) siguen valiendo sin
 * cambios.
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
// Q1): los usan también el título y el vacío de "Gratis". La frase para el
// vacío del modo categoría vive desde A6 en `textoVacioCategoria`
// (`lib/vacios.ts`).

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
 * vacío del modo categoría: principal relleno de `primary`, secundario con
 * contorno `bordeChipInactivo` (3:1; los dos vacíos lo usan desde la ronda de
 * correcciones de A2). Su texto se anuncia como el conteo (A8, nube Q1,
 * QPS-339: con `useAnunciarConteo` en `Inicio`, ya no como live region).
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
      <Texto tono="secundario">
        {texto}
      </Texto>
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

/**
 * Vacío del modo "Para chicos" (A3, nube Q1): dice por qué está vacío
 * (`textoVacioParaChicos`) y ofrece las salidas de `salidasVacioParaChicos`:
 * la principal (rellena), casi siempre "Ver todas las edades" (apaga "Para
 * chicos" y deja fecha, categoría y "Gratis"), y una segunda que lo deja
 * prendido. Con Infantil (ronda de correcciones de A3) no hay "Ver todas las
 * edades": la principal es la fecha, los precios o la categoría. Misma caja,
 * mismos botones y mismo anuncio que `VacioGratis`. Con "Gratis" y "Para
 * chicos" prendidos, el vacío es este.
 */
function VacioParaChicos({
  texto,
  principal,
  segunda,
  onTodasLasEdades,
  onTodasLasCategorias,
  onEstaSemana,
  onTodosLosPrecios,
  bordeSecundario,
}: {
  texto: string
  principal: SalidaParaChicos
  segunda: SalidaParaChicos | null
  onTodasLasEdades: () => void
  onTodasLasCategorias: () => void
  onEstaSemana: () => void
  onTodosLosPrecios: () => void
  bordeSecundario: string
}) {
  const colores = useColoresQPS()
  // Cada tipo de salida, a su handler (las dos salidas pasan por acá).
  const alTocar = (salida: SalidaParaChicos) =>
    salida.tipo === 'todas-las-edades'
      ? onTodasLasEdades
      : salida.tipo === 'todas-las-categorias'
        ? onTodasLasCategorias
        : salida.tipo === 'esta-semana'
          ? onEstaSemana
          : onTodosLosPrecios
  return (
    <View style={[estilos.vacioHoy, estilos.vacioCategoria, { backgroundColor: colores.card, borderColor: colores.border }]}>
      <Texto tono="secundario">
        {texto}
      </Texto>
      <Pressable
        onPress={alTocar(principal)}
        accessibilityRole="button"
        style={[estilos.vacioHoyBoton, estilos.botonVacio, { backgroundColor: colores.primary }]}
      >
        <Texto peso="bold" style={{ color: colores.primaryForeground }}>
          {principal.texto}
        </Texto>
      </Pressable>
      {segunda !== null ? (
        <Pressable
          onPress={alTocar(segunda)}
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
  // A2 (nube Q1): borde del botón secundario de los dos vacíos (categoría y
  // "Gratis") a 3:1; antes el de categoría usaba `colores.border` (~1,2:1).
  const bordeInactivo = bordeChipInactivo(colores)
  const router = useRouter()
  const [atajo, setAtajo] = useState<Atajo>('hoy')
  const [categoria, setCategoria] = useState<string | null>(null)
  // A2 (nube Q1): el chip "Gratis" (prendido/apagado), aparte de la categoría.
  const [gratis, setGratis] = useState(false)
  // A3 (nube Q1): el chip "Para chicos" (prendido/apagado), aparte de los otros dos.
  const [paraChicos, setParaChicos] = useState(false)
  // Modo grilla (título + "N eventos" + 2 columnas): con categoría, "Gratis" o "Para chicos".
  const modoGrilla = enModoGrilla({ categoria, gratis, paraChicos })
  const [estado, setEstado] = useState<EstadoPortada>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, lo
  // que ya está armado sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  // R81, 81-a: la hoja de filtros (abierta/cerrada) y el botón «Filtros», para
  // devolverle el foco al cerrarla.
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const botonFiltrosRef = useRef<View>(null)

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

    if (resultado.tipo === 'error') {
      return { tipo: 'error', error: mensajeErrorCarga('inicio', resultado), sinConexion: resultado.sinConexion }
    }

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
      if (cancelado) return
      setEstado(resultado)
      // A6: el aviso de sin conexión es live region, pero Android no anuncia
      // una live region al montarse (R69, 69-b) e iOS las ignora: se anuncia
      // acá, en el callback de la carga (no es `setState`). Y si fue un
      // "Reintentar" de `ErrorCarga` (`intento > 0`) que volvió a dar error,
      // se anuncia el error: si no, parecía que el botón no hizo nada.
      if (resultado.tipo === 'ok' && resultado.desdeCache) anunciar(TITULO_SIN_CONEXION)
      const avisoError = anuncioDeReintento(intento > 0, resultado)
      if (avisoError) anunciar(avisoError)
    })

    return () => {
      cancelado = true
    }
  }, [cargarDatos, intento])

  // A6: lo que pasó con el último refresco ("Seguimos sin conexión...", "No
  // pudimos actualizar..."), para la banda de arriba; `null` si no hay nada
  // que decir. Se limpia con cada carga nueva.
  const [notaRefresco, setNotaRefresco] = useState<string | null>(null)

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setNotaRefresco(null)
    setIntento((valor) => valor + 1)
  }, [])

  // A6: `decidirRefresco` (lib/vacios.ts) mira lo que había en pantalla al
  // empezar (`estado`, por eso está en las dependencias) y lo que trajo el
  // refresco: un error con datos a la vista los conserva, y volver a caer en
  // lo guardado se avisa. También es el "Reintentar" del aviso.
  const refrescar = useCallback(async () => {
    setRefrescando(true)
    const decision = decidirRefresco(estado, await cargarDatos(), notaRefresco)
    setEstado(decision.estado)
    setNotaRefresco(decision.nota)
    const aviso = decision.anuncio
    if (aviso) anunciar(aviso)
    setRefrescando(false)
  }, [cargarDatos, estado, notaRefresco])

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

    // Los eventos (con su `paraAtajo` y su `paraChicos`) más las películas
    // (`paraAtajo: null`, sin `paraChicos`: no son para chicos, A3).
    const items: ItemConPublico[] = [
      ...estado.eventos,
      ...peliculasComoEventos.map((evento) => ({ evento, paraAtajo: null })),
    ]

    // R66, 66-a: chips y modo "categoría elegida", sobre lo mismo ya cargado.
    // A2 (nube Q1): con "Gratis", los chips salen solo de los eventos gratis
    // (sin "Gratis", la misma `categoriasDisponibles` de siempre).
    // A3 (nube Q1): con "Para chicos", solo de los eventos para chicos de la
    // fecha (`eventosDeLosChips`; sin "Para chicos" son los mismos que
    // `todosLosEventos`).
    const chips = chipsDeLaPortada(eventosDeLosChips(items, { atajo, paraChicos }, ahora), estado.categorias, categoria, gratis)
    let eventosCategoria: DisplayEvent[] = []
    let nombreCategoria = ''
    // R67, 67-c: con "Cine", las películas (`isCinemaMovie`, id `movie-<uuid>`)
    // salen como `Pelicula` completas (con sus funciones) en el mismo orden que
    // `eventosCategoria`; los eventos reales de la categoría quedan aparte.
    const peliculasCategoria: Pelicula[] = []
    let eventosSinPelicula: DisplayEvent[] = []
    // A2 (nube Q1): la grilla también se arma con "Gratis" prendido y "Todas".
    // A3: y con "Para chicos".
    if (enModoGrilla({ categoria, gratis, paraChicos })) {
      // `filtrarCombinado` (core) con atajo + categoría + gratis (A2), con los
      // items filtrados antes por "Para chicos" (A3).
      eventosCategoria = eventosDeLaGrilla(items, { atajo, categoria, gratis, paraChicos }, ahora)
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

    // A6: si la pill elegida tiene eventos (aunque no sean de hoy), para el
    // vacío de "Hoy en Salta" (`vacioHoyEnSalta`): las películas no cuentan,
    // se suman siempre.
    //
    // Ojo (ronda de correcciones): "Hoy en Salta" es `date === hoy` y la
    // ventana de "Esta noche" llega hasta las 05:59, así que con esa pill
    // un boliche a las 00:30 está en las filas pero no en "Hoy en Salta":
    // por eso el vacío mira esto y no `hoyEventos`. `hayEventosEnFinde`,
    // para no ofrecer "Ver el finde" desde "Semana" con el finde vacío.
    const hayEventosEnAtajo = eventosDelAtajo.length > 0
    const hayEventosEnFinde = estado.eventos.some((item) => eventoEnAtajo(item.paraAtajo, 'finde', ahora))

    return {
      // R81, 81-a: el «N» de «Ver N eventos» de la hoja de filtros sin filtros
      // (con filtros es `eventosCategoria.length`): los eventos de la fecha.
      cantidadFecha: todosLosEventos.length,
      carrusel,
      filas,
      hoyEventos,
      chips,
      eventosCategoria,
      peliculasCategoria,
      eventosSinPelicula,
      nombreCategoria,
      hayEventosEnAtajo,
      hayEventosEnFinde,
    }
  }, [estado, atajo, categoria, gratis, paraChicos])

  // Con una categoría elegida (R66) o con "Gratis" prendido (A2) no hay
  // secciones: ni "Hoy en Salta", ni filas, ni banners — el cuerpo es la
  // grilla de más abajo.
  const nombreCategoria = datosPortada?.nombreCategoria ?? ''
  const secciones = useMemo(
    () => (datosPortada && !modoGrilla ? seccionesPortada(datosPortada.filas, datosPortada.hoyEventos) : []),
    [datosPortada, modoGrilla]
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
  // A3 (nube Q1): lo mismo con "Para chicos" (también desde "Ver para todas
  // las edades" del vacío).
  const cambiarParaChicos = useCallback((nuevo: boolean) => {
    setParaChicos(nuevo)
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [])

  // R81, 81-a: «Limpiar» de la hoja (apaga Gratis, Para chicos y la categoría;
  // la fecha no se toca) y la ✕ de los chips removibles: los mismos cambiadores.
  const limpiarFiltros = useCallback(() => {
    cambiarGratis(false)
    cambiarParaChicos(false)
    cambiarCategoria(null)
  }, [cambiarGratis, cambiarParaChicos, cambiarCategoria])
  const quitarFiltro = useCallback(
    (clave: ClaveFiltro) => {
      if (clave === 'gratis') cambiarGratis(false)
      else if (clave === 'para-chicos') cambiarParaChicos(false)
      else cambiarCategoria(null)
    },
    [cambiarGratis, cambiarParaChicos, cambiarCategoria]
  )
  const cerrarHoja = useCallback(() => setHojaAbierta(false), [])

  // A6: la acción del vacío de "Hoy en Salta" (`vacioHoyEnSalta`): otra pill,
  // o Buscar sin fecha (`v`: el mismo nonce de "Ver todos", para que Buscar
  // vuelva a aplicar los parámetros aunque sean los de la vez anterior).
  const irADestino = useCallback(
    (destino: DestinoInicio) => {
      if (destino.tipo === 'atajo') cambiarAtajo(destino.atajo)
      else router.push(`/buscar?v=${Date.now()}`)
    },
    [cambiarAtajo, router]
  )

  // A6: `null` es el vacío de siempre (pill "Hoy", con conexión): el texto
  // literal de la web, más abajo.
  const vacioHoy =
    estado.tipo === 'ok' && datosPortada
      ? vacioHoyEnSalta({
          atajo,
          hayEventosEnAtajo: datosPortada.hayEventosEnAtajo,
          hayEventosEnFinde: datosPortada.hayEventosEnFinde,
          desdeCache: estado.desdeCache !== null,
        })
      : null

  // R69, 69-b (QPS-354): el conteo se anunciaba con `announceForAccessibility`
  // solo al aparecer (o al cambiar de nodo: conteo ↔ vacío) y, en Android, los
  // cambios siguientes quedaban a cargo de `accessibilityLiveRegion`.
  // A2 (nube Q1): el modo "Gratis" usa la misma línea y el mismo anuncio.
  // Ronda de correcciones: lo que se anuncia es el conteo si hay resultados o
  // el texto del vacío si no (`anuncioDeLaGrilla`): antes, con "Gratis" y sin
  // resultados, no se oía nada.
  // A3 (nube Q1): con "Para chicos", su vacío (también con "Gratis" prendido).
  // A8 (nube Q1, QPS-339): se anuncia SIEMPRE a mano, en Android y en iOS, con
  // `useAnunciarConteo` (reglas en `lib/anunciar-conteo.ts`), y el conteo y
  // los tres vacíos ya no son live regions (para no leer dos veces). Así se
  // anuncia también un cambio de filtro con el mismo número ("3 eventos,
  // Música gratis, Hoy" después de "3 eventos, Música, Hoy"), con el título de
  // la grilla para desambiguar, y la salida del modo grilla ("Sin filtros:
  // todos los eventos de hoy": apagar el último filtro, "Todas las categorías",
  // "Ver todos los precios" o "Ver todas las edades" que vuelven a la portada
  // normal). El montaje no se anuncia (la portada arranca sin filtros). En
  // Android lo que viene de un toque espera 400 ms (ver el hook).
  // A6 (integración R76): el vacío del modo categoría es el de `lib/vacios.ts`
  // (con el porqué sin conexión); el mismo texto se ve y se anuncia.
  const textoVacio = paraChicos
    ? textoVacioParaChicos(categoria, nombreCategoria, atajo, gratis)
    : gratis
      ? textoVacioGratis(categoria, nombreCategoria, atajo)
      : textoVacioCategoria({
          nombre: nombreCategoria,
          atajo,
          esCine: categoria === 'cine',
          desdeCache: estado.tipo === 'ok' && estado.desdeCache !== null,
        })
  const anuncio = datosPortada
    ? anuncioDeLaGrilla({
        modoGrilla,
        gratis,
        paraChicos,
        cantidad: datosPortada.eventosCategoria.length,
        textoConteo: conteoCategoria(datosPortada.peliculasCategoria.length, datosPortada.eventosSinPelicula.length),
        textoVacio,
      })
    : null
  // El título de la grilla (A8: un solo string, para el encabezado y para el
  // anuncio). R67, 67-r1: las películas no se filtran por fecha, así que con
  // "Cine" dice "En cartel" y no el atajo. A2 (nube Q1): con "Gratis", "Gratis
  // · Hoy" o "Música gratis · Finde" (con "Cine" también va la fecha: no hay
  // películas). A3 (nube Q1): con "Para chicos", "Para chicos · Finde",
  // "Música para chicos · Hoy" o "Gratis para chicos · Hoy".
  const tituloGrilla = paraChicos
    ? tituloParaChicos(categoria === null ? null : nombreCategoria, categoria, atajo, gratis)
    : gratis
      ? tituloGratis(categoria === null ? null : nombreCategoria, atajo)
      : `${nombreCategoria} · ${categoria === 'cine' ? 'En cartel' : ETIQUETA_ATAJO[atajo]}`
  // R81, 81-a: con la hoja de filtros abierta no se anuncia cada toque
  // (`pausado`); al cerrarla se anuncia el resultado una sola vez.
  useAnunciarConteo(datosPortada ? estadoAnunciablePortada({ atajo, categoria, gratis, paraChicos, tituloGrilla, anuncio }) : null, hojaAbierta)

  if (cargandoBienvenida) return null
  if (!vista) return <Redirect href="/bienvenida" />

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      {/* A1 (nube Q1): en la carga inicial (y con "Reintentar"), el esqueleto
          con la forma de la portada en vez de `Cargando`. El pull-to-refresh
          no pasa por acá: sigue mostrando lo que había (`refrescando`). */}
      {estado.tipo === 'cargando' ? <EsqueletoPortada /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' && datosPortada ? (
        <>
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
              vea por detrás.
              R81, 81-a: UNA sola fila: el botón «Filtros» (abre la hoja con
              Gratis, Para chicos y las categorías) y, a su lado, las pills de
              fecha, con scroll horizontal si no entran. Con filtros activos, a
              continuación de las pills, sus chips removibles (en el mismo
              scroll: nunca una segunda fila). */}
          <View style={[estilos.cabecera, { backgroundColor: colores.background, borderBottomColor: colores.border }]}>
            <View style={estilos.filaCabecera}>
              <View style={estilos.botonFiltros}>
                <BotonFiltros
                  botonRef={botonFiltrosRef}
                  activos={contarFiltrosActivos({ gratis, paraChicos, categoria })}
                  onPress={() => setHojaAbierta(true)}
                />
              </View>
              <View style={estilos.pillsYChips}>
                <PillsAtajos
                  atajo={atajo}
                  onCambiar={cambiarAtajo}
                  sinAireIzquierdo
                  despues={
                    <ChipsRemovibles filtros={{ gratis, paraChicos, categoria }} nombreCategoria={nombreCategoria} onQuitar={quitarFiltro} />
                  }
                />
              </View>
            </View>
          </View>

          {/* A6: "Reintentar" al lado del aviso (es `refrescar`: lo que se ve
              no se va mientras se reintenta) y la nota del último refresco. */}
          {estado.desdeCache ? <AvisoSinConexion guardadoEn={estado.desdeCache.guardadoEn} onReintentar={refrescar} reintentando={refrescando} nota={notaRefresco} /> : null}

          {/* A6: un refresco que falló con una carga fresca a la vista: se
              conserva lo que se ve y se avisa. */}
          {estado.desdeCache === null && notaRefresco ? (
            <AvisoNoSeActualizo texto={notaRefresco} onReintentar={refrescar} reintentando={refrescando} />
          ) : null}

          {!modoGrilla && datosPortada.carrusel.length > 0 ? <Hero eventos={datosPortada.carrusel} /> : null}

          {!modoGrilla ? <InvitacionAvisos /> : null}

          {modoGrilla ? (
            <View style={estilos.bloqueCategoria}>
              <Texto peso="bold" accessibilityRole="header" style={estilos.tituloCategoria}>
                {/* El mismo string que va en el anuncio (`tituloGrilla`, A8). */}
                {tituloGrilla}
              </Texto>
              {/* El vacío del modo categoría va primero; el de "Para chicos"
                  (A3), después; el de "Gratis" (A2), en la última. */}
              {datosPortada.eventosCategoria.length === 0 && categoria !== null && !gratis && !paraChicos ? (
                <View style={[estilos.vacioHoy, estilos.vacioCategoria, { backgroundColor: colores.card, borderColor: colores.border }]}>
                  <Texto tono="secundario">
                    {textoVacio}
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
                    style={[estilos.vacioHoyBoton, estilos.botonVacio, { borderWidth: 1, borderColor: bordeInactivo }]}
                  >
                    <Texto peso="bold">Todas las categorías</Texto>
                  </Pressable>
                </View>
              ) : datosPortada.eventosCategoria.length === 0 && paraChicos ? (
                <VacioParaChicos
                  texto={textoVacio}
                  {...salidasVacioParaChicos(categoria, atajo, gratis)}
                  onTodasLasEdades={() => cambiarParaChicos(false)}
                  onTodasLasCategorias={() => cambiarCategoria(null)}
                  onEstaSemana={() => cambiarAtajo('semana')}
                  onTodosLosPrecios={() => cambiarGratis(false)}
                  bordeSecundario={bordeInactivo}
                />
              ) : datosPortada.eventosCategoria.length === 0 ? (
                <VacioGratis
                  texto={textoVacio}
                  segunda={segundaSalidaVacioGratis(categoria, atajo)}
                  onVerTodosLosPrecios={() => cambiarGratis(false)}
                  onTodasLasCategorias={() => cambiarCategoria(null)}
                  onEstaSemana={() => cambiarAtajo('semana')}
                  bordeSecundario={bordeInactivo}
                />
              ) : (
                <>
                  <Texto tono="secundario">
                    {conteoCategoria(datosPortada.peliculasCategoria.length, datosPortada.eventosSinPelicula.length)}
                  </Texto>
                  {/* A8 (nube Q1, QPS-339): sin live region; lo anuncia `useAnunciarConteo`. */}
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
                <View
                  key="hoy-en-salta-vacio"
                  style={[estilos.vacioHoy, estilos.vacioHoyAlto, { backgroundColor: colores.card, borderColor: colores.border }]}
                >
                  <View style={estilos.vacioHoyTexto}>
                    <Texto peso="bold" style={estilos.vacioHoyTitulo}>
                      Hoy en Salta
                    </Texto>
                    <Texto tono="secundario">
                      {vacioHoy ? vacioHoy.texto : 'Hoy no hay eventos cargados. Mirá qué viene en los próximos días.'}
                    </Texto>
                  </View>
                  <Pressable
                    onPress={() => (vacioHoy ? irADestino(vacioHoy.accion.destino) : cambiarAtajo('semana'))}
                    accessibilityRole="button"
                    style={[estilos.vacioHoyBoton, estilos.botonVacio, { backgroundColor: colores.primary }]}
                  >
                    <Texto peso="bold" style={{ color: colores.primaryForeground }}>
                      {vacioHoy ? vacioHoy.accion.texto : 'Ver esta semana'}
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

        {/* R81, 81-a: la hoja de «Filtros» (Modal). Los filtros se aplican al
            tocar; «Ver N eventos» solo la cierra. El «N» es el conteo de la
            grilla, o, sin filtros, los eventos de la fecha. */}
        <HojaFiltros
          visible={hojaAbierta}
          onCerrar={cerrarHoja}
          gratis={gratis}
          paraChicos={paraChicos}
          categoria={categoria}
          categorias={datosPortada.chips}
          cantidad={modoGrilla ? datosPortada.eventosCategoria.length : datosPortada.cantidadFecha}
          onCambiarGratis={cambiarGratis}
          onCambiarParaChicos={cambiarParaChicos}
          onCambiarCategoria={cambiarCategoria}
          onLimpiar={limpiarFiltros}
          botonRef={botonFiltrosRef}
        />
        </>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  scroll: { paddingBottom: 24 },
  // R67, 67-b: cabecera fija. R81, 81-a: una sola fila (botón «Filtros» + pills
  // + chips removibles): ≈69 dp = 44 de pill + 12 de aire arriba y 12 abajo (el
  // aire de `PillsAtajos`, que el resaltado también usa) + 1 del borde inferior
  // (R67, 67-r1, para que se distinga del contenido que pasa por debajo). Eran
  // ≈173 dp con las tres filas (ver `seccionesPortada`). Con la fuente al 200 %
  // el botón puede crecer un poco; las pills y los chips siguen con su scroll.
  cabecera: { borderBottomWidth: 1 },
  // La fila: el botón fijo a la izquierda y las pills (con su scroll) ocupando
  // el resto. `alignItems: 'center'` centra el botón (48) contra las pills (68).
  filaCabecera: { flexDirection: 'row', alignItems: 'center' },
  botonFiltros: { paddingLeft: 16 },
  // `minWidth: 0` deja que el scroll se achique en vez de empujar al botón.
  pillsYChips: { flex: 1, minWidth: 0 },
  vacioHoy: {
    marginHorizontal: 16,
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  // A6 (ronda de correcciones): el alto de la caja vacía de "Hoy en Salta"
  // queda fijo en el mínimo con el que cuenta la regla (a) del anuncio (~188
  // dp, docstring de `seccionesPortada`), así un texto más corto que el de la
  // web (los de `vacioHoyEnSalta`) no la achica ni sube el banner. Solo para
  // esta caja: la del modo categoría no tiene anuncio debajo.
  vacioHoyAlto: { minHeight: 188, justifyContent: 'center' },
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
