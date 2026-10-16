// Portada (R29, 29-h: ops/paridad-web-app.md §3.2 y §2 puntos 6, 7 y 9;
// paridad con `apps/web/components/home-content.tsx`). Estructura de la web:
// Hero → pills de fecha (acá, los atajos de la app, D3) → "Hoy en Salta" →
// filas por categoría (de más eventos a menos, el cine es una fila más) →
// banner del Radar después de la 2.ª fila. La Bienvenida se muestra antes de
// esto, una sola vez (lib/bienvenida.ts): mientras no se sepa si ya se vio,
// no se dibuja nada, y si no se vio, se redirige — sin cambios desde la R25.
//
// Los atajos (Hoy · Esta noche · Finde · Semana) siguen sin cambiar de
// comportamiento: un único pedido por atajo (`obtenerEventosDeAtajo`, mismo
// de siempre) sigue siendo la fuente de "todos los eventos vigentes" que
// alimenta el Hero, "Hoy en Salta" y las filas por categoría — cambiar de
// atajo re-pide y re-arma las tres cosas a la vez, en vez de filtrar un
// listado ya cargado. "Ver esta semana" (en el vacío de "Hoy en Salta") y
// "Ver todos" de "Hoy en Salta" activan atajos (`semana`/`hoy`), igual que
// la web los traduce a su filtro de fecha.
//
// Las películas en cartel (`lib/datos/cines.ts`) se cargan en paralelo y se
// suman al conjunto con `transformMovie` (`@qps/core/home/transform`,
// `category: 'cine'`): como "Cine" ya es una categoría real de `categories`,
// `groupByCategory` las ubica en su propia fila sin lógica extra acá, igual
// que en la web.
//
// Lo que no se copia, a propósito (ops/paridad-web-app.md, inventario
// "Portada" y la tarea 29-h): "Más filtros" (lugar/zona), el switch
// "Mostrar flyers de redes" y AdSense — ninguno de los tres tiene un
// equivalente de ronda en la app todavía.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { formatDateInSalta, transformMovie } from '@qps/core/home/transform'
import { selectCarouselEvents, sortCategories } from '@qps/core/home/carousel'
import { groupByCategory, selectTodayRow, type CategoryEventsRow } from '@qps/core/home/filters'
import type { Atajo } from '@qps/core/home/atajos'
import type { DisplayEvent } from '@qps/core/home/types'
import type { Category } from '@qps/core/types'
import { BannerRadar } from '@/components/BannerRadar'
import { Cargando, ErrorCarga } from '@/components/EstadoCarga'
import { FilaCategoria } from '@/components/FilaCategoria'
import { Hero } from '@/components/Hero'
import { PillsAtajos } from '@/components/PillsAtajos'
import { Texto } from '@/components/Texto'
import { useBienvenidaVista } from '@/lib/bienvenida'
import { useColoresQPS } from '@/lib/colores'
import { obtenerCines, type Pelicula } from '@/lib/datos/cines'
import { obtenerCategorias, obtenerEventosDeAtajo, type CategoriaBasica } from '@/lib/datos/eventos'

type EstadoPortada =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'ok'; eventos: DisplayEvent[]; categorias: CategoriaBasica[]; peliculas: Pelicula[] }

export type SeccionPortada =
  | { tipo: 'hoy'; eventos: DisplayEvent[] }
  | { tipo: 'categoria'; fila: CategoryEventsRow }
  | { tipo: 'banner-radar' }

/**
 * Arma la lista de secciones del cuerpo de la portada: "Hoy en Salta",
 * después cada fila de `filas` (el resultado de `groupByCategory`, en su
 * mismo orden), con el banner del Radar insertado justo después de la 2.ª
 * (índice 1) — misma posición que `apps/web/components/home-content.tsx`
 * ("Banner de Radar después de la segunda categoría"), contando sobre TODAS
 * las filas de `groupByCategory` (incluidas las que terminan sin eventos:
 * `FilaCategoria` ya no dibuja nada para esas, pero igual cuentan para la
 * posición, tal cual la web). Pura: sin React, para poder testearla sola.
 */
export function seccionesPortada(filas: CategoryEventsRow[], hoyEventos: DisplayEvent[]): SeccionPortada[] {
  const secciones: SeccionPortada[] = [{ tipo: 'hoy', eventos: hoyEventos }]

  filas.forEach((fila, indice) => {
    secciones.push({ tipo: 'categoria', fila })
    if (indice === 1) secciones.push({ tipo: 'banner-radar' })
  })

  return secciones
}

export default function Inicio() {
  const { cargando: cargandoBienvenida, vista } = useBienvenidaVista()
  const colores = useColoresQPS()
  const router = useRouter()
  const [atajo, setAtajo] = useState<Atajo>('hoy')
  const [estado, setEstado] = useState<EstadoPortada>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, lo
  // que ya está armado sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)

  const cargarDatos = useCallback(async (): Promise<EstadoPortada> => {
    const [resEventos, resCategorias, resPeliculas] = await Promise.all([
      obtenerEventosDeAtajo(atajo),
      obtenerCategorias(),
      obtenerCines(),
    ])

    if (!resEventos.ok) return { tipo: 'error', error: resEventos.error }
    if (!resCategorias.ok) return { tipo: 'error', error: resCategorias.error }
    if (!resPeliculas.ok) return { tipo: 'error', error: resPeliculas.error }

    return {
      tipo: 'ok',
      eventos: resEventos.eventos,
      categorias: resCategorias.categorias,
      peliculas: resPeliculas.peliculas,
    }
  }, [atajo])

  // Cuenta de "reintentos" (mismo patrón que `app/evento/[id].tsx` y
  // `app/pelicula/[id].tsx`, 28-l): el efecto no puede llamar, de forma
  // sincrónica, a una función que haga `setState` (lint
  // `react-hooks/set-state-in-effect`). El fetch va inline acá abajo con
  // `.then()` (el `setState` queda en el callback de la promesa, no en el
  // cuerpo sincrónico del efecto); "Reintentar" solo sube este contador.
  const [intento, setIntento] = useState(0)

  // Si `atajo` cambia con la portada ya montada, hay que volver a "cargando"
  // antes de que el efecto de abajo dispare el pedido nuevo — si no, se ven
  // los datos del atajo anterior hasta que resuelve. El ajuste va durante el
  // render, no dentro de un efecto (comparar-y-ajustar con `useState`, mismo
  // patrón que `idAnterior` en `app/evento/[id].tsx`).
  const [atajoAnterior, setAtajoAnterior] = useState(atajo)
  if (atajoAnterior !== atajo) {
    setAtajoAnterior(atajo)
    setEstado({ tipo: 'cargando' })
  }

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

    // Un único instante por carga (no `new Date()` suelto en el render):
    // mismo criterio que `serverNowISO` en
    // `apps/web/components/home-content.tsx`.
    const ahora = new Date()
    const saltaTodayStr = formatDateInSalta(ahora)
    const peliculasComoEventos = estado.peliculas.map((pelicula) => transformMovie(pelicula, saltaTodayStr))
    const todosLosEventos = [...estado.eventos, ...peliculasComoEventos]

    // `sortCategories`/`groupByCategory` (de core) solo usan `.slug` y
    // `.name` de cada categoría: `CategoriaBasica` (lib/datos/eventos.ts)
    // los tiene, aunque le falten las demás columnas del tipo `Category` de
    // core (`Tables<'categories'>` completo).
    const categorias = estado.categorias as unknown as Category[]
    const categoriasOrdenadas = sortCategories(categorias, todosLosEventos, ahora, [])
    const carrusel = selectCarouselEvents(todosLosEventos, categoriasOrdenadas, ahora)
    const filas = groupByCategory(categoriasOrdenadas, todosLosEventos, null, null, ahora)
    const hoyEventos = selectTodayRow(todosLosEventos, saltaTodayStr, ahora)

    return { carrusel, filas, hoyEventos }
  }, [estado])

  const secciones = useMemo(
    () => (datosPortada ? seccionesPortada(datosPortada.filas, datosPortada.hoyEventos) : []),
    [datosPortada]
  )

  if (cargandoBienvenida) return null
  if (!vista) return <Redirect href="/bienvenida" />

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' && datosPortada ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primary} colors={[colores.primary]} />
          }
          contentContainerStyle={estilos.scroll}
        >
          {datosPortada.carrusel.length > 0 ? <Hero eventos={datosPortada.carrusel} /> : null}

          <PillsAtajos atajo={atajo} onCambiar={setAtajo} />

          {secciones.map((seccion) => {
            if (seccion.tipo === 'hoy') {
              if (seccion.eventos.length > 0) {
                return (
                  <FilaCategoria
                    key="hoy-en-salta"
                    categoria="hoy"
                    titulo="Hoy en Salta"
                    eventos={seccion.eventos}
                    alVerTodos={() => setAtajo('hoy')}
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
                    onPress={() => setAtajo('semana')}
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
                      router.push(`/buscar?categoria=${encodeURIComponent(catSlug)}`)
                    }
                  }}
                />
              )
            }

            return <BannerRadar key="banner-radar" />
          })}
        </ScrollView>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  scroll: { paddingBottom: 24 },
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
  vacioHoyBoton: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
})
