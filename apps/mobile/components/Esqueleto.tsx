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
// en vez de decenas, y todos los bloques pulsan juntos. Con "Reducir
// movimiento" / "Quitar animaciones" prendido (`isReduceMotionEnabled`, y el
// evento `reduceMotionChanged` si se cambia con la pantalla abierta) no se
// anima: opacidad fija (`animacionEsqueleto`, lib/esqueleto.ts). El loop se
// para en el cleanup del efecto (al desmontar o al cambiar el ajuste), y la
// suscripción se saca en el cleanup del suyo.
//
// Accesibilidad: el lector de pantalla no lee los bloques (son decorado). El
// contenedor es el ÚNICO elemento accesible de la pantalla de carga:
// `accessible` + `accessibilityLabel="Cargando"` + `accessibilityRole=
// "progressbar"` + `accessibilityState={{ busy: true }}`. `progressbar` y no
// `text`: TalkBack lo anuncia como "Cargando, barra de progreso" (VoiceOver,
// como un indicador que se actualiza), que es justo lo que es — y es lo mismo
// que anunciaba el `ActivityIndicator` de `Cargando`, que en Android es un
// `ProgressBar` nativo. Con `text` sonaría a un texto suelto de la pantalla.
// `busy` no lo dice TalkBack, pero lo exponen las APIs de accesibilidad (iOS
// y la web de RN), así que no está de más. Adentro, la capa de los bloques
// lleva `accessibilityElementsHidden` (iOS) + `importantForAccessibility=
// "no-hide-descendants"` (Android), y cada bloque también, por si alguna vez
// se usa suelto. Ojo: esas dos props van en la capa de ADENTRO, nunca en el
// contenedor accesible (en Android `no-hide-descendants` lo escondería a él
// también). Sin texto visible nuevo.
//
// Colores: solo tokens de `useColoresQPS()` (`muted` para los bloques,
// `card` + `border` para las cajas que en la pantalla real tienen fondo y
// borde, `border` para lo que va encima de un bloque `muted`), así se ve
// bien en oscuro (D1) y en claro, el día que llegue el selector de tema.
//
// Ancho: nada de anchos fijos que desborden a 360 dp. Las filas horizontales
// (chips, pills, tarjetas de `FilaCategoria`) cortan con `overflow: 'hidden'`
// y dibujan solo los bloques que asoman (`cantidadQueAsoma`, con el ancho de
// `useWindowDimensions()`, nunca `Dimensions` a nivel de módulo, QPS-132);
// el resto va con flex y porcentajes.
import { useEffect, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
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
import { useColoresQPS } from '@/lib/colores'
import {
  animacionEsqueleto,
  cantidadQueAsoma,
  DURACION_MEDIO_PULSO_MS,
  filasDeGrilla,
  OPACIDAD_MAXIMA,
  OPACIDAD_MINIMA,
} from '@/lib/esqueleto'

/**
 * `true`/`false` según "Reducir movimiento" del sistema; `null` mientras la
 * consulta no resolvió (ver `animacionEsqueleto`). Mismo patrón que el
 * `isScreenReaderEnabled` de `components/Hero.tsx`: el `setState` va en el
 * callback de la promesa y en el del listener, nunca sincrónico en el cuerpo
 * del efecto (lint `react-hooks/set-state-in-effect`); `montado` evita
 * aplicar una respuesta que llega después del desmonte.
 */
function useReducirMovimiento(): boolean | null {
  const [reducir, setReducir] = useState<boolean | null>(null)

  useEffect(() => {
    let montado = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((valor) => {
        if (montado) setReducir(valor)
      })
      // Si la consulta falla, queda en `null`: sin animación (lo seguro).
      .catch(() => {})
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', (valor) => {
      if (montado) setReducir(valor)
    })
    return () => {
      montado = false
      suscripcion.remove()
    }
  }, [])

  return reducir
}

/**
 * La opacidad animada del pulso. Iniciar y parar el `Animated.loop` (y el
 * `setValue` de la opacidad fija) no son `setState`: no hay render de por
 * medio, así que pueden ir en el cuerpo del efecto.
 */
function usePulso(): Animated.Value {
  const reducir = useReducirMovimiento()
  const [opacidad] = useState(() => new Animated.Value(OPACIDAD_MAXIMA))

  useEffect(() => {
    const { anima, opacidadFija } = animacionEsqueleto(reducir)
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
  }, [reducir, opacidad])

  return opacidad
}

interface BloqueProps {
  ancho?: DimensionValue
  alto?: DimensionValue
  radio?: number
  /** Por defecto `muted`; `encima` usa `border`, para lo que va arriba de otro bloque. */
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
        { width: ancho, height: alto, borderRadius: radio, backgroundColor: encima ? colores.border : colores.muted },
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
  const opacidad = usePulso()

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
        style={{ opacity: opacidad }}
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
      {/* Cabecera fija de la R67 (67-b): ≈113 dp, igual que la real. */}
      <View style={[estilos.cabeceraPortada, { borderBottomColor: colores.border }]}>
        <FilaQueAsoma ancho={ancho} anchos={ANCHOS_CHIPS} alto={48} radio={999} separacion={SEPARACION_CHIPS} style={estilos.filaChips} />
        <FilaQueAsoma ancho={ancho} anchos={ANCHOS_PILLS_INICIO} alto={44} radio={20} separacion={SEPARACION_CHIPS} style={estilos.filaPills} />
      </View>

      {/* Hero: a sangre, mismo alto que el real; adentro, el badge, el título
          en 2 líneas, los datos y "Ver detalles", abajo a la izquierda. */}
      <View style={[estilos.hero, { height: altoHero(altoVentana), backgroundColor: colores.muted }]}>
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
          <FilaQueAsoma ancho={ancho} anchos={ANCHOS_CHIPS} alto={48} radio={999} separacion={SEPARACION_CHIPS} style={estilos.chipsBuscar} />
          <Bloque ancho="45%" alto={16} />
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
        <Bloque ancho="50%" alto={16} />
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
            <View style={[estilos.afichePelicula, { backgroundColor: colores.muted }]}>
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
// lugar con su dirección); la caja de precio (`muted`, radio 12, padding 24);
// los CTAs ("Cómo llegar", "Comprar tickets").
// ---------------------------------------------------------------------------

export function EsqueletoFicha() {
  const colores = useColoresQPS()

  return (
    <PantallaEsqueleto>
      <View style={estilos.contenidoFicha}>
        <View style={[estilos.aficheFicha, { backgroundColor: colores.muted }]}>
          <Bloque ancho={88} alto={24} encima />
        </View>

        <View style={estilos.tituloFicha}>
          <Bloque ancho="100%" alto={30} />
          <Bloque ancho="65%" alto={30} />
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

        <View style={[estilos.cajaPrecio, { backgroundColor: colores.muted }]}>
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

  // Inicio. Cabecera: 8 de aire + chips (48 + 12 abajo) + pills (12 + 44 + 12)
  // − 12 (`pillsBajoChips` de la portada) + 1 de borde ≈ 113 dp.
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
  // Los chips traen su propio padding lateral (16), igual que en la lista real.
  chipsBuscar: { marginHorizontal: -MARGEN_LATERAL },
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
  filasDatos: { gap: 12 },
  filaDato: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lugarFicha: { flex: 1, gap: 6 },
  cajaPrecio: { borderRadius: 12, padding: 24, gap: 8 },
})
