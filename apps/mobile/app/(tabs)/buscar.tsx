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
//
// R66 (66-b): Buscar filtra también por fecha y deja cambiar la categoría.
// Las pills de fecha (`PillsAtajos` con `etiquetaTodas="Cualquier fecha"`,
// `null` = todas las fechas) y, en modo resultados, los chips de categoría
// (`ChipsCategorias`, con las categorías que tienen eventos para la fecha, el
// texto y "Solo gratis" elegidos; van dentro de la lista, arriba del conteo,
// para que scrolleen y no le roben alto a los resultados con el teclado
// abierto) se suman a texto + gratis, todo con
// `filtrarCombinado` de `@qps/core/home/filtros-combinados`. Para filtrar por
// fecha hace falta `end_date`, así que la carga pasa a
// `obtenerEventosVigentesParaInicio(ahora)`, con un `ahora` único por carga
// guardado en el estado (mismo criterio que la portada). `atajo` llega por
// querystring junto con `categoria` y un nonce `v` desde "Ver todos" de la
// portada (`/buscar?categoria=<slug>&atajo=<atajo>&v=<Date.now()>`), con el
// mismo patrón comparar-y-ajustar, cuya clave incluye `v`: un toque nuevo vuelve
// a aplicar categoría y fecha aunque sean iguales a los de antes. Los conteos de la grilla "Explorar por categoria" siguen
// siendo sobre todos los eventos. Sin resultados, el vacío ofrece salir de la
// fecha y/o de la categoría. Buscar sigue sin caché offline.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { Atajo } from '@qps/core/home/atajos'
import {
  atajoDesdeParametro,
  categoriasDisponibles,
  filtrarCombinado,
  type ItemFiltrable,
} from '@qps/core/home/filtros-combinados'
import { BannerAnuncio } from '@/components/BannerAnuncio'
import { CampoTexto } from '@/components/CampoTexto'
import { ChipsCategorias } from '@/components/ChipsCategorias'
import { EsqueletoBuscar } from '@/components/Esqueleto'
import { ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono, iconoPorCategoria } from '@/components/Icono'
import { PillsAtajos } from '@/components/PillsAtajos'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { Texto } from '@/components/Texto'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'
import { obtenerCategorias, obtenerEventosVigentesParaInicio, type CategoriaBasica } from '@/lib/datos/eventos'

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
  // `ahora`: un único instante por carga (el mismo que decidió qué eventos
  // siguen vigentes), para que el filtro de fecha no use otro reloj.
  | { tipo: 'ok'; items: ItemFiltrable[]; categorias: CategoriaBasica[]; ahora: Date }

// Cómo se nombra cada fecha dentro de una frase ("... · el finde", "... para hoy").
const NOMBRE_ATAJO: Record<Atajo, string> = {
  hoy: 'hoy',
  'esta-noche': 'esta noche',
  finde: 'el finde',
  semana: 'esta semana',
}

// El ícono por categoría (R29-q, integración de la tanda 3, punto D): sale
// de `iconoPorCategoria`, `components/Icono.tsx` — el mismo mapeo que usa
// `components/FilaCategoria.tsx`, replicando `getCategoryIcon` de la web
// (`apps/web/lib/category-icons.ts`).

export default function Buscar() {
  const colores = useColoresQPS()
  // R72, 72-c (QPS-362): borde de chip gratis, tiles y botón secundario a >= 3:1
  // (antes `colores.border`, ~1,3:1; cálculo en `lib/colores.ts`).
  const bordeInactivo = bordeChipInactivo(colores)
  const params = useLocalSearchParams<{ categoria?: string; atajo?: string; v?: string }>()
  const categoriaParam = typeof params.categoria === 'string' && params.categoria ? params.categoria : null
  const atajoParam = atajoDesdeParametro(params.atajo)
  // Nonce de la portada (`Date.now()` en el `onPress` de "Ver todos"): cambia en
  // cada toque, así que sirve para volver a aplicar categoría y fecha aunque
  // los parámetros sean idénticos a los de la vez anterior.
  const vParam = typeof params.v === 'string' && params.v ? params.v : null

  const [estado, setEstado] = useState<EstadoLista>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // grilla sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)
  const [texto, setTexto] = useState('')
  const [soloGratisActivo, setSoloGratisActivo] = useState(false)

  // Sincroniza `categoriaFiltro` con el parámetro de la ruta sin `setState`
  // sincrónico dentro de un `useEffect` (mismo patrón que `idAnterior` en
  // `app/evento/[id].tsx`): se compara durante el render, no en un efecto.
  // R66: "Ver todos" de la portada trae la categoría Y el atajo que estaba
  // elegido, más el nonce `v`. La clave del comparar-y-ajustar es la
  // combinación de los tres: si cambia cualquiera (incluso solo `v`), se
  // vuelven a aplicar `categoria` y `atajo` del parámetro. Texto y "Solo
  // gratis" no se tocan.
  const claveParams = `${categoriaParam ?? ''}|${atajoParam ?? ''}|${vParam ?? ''}`
  const [claveParamsAnterior, setClaveParamsAnterior] = useState(claveParams)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(categoriaParam)
  const [atajo, setAtajo] = useState<Atajo | null>(atajoParam)
  if (claveParamsAnterior !== claveParams) {
    setClaveParamsAnterior(claveParams)
    setCategoriaFiltro(categoriaParam)
    setAtajo(atajoParam)
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
    const ahora = new Date()
    const [resultadoEventos, resultadoCategorias] = await Promise.all([
      obtenerEventosVigentesParaInicio(ahora),
      obtenerCategorias(),
    ])

    if (!resultadoEventos.ok) return { tipo: 'error', error: resultadoEventos.error }
    if (!resultadoCategorias.ok) return { tipo: 'error', error: resultadoCategorias.error }
    return { tipo: 'ok', items: resultadoEventos.eventos, categorias: resultadoCategorias.categorias, ahora }
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
  // R66: también con una fecha elegida (`atajo`).
  const mostrarResultados = Boolean(texto) || soloGratisActivo || Boolean(categoriaFiltro) || atajo !== null

  const resultadosMostrados = useMemo(() => {
    if (estado.tipo !== 'ok') return []
    return filtrarCombinado(
      estado.items,
      { atajo, categoria: categoriaFiltro, soloGratis: soloGratisActivo, texto },
      estado.ahora,
    )
  }, [estado, texto, atajo, categoriaFiltro, soloGratisActivo])

  // Los chips de categoría salen de lo filtrado por fecha + texto + gratis,
  // SIN la categoría: así se puede cambiar de categoría (o sacarla) y cada
  // chip muestra lo que daría elegirla.
  const categoriasParaChips = useMemo(() => {
    if (estado.tipo !== 'ok') return []
    const sinCategoria = filtrarCombinado(
      estado.items,
      { atajo, categoria: null, soloGratis: soloGratisActivo, texto },
      estado.ahora,
    )
    return categoriasDisponibles(sinCategoria, estado.categorias, categoriaFiltro)
  }, [estado, texto, atajo, categoriaFiltro, soloGratisActivo])

  // Los conteos de la grilla "Explorar por categoria" son sobre TODOS los
  // eventos (sin fecha ni texto): esa grilla solo se ve sin filtros.
  const cantidadPorCategoria = useCallback(
    (slug: string) => (estado.tipo === 'ok' ? estado.items.filter((item) => item.evento.category === slug).length : 0),
    [estado],
  )

  const sufijoFecha = atajo ? ` · ${NOMBRE_ATAJO[atajo]}` : ''
  const enCategoria = nombreCategoriaFiltro ? ` en ${nombreCategoriaFiltro}` : ''

  function textoResultados(cantidad: number): string {
    const plural = cantidad !== 1 ? 's' : ''
    if (texto) return `${cantidad} resultado${plural} para "${texto}"${enCategoria}${sufijoFecha}`
    const gratis = soloGratisActivo ? ' gratis' : ''
    return `${cantidad} evento${plural}${gratis}${enCategoria}${sufijoFecha}`
  }

  function textoSinResultados(): string {
    if (texto) return `No se encontraron eventos para "${texto}"${enCategoria}${sufijoFecha}`
    const gratis = soloGratisActivo ? ' gratis' : ''
    const cuando = atajo ? ` para ${NOMBRE_ATAJO[atajo]}` : ' por ahora'
    return `No hay eventos${gratis}${enCategoria}${cuando}.`
  }

  // Salidas del vacío (R66): sacar la fecha y/o la categoría. Un botón por
  // cada filtro que se puede sacar.
  const accionesVacio: { texto: string; alTocar: () => void }[] = []
  if (atajo !== null) accionesVacio.push({ texto: 'Ver todas las fechas', alTocar: () => setAtajo(null) })
  if (categoriaFiltro !== null) accionesVacio.push({ texto: 'Todas las categorías', alTocar: () => setCategoriaFiltro(null) })

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      <View style={estilos.cabecera}>
        <View style={estilos.campo}>
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
        </View>

        <PillsAtajos atajo={atajo} onCambiar={setAtajo} etiquetaTodas="Cualquier fecha" />

        <Pressable
          onPress={() => setSoloGratisActivo((valor) => !valor)}
          accessibilityRole="button"
          accessibilityState={{ selected: soloGratisActivo }}
          style={[
            estilos.chipGratis,
            {
              borderColor: soloGratisActivo ? colores.primary : bordeInactivo,
              backgroundColor: soloGratisActivo ? colores.primary : colores.card,
            },
          ]}
        >
          {/* R72, 72-c: activo = relleno (no solo matiz) + negrita. */}
          <Texto peso={soloGratisActivo ? 'bold' : 'semibold'} style={{ color: soloGratisActivo ? colores.primaryForeground : colores.foreground }}>
            Solo gratis
          </Texto>
        </Pressable>
      </View>

      {/* A1 (nube Q1): esqueleto en vez de `Cargando`, debajo de la cabecera
          (campo, pills y "Solo gratis" siguen arriba). Con la misma
          `mostrarResultados` que elige la lista de abajo: sin filtros, la
          grilla de tiles de categoría; con alguno (por ejemplo, llegando con
          `?categoria=`), la de tarjetas. El pull-to-refresh no cambia. */}
      {estado.tipo === 'cargando' ? <EsqueletoBuscar resultados={mostrarResultados} /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' && !mostrarResultados ? (
        <FlatList
          data={estado.categorias}
          keyExtractor={(categoria) => categoria.id}
          numColumns={2}
          columnWrapperStyle={estilos.filaGrilla}
          contentContainerStyle={estilos.lista}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
                style={[estilos.tileCategoria, { backgroundColor: colores.card, borderColor: bordeInactivo }]}
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primary} colors={[colores.primary]} />
          }
          ListHeaderComponent={
            <>
              {/* Los chips scrollean con la lista (no quedan fijos): con el
                  teclado abierto la cabecera fija es solo campo + pills. El
                  padding horizontal de la lista (16) se compensa con margen
                  negativo porque los chips traen el suyo. */}
              <View style={estilos.chipsEnLista}>
                <ChipsCategorias categorias={categoriasParaChips} seleccionada={categoriaFiltro} onCambiar={setCategoriaFiltro} />
              </View>
              <Texto tono="secundario" accessibilityLiveRegion="polite" style={estilos.tituloSeccion}>
                {textoResultados(resultadosMostrados.length)}
              </Texto>
            </>
          }
          ListEmptyComponent={
            <View style={estilos.vacio}>
              <Vacio mensaje={textoSinResultados()} />
              {accionesVacio.map((accion, indice) => (
                <Pressable
                  key={accion.texto}
                  onPress={accion.alTocar}
                  accessibilityRole="button"
                  // El primero es la salida principal (relleno, como en la
                  // portada); el segundo, con contorno.
                  style={[
                    estilos.botonVacio,
                    indice === 0 ? { backgroundColor: colores.primary, borderColor: colores.primary } : { borderColor: bordeInactivo },
                  ]}
                >
                  <Texto peso="semibold" style={{ color: indice === 0 ? colores.primaryForeground : colores.foreground }}>
                    {accion.texto}
                  </Texto>
                </Pressable>
              ))}
            </View>
          }
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
          // R66 (66-b, rehecha en 66-r1): la cabecera FIJA es campo + chip +
          // pills de fecha: ~228 dp (160 + ~68 de las pills). Los chips de
          // categoría (~60 dp) ya no son fijos: van arriba del título dentro de
          // la lista (`ListHeaderComponent`) y scrollean con ella. Sin scrollear
          // la suma es la misma: 228 + 60 (chips) + 32 (título) + UNA fila de
          // 237 + ~24 de relleno = ~581 dp, así que con 1 o 2 resultados el
          // banner sigue asomando (área visible ~649 dp) y el mínimo no baja de
          // 3; con dos filas arranca a los ~830 dp. Al scrollear o con el
          // teclado abierto, los chips salen de pantalla y los resultados
          // ganan ~60 dp.
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
  // R66: las pills y los chips traen su propio padding horizontal (16), así
  // que la cabecera ya no lo pone: lo ponen el campo y el chip "Solo gratis".
  cabecera: { paddingTop: 16, gap: 4 },
  campo: { paddingHorizontal: 16 },
  // `ChipsCategorias` trae su padding horizontal (16) y la lista también: se
  // compensa para que el primer chip quede alineado con el campo, como antes.
  chipsEnLista: { marginHorizontal: -16 },
  vacio: { alignItems: 'center', gap: 12 },
  botonVacio: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    marginLeft: 16,
    marginBottom: 8,
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
