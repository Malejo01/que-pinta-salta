// Buscar (R29, 29-j; ops/paridad-web-app.md §3.5): un solo input ("evento,
// lugar o descripcion", con lupa y botón para limpiar) + chip "Solo gratis".
// Sin búsqueda ni filtro, "Explorar por categoria" (grilla de 2 tiles con
// ícono y "N eventos"); con búsqueda, con "Solo gratis" o con `categoria` de
// la ruta, "N resultados..." y la grilla de 2 de `TarjetaEvento`.
//
// La búsqueda de texto (título + lugar + descripción) es
// `buscarEventosPorTexto` de `@qps/core/home/busqueda` (nueva, movida desde
// el `useMemo` que tenía inline `apps/web/app/buscar/buscar-content.tsx`,
// con un test de equivalencia en `apps/web/tests/core/busqueda.test.ts`):
// ya no es `filterEvents`/`home/filters.ts` (esa es la de Inicio, que
// normaliza acentos y no mira la descripción — un criterio distinto).
//
// `categoria` llega por querystring desde "Ver todos" de una fila de la
// portada (29-h, `/(tabs)/buscar?categoria=<slug>`): mismo patrón
// "comparar-y-ajustar" que `app/evento/[id].tsx` para sincronizar el estado
// con el parámetro sin `setState` sincrónico dentro de un `useEffect`.
//
// 33-a (QPS-151): el input de texto pasa de un `TextInput` suelto (con
// `Icono`+botón de limpiar propios) a `CampoTexto` (28-h, F4/F5) — el mismo
// componente que ya usan Cuenta y Notificaciones. Mismo valor y handler
// (`value={texto}`, `onChangeText={setTexto}`): la búsqueda y el filtro no
// cambian, solo el componente de entrada.
//
// 33-a, vuelta 1 (revisor): el botón de limpiar ("X") se recupera con
// `accionDerecha` de `CampoTexto` (prop nueva, aditiva, QPS-151) — mismo
// `Pressable`/`accessibilityLabel`/`hitSlop` que tenía el `TextInput`
// suelto, visible solo con `texto` no vacío. La lupa de la izquierda NO se
// recupera a propósito: `CampoTexto` no tiene slot izquierdo, y ahora hay un
// label visible ("Buscar") que cumple el mismo rol.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { buscarEventosPorTexto } from '@qps/core/home/busqueda'
import { soloGratis } from '@qps/core/home/filtros-extra'
import type { DisplayEvent } from '@qps/core/home/types'
import { BannerAnuncio } from '@/components/BannerAnuncio'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { obtenerCategorias, obtenerEventosVigentes, type CategoriaBasica } from '@/lib/datos/eventos'

/**
 * Cuántos resultados tienen que haber para que el banner de abajo se dibuje
 * (R60, 52-d). No es un número arbitrario: con menos, el banner asoma sin
 * scrollear en un celular de 360×800 y eso rompe la regla (a) de Mauro — la
 * cuenta está en el comentario del `ListFooterComponent` de la lista de
 * resultados, más abajo. `tests/buscar.test.ts` exige que siga en 3.
 */
export const RESULTADOS_MINIMOS_PARA_ANUNCIO = 3

type EstadoLista =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'ok'; eventos: DisplayEvent[]; categorias: CategoriaBasica[] }

// El ícono por categoría (R29-q, integración de la tanda 3, punto D): sale
// de `iconoPorCategoria`, `components/Icono.tsx` — el mismo mapeo que usa
// `components/FilaCategoria.tsx`, replicando `getCategoryIcon` de la web
// (`apps/web/lib/category-icons.ts`).

export default function Buscar() {
  const colores = useColoresQPS()
  const params = useLocalSearchParams<{ categoria?: string }>()
  const categoriaParam = typeof params.categoria === 'string' && params.categoria ? params.categoria : null

  const [estado, setEstado] = useState<EstadoLista>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // grilla sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)
  const [texto, setTexto] = useState('')
  const [soloGratisActivo, setSoloGratisActivo] = useState(false)

  // Sincroniza `categoriaFiltro` con el parámetro de la ruta sin `setState`
  // sincrónico dentro de un `useEffect` (mismo patrón que `idAnterior` en
  // `app/evento/[id].tsx`): se compara durante el render, no en un efecto.
  const [categoriaParamAnterior, setCategoriaParamAnterior] = useState(categoriaParam)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(categoriaParam)
  if (categoriaParamAnterior !== categoriaParam) {
    setCategoriaParamAnterior(categoriaParam)
    setCategoriaFiltro(categoriaParam)
  }

  // Cuenta de "reintentos" (mismo patrón que `app/evento/[id].tsx` y
  // `components/PantallaRadar.tsx`): el efecto no puede llamar, de forma
  // sincrónica, a una función que haga `setState` (lint
  // react-hooks/set-state-in-effect). El fetch va inline en el efecto con
  // `.then()` — el `setState` queda recién en el callback de la promesa, no
  // en el cuerpo sincrónico del efecto — y "Reintentar" solo sube este
  // contador para que el efecto se repita.
  const [intento, setIntento] = useState(0)

  const obtenerDatos = useCallback(async (): Promise<EstadoLista> => {
    const [resultadoEventos, resultadoCategorias] = await Promise.all([
      obtenerEventosVigentes(),
      obtenerCategorias(),
    ])

    if (!resultadoEventos.ok) return { tipo: 'error', error: resultadoEventos.error }
    if (!resultadoCategorias.ok) return { tipo: 'error', error: resultadoCategorias.error }
    return { tipo: 'ok', eventos: resultadoEventos.eventos, categorias: resultadoCategorias.categorias }
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

  // Toca una categoría una segunda vez para quitar el filtro (no hay un botón
  // "volver" propio: la grilla de categorías no se ve mientras hay un
  // filtro activo, así que esto es la única forma de deshacerlo sin tocar
  // el buscador).
  const alTocarCategoria = useCallback((slug: string) => {
    setCategoriaFiltro((actual) => (actual === slug ? null : slug))
  }, [])

  const nombreCategoriaFiltro = useMemo(() => {
    if (!categoriaFiltro || estado.tipo !== 'ok') return null
    return estado.categorias.find((categoria) => categoria.slug === categoriaFiltro)?.name ?? null
  }, [categoriaFiltro, estado])

  // Mismo criterio que `mostrarListaResultados` de la web (con texto o con
  // "Solo gratis" se ven resultados en vez de la grilla de categorías); acá
  // se suma `categoriaFiltro`, que la web no tiene en Buscar (es la llegada
  // desde "Ver todos" de una fila de la portada, 29-h).
  const mostrarResultados = Boolean(texto) || soloGratisActivo || Boolean(categoriaFiltro)

  const resultadosMostrados = useMemo(() => {
    if (estado.tipo !== 'ok') return []
    let base = texto ? buscarEventosPorTexto(estado.eventos, texto) : estado.eventos
    if (categoriaFiltro) base = base.filter((evento) => evento.category === categoriaFiltro)
    return soloGratisActivo ? soloGratis(base) : base
  }, [estado, texto, categoriaFiltro, soloGratisActivo])

  const cantidadPorCategoria = useCallback(
    (slug: string) => (estado.tipo === 'ok' ? estado.eventos.filter((evento) => evento.category === slug).length : 0),
    [estado],
  )

  function textoResultados(cantidad: number): string {
    const plural = cantidad !== 1 ? 's' : ''
    if (texto) return `${cantidad} resultado${plural} para "${texto}"`
    if (categoriaFiltro) return `${cantidad} evento${plural}${nombreCategoriaFiltro ? ` en ${nombreCategoriaFiltro}` : ''}`
    return `${cantidad} evento${plural} gratis`
  }

  function textoSinResultados(): string {
    if (texto) return `No se encontraron eventos para "${texto}"`
    if (categoriaFiltro) return `No hay eventos${nombreCategoriaFiltro ? ` en ${nombreCategoriaFiltro}` : ''} por ahora.`
    return 'No hay eventos gratis por ahora.'
  }

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      <View style={estilos.cabecera}>
        <CampoTexto
          label="Buscar"
          value={texto}
          onChangeText={setTexto}
          placeholder="Buscar por evento, lugar o descripcion..."
          autoCapitalize="none"
          accionDerecha={
            texto ? (
              <Pressable
                onPress={() => setTexto('')}
                accessibilityRole="button"
                accessibilityLabel="Limpiar búsqueda"
                style={estilos.botonLimpiar}
                hitSlop={8}
              >
                <Icono nombre="X" tamanio={18} color={colores.mutedForeground} />
              </Pressable>
            ) : undefined
          }
        />

        <Pressable
          onPress={() => setSoloGratisActivo((valor) => !valor)}
          accessibilityRole="button"
          accessibilityState={{ selected: soloGratisActivo }}
          style={[
            estilos.chipGratis,
            {
              borderColor: soloGratisActivo ? colores.primary : colores.border,
              backgroundColor: soloGratisActivo ? colores.primary : colores.card,
            },
          ]}
        >
          <Texto peso="semibold" style={{ color: soloGratisActivo ? colores.primaryForeground : colores.foreground }}>
            Solo gratis
          </Texto>
        </Pressable>
      </View>

      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' && !mostrarResultados ? (
        <FlatList
          data={estado.categorias}
          keyExtractor={(categoria) => categoria.id}
          numColumns={2}
          columnWrapperStyle={estilos.filaGrilla}
          contentContainerStyle={estilos.lista}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primary} colors={[colores.primary]} />
          }
          ListHeaderComponent={
            <Texto peso="semibold" style={estilos.tituloSeccion}>
              Explorar por categoria
            </Texto>
          }
          ListEmptyComponent={<Vacio mensaje="Todavía no hay categorías cargadas." />}
          // R60, 52-d: con la lista vacía, `null` en vez de `<BannerAnuncio>`
          // — hallazgo de la R52 en la web (ux-ui): una FlatList dibuja
          // `ListFooterComponent` también debajo de `ListEmptyComponent`, así
          // que sin esta guarda el banner quedaría pegado abajo de "Todavía
          // no hay categorías cargadas.", cerca del pliegue.
          ListFooterComponent={estado.categorias.length === 0 ? null : <BannerAnuncio lugar="buscar" />}
          renderItem={({ item }) => {
            const cantidad = cantidadPorCategoria(item.slug)
            return (
              <Pressable
                onPress={() => alTocarCategoria(item.slug)}
                accessibilityRole="button"
                style={[estilos.tileCategoria, { backgroundColor: colores.card, borderColor: colores.border }]}
              >
                <View style={[estilos.iconoCategoria, { backgroundColor: `${colores.primary}1A` }]}>
                  <Icono nombre={iconoPorCategoria(item.slug)} tamanio={20} color={colores.primary} />
                </View>
                <View style={estilos.textoTile}>
                  <Texto peso="semibold" numberOfLines={1}>
                    {item.name}
                  </Texto>
                  <Texto tono="secundario" style={estilos.cantidadTile}>
                    {cantidad} eventos
                  </Texto>
                </View>
              </Pressable>
            )
          }}
        />
      ) : null}

      {estado.tipo === 'ok' && mostrarResultados ? (
        <FlatList
          data={resultadosMostrados}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={estilos.filaGrilla}
          contentContainerStyle={estilos.lista}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primary} colors={[colores.primary]} />
          }
          ListHeaderComponent={
            <Texto tono="secundario" style={estilos.tituloSeccion}>
              {textoResultados(resultadosMostrados.length)}
            </Texto>
          }
          ListEmptyComponent={<Vacio mensaje={textoSinResultados()} />}
          // Mismo porqué que la lista de categorías, arriba, pero el corte es
          // por CANTIDAD y no solo por lista vacía — regla (a) de Mauro
          // ("ningún anuncio arriba del pliegue"), con la cuenta de alturas de
          // ux-ui para 360×800: la cabecera (CampoTexto + chip, ~160 dp) más
          // el título de resultados (~32 dp) más UNA fila de la grilla de 2
          // columnas (tarjeta de 158×237 dp por el `aspectRatio: 2/3`) dejan
          // el banner arrancando a los ~453 dp, contra un área visible de
          // ~649 dp: con 1 o 2 resultados asoma sin scrollear. Con 3 o 4 son
          // dos filas y el banner se va a los ~702 dp. Es el mismo hallazgo
          // que ux-ui hizo sobre la web en la R52 (ahí fue con 2 resultados).
          //
          // Sin `sinConexion`, porque esta pantalla
          // no tiene ningún estado de caché/sin conexión propio
          // (a diferencia de Inicio, no usa `cargarAgendaConCache`), así que
          // no hay nada que pasarle — `BannerAnuncio` ya trae `false` por
          // omisión.
          ListFooterComponent={
            resultadosMostrados.length < RESULTADOS_MINIMOS_PARA_ANUNCIO ? null : <BannerAnuncio lugar="buscar" />
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
  cabecera: { padding: 16, gap: 12 },
  // Mismo tamaño mínimo (44dp) que el "ojito" de CampoTexto.tsx: el área
  // táctil del botón de limpiar no puede depender solo del padding.
  botonLimpiar: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 46-d: minHeight (no hitSlop) a propósito, aunque el chip tiene forma
  // propia (pill) — ver el reporte de la tarea: el detector de
  // `tests/accesibilidad-detector.test.ts` (`area-chica`) decide solo por
  // el nombre de la clave de estilo que usa el `style` del `Pressable`, sin
  // mirar `hitSlop`; la única excepción documentada (`EXCEPCIONES_AREA_CHICA`)
  // vive en ese mismo archivo, que esta tarea no puede tocar. 44 -> 48 (4dp
  // más de alto, casi imperceptible en una pill chica).
  chipGratis: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tituloSeccion: { fontSize: 16, marginBottom: 12 },
  lista: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  filaGrilla: { gap: 12 },
  // Ver el comentario del mismo nombre en app/(tabs)/index.tsx: evita que la
  // última celda de un número impar de eventos se estire a todo el ancho.
  celda: { flex: 1, maxWidth: '50%' },
  tileCategoria: {
    flex: 1,
    maxWidth: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
  },
  iconoCategoria: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  textoTile: { flex: 1 },
  cantidadTile: { fontSize: 13, marginTop: 2 },
})
