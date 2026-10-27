// Esqueletos de carga (A1, nube Q1). Inicio, Buscar, Cines y la ficha de un
// evento dejan de mostrar `Cargando` (el indicador centrado de
// `components/EstadoCarga.tsx`) en la carga inicial y dibujan, en su lugar,
// bloques grises con la forma aproximada de lo que viene: así la pantalla no
// "salta" cuando llegan los datos y se entiende antes qué se está cargando.
// `Cargando` sigue existiendo para el resto de las pantallas, y el
// pull-to-refresh no cambia (sigue mostrando lo que ya había, 28-c).
//
// Un solo componente base (`PantallaEsqueleto`) y una variante por pantalla
// (`EsqueletoPortada`, `EsqueletoBuscar`, `EsqueletoCines`, `EsqueletoFicha`),
// con medidas copiadas a ojo de los componentes reales (ver el comentario de
// cada una). La parte pura (si se anima o no, cuántos bloques asoman en una
// fila, cómo se arma la grilla) vive en `lib/esqueleto.ts`, con sus tests en
// `tests/esqueletos.test.ts`.
//
// Animación: un pulso de opacidad con `Animated` de React Native
// (`Animated.loop` + dos `Animated.timing`, `useNativeDriver: true`), sin
// dependencias nuevas. Hay UN solo `Animated.View` por pantalla (el que
// envuelve todos los bloques), no uno por bloque: una sola animación nativa
// en vez de decenas, y todos los bloques pulsan juntos. En Android ese
// `Animated.View` va con `renderToHardwareTextureAndroid` mientras anima: la
// opacidad se aplica a la capa entera (los bloques encima de las cajas `card`
// no se transparentan uno sobre otro) y no se vuelve a dibujar en cada cuadro.
// Con "Reducir movimiento" / "Quitar animaciones" prendido
// (`useReducirMovimiento`, `lib/reducir-movimiento.ts`, compartido con
// `PillsAtajos`) no se anima (`animacionEsqueleto`, lib/esqueleto.ts), y
// además el valor animado ni se conecta al estilo: así un `stop()` tardío del
// driver nativo no puede dejar la opacidad a mitad de camino. El loop se para
// en el cleanup del efecto (al desmontar o al cambiar el ajuste).
//
// Accesibilidad: el lector de pantalla no lee los bloques (son decorado). El
// contenedor es el ÚNICO elemento accesible de la pantalla de carga:
// `accessible` + `accessibilityLabel="Cargando"` + `accessibilityRole=
// "progressbar"` + `accessibilityState={{ busy: true }}`. Se eligió
// `progressbar` y no `text` porque el rol dice que es algo en curso, no un
// texto suelto de la pantalla; lo esperable es que TalkBack lo lea como
// "Cargando" seguido del nombre del rol ("barra de progreso" o similar), pero
// no está verificado en un teléfono. Tampoco es igual a lo de antes: el
// `ActivityIndicator` de `Cargando` no tenía etiqueta. `busy` TalkBack no lo
// dice, pero lo exponen las APIs de accesibilidad (iOS y la web de RN). Adentro,
// la capa de los bloques lleva `accessibilityElementsHidden` (iOS) +
// `importantForAccessibility="no-hide-descendants"` (Android), y cada bloque
// también, por si alguna vez se usa suelto. Ojo: esas dos props van en la capa
// de ADENTRO, nunca en el contenedor accesible (en Android
// `no-hide-descendants` lo escondería a él también). Sin texto visible nuevo.
//
// Colores: los bloques (y sus fondos llenos: Hero, afiches, caja de precio)
// usan `colorBloqueEsqueleto` y lo que va encima de ellos `colorBloqueEncima`
// (`lib/colores.ts`, un tono por esquema, con el porqué de cada valor): el
// token `muted` casi no se distinguía del fondo en oscuro (~1,14:1). Las cajas
// que en la pantalla real tienen fondo y borde (tiles de Buscar, tarjetas de
// película) siguen con `card` + `border`. Nada de colores fijos acá.
//
// Ancho: nada de anchos fijos que desborden a 360 dp. Las filas horizontales
// (chips, pills, tarjetas de `FilaCategoria`) cortan con `overflow: 'hidden'`
// y dibujan solo los bloques que asoman (`cantidadQueAsoma`, con el ancho de
// `useWindowDimensions()`, nunca `Dimensions` a nivel de módulo, QPS-132);
// el resto va con flex y porcentajes.
import { useEffect, useState, type ReactNode } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { altoHero } from '@/components/Hero'
import { colorBloqueEncima, colorBloqueEsqueleto, useColoresQPS } from '@/lib/colores'
import {
  animacionEsqueleto,
  cantidadQueAsoma,
  DURACION_MEDIO_PULSO_MS,
  filasDeGrilla,
  OPACIDAD_MAXIMA,
  OPACIDAD_MINIMA,
} from '@/lib/esqueleto'
import { useReducirMovimiento } from '@/lib/reducir-movimiento'

/**
 * La opacidad animada del pulso y si se está animando. Iniciar y parar el
 * `Animated.loop` (y el `setValue` de la opacidad fija) no son `setState`: no
 * hay render de por medio, así que pueden ir en el cuerpo del efecto. Las
 * dependencias son solo `anima` (cambia cuando resuelve la consulta o cambia
 * el ajuste) y `opacidad` (estable, sale de `useState`): el pulso no se
 * reinicia en cada render.
 */
function usePulso(): { opacidad: Animated.Value; anima: boolean } {
  const { anima, opacidadFija } = animacionEsqueleto(useReducirMovimiento())
  const [opacidad] = useState(() => new Animated.Value(OPACIDAD_MAXIMA))

  useEffect(() => {
    if (!anima) {
      opacidad.setValue(opacidadFija)
      return undefined
    }

    const curva = Easing.inOut(Easing.ease)
    const pulso = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidad, { toValue: OPACIDAD_MINIMA, duration: DURACION_MEDIO_PULSO_MS, easing: curva, useNativeDriver: true }),
        Animated.timing(opacidad, { toValue: OPACIDAD_MAXIMA, duration: DURACION_MEDIO_PULSO_MS, easing: curva, useNativeDriver: true }),
      ]),
    )
    pulso.start()

    return () => {
      pulso.stop()
    }
  }, [anima, opacidadFija, opacidad])

  return { opacidad, anima }
}

interface BloqueProps {
  ancho?: DimensionValue
  alto?: DimensionValue
  radio?: number
  /** Por defecto `colorBloqueEsqueleto`; `encima` usa `colorBloqueEncima`, para lo que va arriba de otro bloque. */
  encima?: boolean
  style?: StyleProp<ViewStyle>
}

/** Un bloque gris. Oculto para el lector de pantalla (decorado). */
export function Bloque({ ancho, alto, radio = 6, encima = false, style }: BloqueProps) {
  const colores = useColoresQPS()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: ancho, height: alto, borderRadius: radio, backgroundColor: encima ? colorBloqueEncima(colores) : colorBloqueEsqueleto(colores) },
        style,
      ]}
    />
  )
}

/**
 * El contenedor de cada esqueleto: el único elemento accesible ("Cargando",
 * ver la cabecera del archivo) y la única capa animada.
 */
export function PantallaEsqueleto({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colores = useColoresQPS()
  const { opacidad, anima } = usePulso()

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando"
      accessibilityState={{ busy: true }}
      style={[estilos.pantalla, { backgroundColor: colores.background }, style]}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        renderToHardwareTextureAndroid={anima}
        style={anima ? { opacity: opacidad } : undefined}
      >
        {children}
      </Animated.View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Inicio (`app/(tabs)/index.tsx`): cabecera fija (chips de
// `ChipsCategorias` arriba, pills de `PillsAtajos` debajo) → Hero (~60 % del
// alto de la ventana, `altoHero` de `components/Hero.tsx`) → dos filas tipo
// `FilaCategoria` (encabezado con ícono, título, contador y "Ver todos";
// tarjetas de 180×270, gap 20, padding 16).
// ---------------------------------------------------------------------------

/** Anchos aproximados de los chips ("Todas" y algunas categorías con ícono). */
const ANCHOS_CHIPS = [84, 108, 96, 120, 92, 104]
/** Anchos aproximados de las pills (Hoy · Esta noche · Finde · Semana). */
const ANCHOS_PILLS_INICIO = [62, 110, 74, 88]
const ANCHO_TARJETA_FILA = 180
const ALTO_TARJETA_FILA = 270
const SEPARACION_TARJETAS_FILA = 20
const SEPARACION_CHIPS = 10
const MARGEN_LATERAL = 16

/** Una fila horizontal de bloques que asoman (cortada con `overflow: 'hidden'`). */
function FilaQueAsoma({
  ancho,
  anchos,
  alto,
  radio,
  separacion,
  style,
}: {
  ancho: number
  anchos: readonly number[]
  alto: number
  radio: number
  separacion: number
  style?: StyleProp<ViewStyle>
}) {
  const cantidad = cantidadQueAsoma(ancho, anchos, MARGEN_LATERAL, separacion)
  return (
    <View style={[estilos.filaQueAsoma, { gap: separacion }, style]}>
      {anchos.slice(0, cantidad).map((anchoBloque, indice) => (
        <Bloque key={indice} ancho={anchoBloque} alto={alto} radio={radio} style={estilos.sinEncoger} />
      ))}
    </View>
  )
}

function FilaCategoriaEsqueleto({ ancho }: { ancho: number }) {
  const anchosTarjetas = Array.from({ length: 6 }, () => ANCHO_TARJETA_FILA)
  return (
    <View style={estilos.filaCategoria}>
      <View style={estilos.encabezadoFila}>
        <View style={estilos.tituloFila}>
          <Bloque ancho={20} alto={20} radio={4} />
          <Bloque ancho={120} alto={20} />
          <Bloque ancho={28} alto={20} radio={999} />
        </View>
        <Bloque ancho={64} alto={14} />
      </View>
      <FilaQueAsoma
        ancho={ancho}
        anchos={anchosTarjetas}
        alto={ALTO_TARJETA_FILA}
        radio={12}
        separacion={SEPARACION_TARJETAS_FILA}
      />
    </View>
  )
}

export function EsqueletoPortada() {
  const colores = useColoresQPS()
  const { width: ancho, height: altoVentana } = useWindowDimensions()

  return (
    <PantallaEsqueleto>
      {/* Cabecera fija de la R67 (67-b): ≈125 dp, igual que la real. */}
      <View style={[estilos.cabeceraPortada, { borderBottomColor: colores.border }]}>
        <FilaQueAsoma ancho={ancho} anchos={ANCHOS_CHIPS} alto={48} radio={999} separacion={SEPARACION_CHIPS} style={estilos.filaChips} />
        <FilaQueAsoma ancho={ancho} anchos={ANCHOS_PILLS_INICIO} alto={44} radio={20} separacion={SEPARACION_CHIPS} style={estilos.filaPills} />
      </View>

      {/* Hero: a sangre, mismo alto que el real; adentro, el badge, el título
          en 2 líneas, los datos y "Ver detalles", abajo a la izquierda. */}
      <View style={[estilos.hero, { height: altoHero(altoVentana), backgroundColor: colorBloqueEsqueleto(colores) }]}>
        <Bloque ancho={72} alto={18} encima />
        <Bloque ancho="80%" alto={16} encima />
        <Bloque ancho="55%" alto={16} encima />
        <Bloque ancho="60%" alto={12} encima />
        <Bloque ancho={110} alto={28} radio={8} encima style={estilos.botonHero} />
      </View>

      <FilaCategoriaEsqueleto ancho={ancho} />
      <FilaCategoriaEsqueleto ancho={ancho} />
    </PantallaEsqueleto>
  )
}

// ---------------------------------------------------------------------------
// Buscar (`app/(tabs)/buscar.tsx`): debajo de la cabecera (campo, pills y
// "Solo gratis", que ya están arriba y no se reemplazan). Sin filtros, lo
// primero que se ve al cargar es "Explorar por categoria" y la grilla de 2
// tiles (ícono de 40 + nombre + "N eventos", padding 16, borde, radio 10).
// Con algún filtro (por ejemplo, al llegar desde "Ver todos" de la portada
// con `?categoria=…`), son los chips, el conteo y la grilla de 2 de
// `TarjetaEvento` (2:3, radio 12): `resultados` elige cuál.
// ---------------------------------------------------------------------------

const TILES_BUSCAR = 8
const TARJETAS_BUSCAR = 4

export function EsqueletoBuscar({ resultados }: { resultados: boolean }) {
  const colores = useColoresQPS()
  const { width: ancho } = useWindowDimensions()

  if (resultados) {
    return (
      <PantallaEsqueleto>
        <View style={estilos.listaBuscar}>
          {/* La cabecera de la lista real es UN solo hijo (los chips, con su
              `paddingBottom: 12`, y el conteo, ~20 de línea + `marginBottom:
              12`): entre los chips y el conteo no hay `gap`. */}
          <View>
            <FilaQueAsoma ancho={ancho} anchos={ANCHOS_CHIPS} alto={48} radio={999} separacion={SEPARACION_CHIPS} style={estilos.chipsBuscar} />
            <Bloque ancho="45%" alto={16} style={estilos.tituloBuscar} />
          </View>
          {filasDeGrilla(TARJETAS_BUSCAR, 2).map((fila) => (
            <View key={fila[0]} style={estilos.filaGrilla}>
              {fila.map((indice) => (
                <View key={indice} style={estilos.celdaGrilla}>
                  <Bloque radio={12} style={estilos.tarjetaGrilla} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </PantallaEsqueleto>
    )
  }

  return (
    <PantallaEsqueleto>
      <View style={estilos.listaBuscar}>
        {/* "Explorar por categoria": ~20 de línea + `marginBottom: 12`, y
            después el `gap` de 12 de la lista hasta la grilla. */}
        <Bloque ancho="50%" alto={16} style={estilos.tituloBuscar} />
        {filasDeGrilla(TILES_BUSCAR, 2).map((fila) => (
          <View key={fila[0]} style={estilos.filaGrilla}>
            {fila.map((indice) => (
              <View key={indice} style={[estilos.tile, { backgroundColor: colores.card, borderColor: colores.border }]}>
                <Bloque ancho={40} alto={40} radio={10} />
                <View style={estilos.textoTile}>
                  <Bloque ancho="80%" alto={14} />
                  <Bloque ancho="55%" alto={12} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </PantallaEsqueleto>
  )
}

// ---------------------------------------------------------------------------
// Cines (`app/cines.tsx`): debajo del título y del buscador (que ya están
// arriba). Una lista de `TarjetaPelicula` sin `compacta`: caja `card` con
// borde, radio 16 y padding 16; afiche 2:3 a ancho completo (radio 12) con el
// badge "N Cines" arriba a la derecha; título; divisor; filas de cine de 48.
// ---------------------------------------------------------------------------

const TARJETAS_CINES = 2

export function EsqueletoCines() {
  const colores = useColoresQPS()

  return (
    <PantallaEsqueleto>
      <View style={estilos.listaCines}>
        {Array.from({ length: TARJETAS_CINES }, (_, indice) => (
          <View key={indice} style={[estilos.tarjetaPelicula, { backgroundColor: colores.card, borderColor: colores.border }]}>
            <View style={[estilos.afichePelicula, { backgroundColor: colorBloqueEsqueleto(colores) }]}>
              <Bloque ancho={56} alto={22} encima style={estilos.badgePelicula} />
            </View>
            <Bloque ancho="70%" alto={18} style={estilos.tituloPelicula} />
            <View style={[estilos.divisor, { borderColor: colores.border }]} />
            <View style={estilos.filaCine}>
              <Bloque ancho="55%" alto={14} />
              <Bloque ancho={16} alto={16} radio={4} />
            </View>
            <View style={estilos.filaCine}>
              <Bloque ancho="45%" alto={14} />
              <Bloque ancho={16} alto={16} radio={4} />
            </View>
          </View>
        ))}
      </View>
    </PantallaEsqueleto>
  )
}

// ---------------------------------------------------------------------------
// Ficha de un evento (`app/evento/[id].tsx`): padding 16, gap 16; afiche 3:4
// a ancho completo (radio 16) con el badge de categoría arriba a la izquierda;
// título en 2 líneas (fuente 30); filas de datos con ícono de 20 (fecha, hora,
// lugar con su dirección); la descripción; la caja de precio (radio 12,
// padding 24); los CTAs ("Cómo llegar", "Comprar tickets"). La franja de
// `AvisoPatrocinado` (con `?patrocinado=1`) no va acá: la dibuja la ficha
// arriba y FUERA de este esqueleto, porque es interactiva y no se oculta.
// ---------------------------------------------------------------------------

export function EsqueletoFicha() {
  const colores = useColoresQPS()

  return (
    <PantallaEsqueleto>
      <View style={estilos.contenidoFicha}>
        <View style={[estilos.aficheFicha, { backgroundColor: colorBloqueEsqueleto(colores) }]}>
          <Bloque ancho={88} alto={24} encima />
        </View>

        <View style={estilos.tituloFicha}>
          <Bloque ancho="100%" alto={30} />
          <Bloque ancho="60%" alto={30} />
        </View>

        <View style={estilos.filasDatos}>
          <View style={estilos.filaDato}>
            <Bloque ancho={20} alto={20} radio={4} />
            <Bloque ancho="55%" alto={16} />
          </View>
          <View style={estilos.filaDato}>
            <Bloque ancho={20} alto={20} radio={4} />
            <Bloque ancho="30%" alto={16} />
          </View>
          <View style={estilos.filaDato}>
            <Bloque ancho={20} alto={20} radio={4} />
            <View style={estilos.lugarFicha}>
              <Bloque ancho="60%" alto={16} />
              <Bloque ancho="45%" alto={13} />
            </View>
          </View>
        </View>

        {/* La descripción (texto secundario, varias líneas). */}
        <View style={estilos.descripcionFicha}>
          <Bloque ancho="100%" alto={14} />
          <Bloque ancho="100%" alto={14} />
          <Bloque ancho="70%" alto={14} />
        </View>

        <View style={[estilos.cajaPrecio, { backgroundColor: colorBloqueEsqueleto(colores) }]}>
          <Bloque ancho="40%" alto={13} encima />
          <Bloque ancho="55%" alto={26} encima />
        </View>

        <Bloque ancho="100%" alto={48} radio={10} />
        <Bloque ancho="100%" alto={48} radio={10} />
      </View>
    </PantallaEsqueleto>
  )
}

const estilos = StyleSheet.create({
  // `overflow: 'hidden'`: lo que no entra en el alto de la pantalla se corta
  // (el esqueleto no scrollea: no hay nada que ver más abajo).
  pantalla: { flex: 1, overflow: 'hidden' },
  sinEncoger: { flexShrink: 0 },
  filaQueAsoma: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: MARGEN_LATERAL, overflow: 'hidden' },

  // Inicio. Cabecera: 8 de aire + 60 de chips (48 + 12 abajo) + 56 de pills
  // (12 + 44 + 12, − 12 del `pillsBajoChips` de la portada) + 1 de borde =
  // 125 dp.
  cabeceraPortada: { paddingTop: 8, borderBottomWidth: 1 },
  filaChips: { paddingBottom: 12 },
  filaPills: { paddingVertical: 12, marginTop: -12 },
  hero: { width: '100%', justifyContent: 'flex-end', padding: 12, gap: 6 },
  botonHero: { marginTop: 4 },
  filaCategoria: { paddingTop: 20 },
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: MARGEN_LATERAL,
    marginBottom: 12,
    gap: 8,
    minHeight: 24,
  },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },

  // Buscar: mismo padding y gaps que sus `FlatList` (`estilos.lista`).
  listaBuscar: { paddingHorizontal: MARGEN_LATERAL, paddingBottom: 16, gap: 12 },
  // Los chips traen su propio padding lateral (16) y el de abajo (12) de
  // `ChipsCategorias`, igual que en la lista real.
  chipsBuscar: { marginHorizontal: -MARGEN_LATERAL, paddingBottom: 12 },
  // El título real (fuente 16) mide ~20 de línea: 16 de bloque + 2 arriba y 2
  // abajo; más su `marginBottom: 12` (`estilos.tituloSeccion` de Buscar).
  tituloBuscar: { marginTop: 2, marginBottom: 14 },
  filaGrilla: { flexDirection: 'row', gap: 12 },
  celdaGrilla: { flex: 1, maxWidth: '50%' },
  tarjetaGrilla: { width: '100%', aspectRatio: 2 / 3 },
  tile: {
    flex: 1,
    maxWidth: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
  },
  textoTile: { flex: 1, gap: 6 },

  // Cines: mismo padding y gap que su `FlatList` (`estilos.lista`).
  listaCines: { padding: MARGEN_LATERAL, gap: 16 },
  tarjetaPelicula: { borderWidth: 1, borderRadius: 16, padding: 16 },
  afichePelicula: { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden' },
  badgePelicula: { position: 'absolute', top: 10, right: 10 },
  tituloPelicula: { marginTop: 12 },
  divisor: { borderTopWidth: 1, marginTop: 10, marginBottom: 2 },
  filaCine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },

  // Ficha: mismo padding y gap que su `ScrollView` (`estilos.contenido`).
  contenidoFicha: { padding: MARGEN_LATERAL, gap: 16 },
  aficheFicha: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, padding: 12 },
  tituloFicha: { gap: 6 },
  descripcionFicha: { gap: 6 },
  filasDatos: { gap: 12 },
  filaDato: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lugarFicha: { flex: 1, gap: 6 },
  cajaPrecio: { borderRadius: 12, padding: 24, gap: 8 },
})
