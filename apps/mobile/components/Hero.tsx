// Hero de la portada (R29, 29-h, ops/paridad-web-app.md §3.2 punto 2 y §2
// punto 7; paridad con `apps/web/components/hero-carousel.tsx`): hasta 6
// eventos de `selectCarouselEvents` (de core), el afiche entero sobre su
// versión desenfocada (ver el comentario de abajo sobre las dos capas) y un
// degradé, badge de categoría, título en 2 líneas, `Calendar` + fecha,
// `MapPin` + lugar, "Ver detalles" y el precio o "Entrada Gratuita", puntos
// arriba a la derecha.
//
// 36-b (G1 del feedback del teléfono 2, "el carrusel se ve muy chico"):
// el alto fijo de 200 pasó a `altoHero(altoVentana)`, ~60 % del alto de la
// ventana. El alto (y el ancho de cada diapositiva) se leen con
// `useWindowDimensions()` DENTRO del componente, nunca con `Dimensions` a
// nivel de módulo (QPS-132): así acompañan el cambio de tamaño de la
// ventana (pantalla dividida y multiventana de Android). La rotación hoy no
// se ejercita, porque `app.config.ts` fija `orientation: 'portrait'`: si
// algún día se permite girar, esto ya queda listo, pero no se puede dar por
// probado. El ancho de la ventana es también la única fuente del ancho de
// cada diapositiva (antes se medía con `onLayout` sobre el contenedor, que
// en los hechos coincidía con el ancho de la ventana porque el Hero ocupa
// todo el ancho dentro del `ScrollView` de Inicio, sin padding horizontal):
// usar la misma fuente para alto y ancho evita que `getItemLayout` y el
// ancho de cada diapositiva queden de dos medidas distintas y la paginación
// se desalinee.
//
// La web no tiene swipe (`ops/paridad-web-app.md` §3.2, fila Hero: "sin
// swipe en la web; en la app CON swipe, porque es lo esperable en el
// celular"); acá es un `FlatList` horizontal con `pagingEnabled`. El avance
// automático (cada 5 s) se reinicia cada vez que `indice` cambia —ya sea por
// el propio timer o porque el usuario deslizó— y se limpia al desmontar
// (cleanup del `useEffect`).
//
// R29-q (integración de la tanda 3, punto C): el límite que dejó 29-h ya se
// cerró — `components/Afiche.tsx` ahora acepta `resizeMode` y `blurRadius`
// (ver su comentario), sin tocar la cadena variante → original → fallback
// con `onError` ni la validación de hosts. `DiapositivaHero` dibuja DOS
// `<Afiche llenar>` superpuestas con la MISMA url (misma cadena de fuentes,
// mismo allow-list, ninguna URL armada a mano): la de abajo en `cover` +
// `blurRadius` (la versión desenfocada, a sangre, que llena todo el hueco) y
// la de arriba en `contain` (el afiche entero, sin recortar). La capa de
// arriba pasa `fallback={<></>}` (nada) para cuando no hay imagen válida: en
// ese caso la de abajo ya dibuja la marca (fondo primary + logo), y no hace
// falta dibujarla dos veces superpuesta.
import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import { formatEventDate } from '@qps/core/date-format'
import { capitalizeFirst } from '@qps/core/event-display'
import type { DisplayEvent } from '@qps/core/home/types'
import { Afiche } from '@/components/Afiche'
import { Icono } from '@/components/Icono'
import { InsigniaDestacado } from '@/components/InsigniaDestacado'
import { Texto } from '@/components/Texto'
import { AREA_TACTIL_MINIMA, ESCALA_MAXIMA_COMPACTA, hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { textoPrecio } from '@/lib/formato'
import { ACCIONES_HERO, etiquetaDiapositiva, indiceTrasAccion } from '@/lib/hero-accesible'
import { rutaDeEvento } from '@/lib/rutas'
import LOGO_MARCA from '@/assets/logo-circular.png'

const PORCENTAJE_ALTO_HERO = 0.6
const INTERVALO_MS = 5000
const MAXIMO_EVENTOS = 6

/**
 * Los puntos de paginación (`estilos.punto`) miden 6 de alto, siempre —
 * `hitSlopPara(AREA_TACTIL_MINIMA, 6)` da 0 de lateral (el primer argumento
 * ya es 48) y 21 arriba/abajo (6 + 2×21 = 48, llega). El ancho SÍ varía (20
 * el activo, 6 los demás) y los puntos están pegados entre sí (`estilos.puntos`,
 * gap: 6): no pueden llegar a 48 de ancho sin que las áreas de toque de dos
 * puntos vecinos se pisen. Se les da algo de aire igual (la mitad del gap,
 * 3, en vez de 0) sin llegar a pisarse — sigue sin alcanzar los 48, así que
 * `components/Hero.tsx` sigue en `tests/a11y/pendientes-componentes.ts` con
 * `area-chica: 1` (el motivo: el gesto principal para cambiar de diapositiva
 * es deslizar, no tocar el punto).
 */
const HIT_SLOP_PUNTO = { ...hitSlopPara(AREA_TACTIL_MINIMA, 6), left: 3, right: 3 }

/**
 * ~60 % del alto de la ventana (G1 del feedback del teléfono 2), redondeado.
 * Pura, para poder testearla sin montar nada de React Native. Se llama con
 * el alto que da `useWindowDimensions()` en el componente, nunca con
 * `Dimensions.get(...)` a nivel de módulo (QPS-132).
 */
export function altoHero(altoVentana: number): number {
  return Math.round(altoVentana * PORCENTAJE_ALTO_HERO)
}

export interface HeroProps {
  eventos: DisplayEvent[]
}

/** Como mucho 6 (ops/paridad-web-app.md §3.2): defensivo, aunque quien llama
 * ya le pasa el resultado de `selectCarouselEvents` (que ya cumple esto). */
export function eventosHero(eventos: DisplayEvent[]): DisplayEvent[] {
  return eventos.slice(0, MAXIMO_EVENTOS)
}

export function Hero({ eventos }: HeroProps) {
  const router = useRouter()
  const colores = useColoresQPS()
  const listaRef = useRef<FlatList<DisplayEvent>>(null)
  // Única fuente del alto Y del ancho de cada diapositiva (ver el comentario
  // de arriba del archivo): nunca `Dimensions.get` a nivel de módulo.
  const { width: ancho, height: altoVentana } = useWindowDimensions()
  const alto = altoHero(altoVentana)
  const [indice, setIndice] = useState(0)
  const [lectorActivo, setLectorActivo] = useState(false)

  const slides = eventosHero(eventos)

  // WCAG 2.2.2 ("Pausa, detener, ocultar"): con el lector de pantalla
  // prendido el Hero no tiene que avanzar solo, porque quien lo usa necesita
  // su propio tiempo para escuchar cada diapositiva. Se consulta el estado
  // al montar (la promesa puede resolver después del desmonte — por eso el
  // chequeo de `montado` antes de aplicar el resultado) y se escucha el
  // evento `'screenReaderChanged'` para reaccionar si se prende o se apaga
  // mientras el Hero ya está en pantalla. El `remove()` del suscriptor vive
  // en el cleanup de ESTE `useEffect` (no en el del intervalo, que es otro).
  useEffect(() => {
    let montado = true
    AccessibilityInfo.isScreenReaderEnabled().then((habilitado) => {
      if (montado) setLectorActivo(habilitado)
    })
    const suscripcion = AccessibilityInfo.addEventListener('screenReaderChanged', (habilitado) => {
      setLectorActivo(habilitado)
    })
    return () => {
      montado = false
      suscripcion.remove()
    }
  }, [])

  // Avanza cada 5 s; se reinicia cada vez que `indice` cambia (timer propio o
  // un deslizamiento manual) y se limpia al desmontar. `lectorActivo` tiene
  // que estar en los deps: si no, cuando alguien prende TalkBack con el Hero
  // ya montado este efecto no se vuelve a ejecutar, y el `return` de abajo
  // (que hoy evita armar el `setInterval`) nunca llega a correr — el timer
  // que ya estaba corriendo sigue disparando, y el carrusel no se frena.
  useEffect(() => {
    if (slides.length <= 1) return undefined
    if (lectorActivo) return undefined

    const temporizador = setInterval(() => {
      setIndice((actual) => {
        const siguiente = (actual + 1) % slides.length
        listaRef.current?.scrollToIndex({ index: siguiente, animated: true })
        return siguiente
      })
    }, INTERVALO_MS)

    return () => clearInterval(temporizador)
  }, [indice, slides.length, lectorActivo])

  if (slides.length === 0) return null

  function irA(nuevoIndice: number) {
    setIndice(nuevoIndice)
    listaRef.current?.scrollToIndex({ index: nuevoIndice, animated: true })
  }

  function alTerminarDeDeslizar(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    if (ancho <= 0) return
    const nuevoIndice = Math.round(evento.nativeEvent.contentOffset.x / ancho)
    if (nuevoIndice !== indice && nuevoIndice >= 0 && nuevoIndice < slides.length) {
      setIndice(nuevoIndice)
    }
  }

  return (
    <View style={[estilos.contenedor, { height: alto, backgroundColor: '#000' }]}>
      <FlatList
        ref={listaRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={alTerminarDeDeslizar}
        getItemLayout={(_data, index) => ({ length: ancho, offset: ancho * index, index })}
        renderItem={({ item, index }) => (
          <DiapositivaHero
            evento={item}
            ancho={ancho}
            alto={alto}
            indice={index}
            total={slides.length}
            alCambiarIndice={irA}
            onPress={() => router.push(rutaDeEvento(item))}
          />
        )}
      />

      {slides.length > 1 ? (
        <View style={estilos.puntos} pointerEvents="box-none">
          {slides.map((item, i) => (
            <Pressable
              key={item.id}
              onPress={() => irA(i)}
              accessibilityRole="button"
              accessibilityLabel={`Ir al evento ${i + 1}`}
              hitSlop={HIT_SLOP_PUNTO}
              style={[
                estilos.punto,
                i === indice
                  ? { width: 20, backgroundColor: colores.primary }
                  : { width: 6, backgroundColor: 'rgba(255,255,255,0.4)' },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

interface DiapositivaHeroProps {
  evento: DisplayEvent
  ancho: number
  alto: number
  indice: number
  total: number
  alCambiarIndice: (nuevoIndice: number) => void
  onPress: () => void
}

function DiapositivaHero({ evento, ancho, alto, indice, total, alCambiarIndice, onPress }: DiapositivaHeroProps) {
  const colores = useColoresQPS()
  const fecha = capitalizeFirst(formatEventDate(evento.date))
  const precio = textoPrecio(evento.price)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiquetaDiapositiva(evento.title, indice, total)}
      accessibilityActions={total > 1 ? ACCIONES_HERO : undefined}
      onAccessibilityAction={(accion) => alCambiarIndice(indiceTrasAccion(accion.nativeEvent.actionName, indice, total))}
      style={[estilos.diapositiva, { width: ancho, height: alto }]}
    >
      {/* Dos `<Afiche llenar>` con la MISMA url (misma cadena de fuentes y
          mismo allow-list, sin armar nada a mano): abajo, la versión
          desenfocada a sangre (`cover` + `blurRadius`) que llena todo el
          hueco; arriba, el afiche entero sin recortar (`contain`), como pide
          la especificación. Si no hay ninguna fuente válida, la capa de
          abajo muestra la marca (fondo primary + logo) y la de arriba no
          dibuja nada (`fallback={<></>}`): así no se duplica la marca. */}
      <View style={StyleSheet.absoluteFill}>
        <Afiche
          url={evento.image}
          llenar
          ancho={800}
          resizeMode="cover"
          blurRadius={25}
          fallback={
            <View style={[estilos.marca, { backgroundColor: colores.primary }]}>
              <Image source={LOGO_MARCA} style={estilos.logoMarca} resizeMode="contain" />
            </View>
          }
        />
      </View>
      <View style={StyleSheet.absoluteFill}>
        <Afiche url={evento.image} llenar ancho={800} resizeMode="contain" fallback={<></>} />
      </View>

      {/* Degradé oscuro abajo, para que el texto se lea sobre cualquier imagen
          (4 franjas de opacidad creciente, mismo recurso que `TarjetaEvento`). */}
      <View style={estilos.degrade} pointerEvents="none">
        <View style={[estilos.franja, { opacity: 0 }]} />
        <View style={[estilos.franja, { opacity: 0.5 }]} />
        <View style={[estilos.franja, { opacity: 0.85 }]} />
        <View style={[estilos.franja, { opacity: 0.97 }]} />
      </View>

      <View style={estilos.contenido}>
        <View style={estilos.filaBadges}>
          <View style={[estilos.badge, { backgroundColor: colores.primary }]}>
            <Texto peso="bold" style={estilos.textoBadge} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
              {evento.categoryName}
            </Texto>
          </View>
          <InsigniaDestacado visible={evento.isFeatured} />
        </View>

        <Texto peso="bold" style={estilos.titulo} numberOfLines={2} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
          {evento.title}
        </Texto>

        <View style={estilos.filaDatos}>
          <View style={estilos.dato}>
            <Icono nombre="Calendar" tamanio={12} color={colores.primary} />
            <Texto style={estilos.textoDato} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
              {fecha}
              {evento.time ? ` - ${evento.time}` : ''}
            </Texto>
          </View>
          <View style={estilos.dato}>
            <Icono nombre="MapPin" tamanio={12} color={colores.primary} />
            <Texto style={estilos.textoDato} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
              {evento.venue}
            </Texto>
          </View>
        </View>

        <View style={estilos.filaAccion}>
          <View style={[estilos.botonVerDetalles, { backgroundColor: colores.primary }]}>
            <Icono nombre="Ticket" tamanio={14} color={colores.primaryForeground} />
            <Texto peso="semibold" style={estilos.textoBoton} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
              Ver detalles
            </Texto>
          </View>
          {evento.price !== 'confirmar' ? (
            <Texto peso="bold" style={estilos.textoPrecio} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
              {evento.price === 'gratis' ? 'Entrada Gratuita' : precio}
            </Texto>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  contenedor: { width: '100%', overflow: 'hidden', position: 'relative' },
  diapositiva: { overflow: 'hidden', position: 'relative', justifyContent: 'flex-end' },
  marca: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  logoMarca: { width: 56, height: 56, opacity: 0.8 },
  degrade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '35%', flexDirection: 'column' },
  franja: { flex: 1, backgroundColor: '#000' },
  contenido: { padding: 12, gap: 4 },
  filaBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '70%' },
  textoBadge: { color: '#fff', fontSize: 11 },
  titulo: { color: '#fff', fontSize: 15, lineHeight: 19 },
  filaDatos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dato: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  textoDato: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  filaAccion: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  botonVerDetalles: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  textoBoton: { color: '#fff', fontSize: 12 },
  textoPrecio: { color: '#fff', fontSize: 13 },
  puntos: { position: 'absolute', right: 10, top: 10, flexDirection: 'row', gap: 6 },
  punto: { height: 6, borderRadius: 3 },
})
