// Ficha de un evento (R26, 26-b; R29, 29-b: F14, ops/paridad-web-app.md
// §3.4). El `id` de la ruta se valida como uuid antes de pedir nada a la
// red (esUuid, sin cambios desde el esqueleto). "Comprar" y "Cómo llegar"
// solo abren `urlGo`/`urlComoLlegar` de `@qps/core/metricas/links`: nunca el
// `ticket_url` directo — ese link no cuenta el clic ni valida el destino.
//
// Orden de la web real (apéndice del plan de la R29, decisión 2): imagen →
// título → filas de datos → descripción → caja de precio → CTAs apilados
// ("Como llegar" primero, "Comprar tickets" después) → fila de acciones
// (debajo de los CTAs). El armado del mensaje de compartir vive en
// `BotonCompartir` (ver `tests/compartir-ficha.test.ts`).
//
// R47, tarea 47-f (QPS-197): el corazón y Compartir, que antes vivían
// sueltos junto al título (`accionesTitulo`), y "Voy/Me interesa"
// (`BotonesAsistencia`, debajo de los CTAs) se reemplazan por
// `FilaAccionesEvento` (♥ Guardar · ✓ Voy · Compartir, en ese orden fijado
// por `@qps/core/asistencia`), en el mismo lugar donde estaba
// `BotonesAsistencia`. El lugar (ícono `MapPin`) suma "+ Seguir"
// (`BotonSeguir`), y debajo, si el evento tiene una cuenta de Instagram
// asociada, "Seguir @cuenta" — los dos con los datos de
// `obtenerSeguimientoDeEvento` (`lib/radar.ts`).
//
// Integración de la tanda 2 de la R29: la imagen pide la variante WebP 800
// (`<Afiche ancho={800} />`), como la web (`FlyerImage` con `variant={800}`
// en `event-detail-page.tsx`) — 29-b la había dejado en 400 (el valor por
// defecto de `fuentesDeImagen`) porque `lib/imagenes/url-segura.ts` y
// `components/Afiche.tsx` no estaban en sus archivos permitidos.
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import * as Linking from 'expo-linking'
import { Redirect, useLocalSearchParams, useRouter, useTheme } from 'expo-router'
import { formatEventDate } from '@qps/core/date-format'
import { capitalizeFirst, cleanDescription, formatEventTimeDisplay } from '@qps/core/event-display'
import { urlComoLlegar, urlGo } from '@qps/core/metricas/links'
import { vibeLabels } from '@qps/core/types'
import { Afiche } from '@/components/Afiche'
import { BotonCalendario } from '@/components/BotonCalendario'
import { BotonSeguir } from '@/components/BotonSeguir'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { FilaAccionesEvento } from '@/components/FilaAccionesEvento'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { ESCALA_MAXIMA_COMPACTA } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { datosTarjetaCompartir } from '@/lib/compartir'
import { obtenerEventoPorId, type ResultadoEvento } from '@/lib/datos/eventos'
import { textoPrecio, type PrecioEvento } from '@/lib/formato'
import { esUuid } from '@/lib/links'
import { obtenerSeguimientoDeEvento, type SeguimientoDeEvento } from '@/lib/radar'
import { useSession } from '@/lib/session'
import { useVistaEvento } from '@/lib/metricas-hook'

type Estado = { tipo: 'cargando' } | ResultadoEvento

export default function EventoPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()
  const { session } = useSession()
  const userId = session?.user.id ?? null
  // El ancho de la ventana se lee con `useWindowDimensions()`, nunca con
  // `Dimensions` a nivel de módulo (QPS-132): así reacciona a una rotación o
  // a un cambio de tamaño sin reiniciar la app.
  const { width } = useWindowDimensions()
  const anchoAfiche = width - 32

  const valido = esUuid(id)

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Cuenta de "reintentos" (mismo patrón que `app/pelicula/[id].tsx`, 28-l):
  // el efecto no puede llamar, de forma sincrónica, a una función que haga
  // `setState` (lint react-hooks/set-state-in-effect). El fetch va inline en
  // el efecto con `.then()`; "Reintentar" solo sube este contador para que
  // el efecto se repita.
  const [intento, setIntento] = useState(0)

  // Si el `id` de la ruta cambia con la ficha ya montada, hay que volver a
  // "cargando" antes de que el efecto dispare el fetch nuevo (comparar-y-
  // ajustar con `useState` durante el render, no con `useRef`: ver
  // `app/pelicula/[id].tsx`).
  const [idAnterior, setIdAnterior] = useState(id)
  if (idAnterior !== id) {
    setIdAnterior(id)
    setEstado({ tipo: 'cargando' })
  }

  useEffect(() => {
    if (!valido) return
    let cancelado = false

    obtenerEventoPorId(id).then((resultado) => {
      if (!cancelado) setEstado(resultado)
    })

    return () => {
      cancelado = true
    }
  }, [id, valido, intento])

  // El lugar y la cuenta de Instagram que esta ficha puede ofrecer seguir
  // (R47, tarea 47-f, QPS-197), con `BotonSeguir`. `null` hasta que resuelva
  // (y si falla: `obtenerSeguimientoDeEvento` nunca tira, devuelve
  // `{ lugar: null, cuenta: null }`, así que la ficha sigue andando igual,
  // solo sin esos botones).
  const [seguimiento, setSeguimiento] = useState<SeguimientoDeEvento | null>(null)

  useEffect(() => {
    if (!valido) return
    let cancelado = false

    obtenerSeguimientoDeEvento(id, userId).then((resultado) => {
      if (!cancelado) setSeguimiento(resultado)
    })

    return () => {
      cancelado = true
    }
  }, [id, userId, valido])

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setIntento((valor) => valor + 1)
  }, [])

  // La vista de la ficha, con origen `app` (43-e): una sola vez por montaje
  // y por evento, solo cuando cargó bien. Arriba de los `return` tempranos
  // de abajo, por las reglas de los hooks.
  useVistaEvento(estado.tipo === 'ok' ? estado.evento.id : null)

  if (!valido) {
    return <Redirect href="/" />
  }

  if (estado.tipo === 'cargando') {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background }]}>
        <Cargando />
      </View>
    )
  }

  if (estado.tipo === 'no-encontrado') {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background }]}>
        <Vacio mensaje="Este evento ya no está disponible." textoAccion="Volver a Inicio" onAccion={() => router.replace('/')} />
      </View>
    )
  }

  if (estado.tipo === 'error') {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background }]}>
        <ErrorCarga mensaje={estado.error} onReintentar={cargar} />
      </View>
    )
  }

  const { evento } = estado
  const fecha = capitalizeFirst(formatEventDate(evento.start_date, true))
  const hora = formatEventTimeDisplay(evento.start_date)
  const descripcion = cleanDescription(evento.description) ?? cleanDescription(evento.short_description)
  const lugar = evento.venue?.name || 'Lugar por confirmar'
  const direccion = evento.venue?.address || ''
  const categoryName = evento.category?.name || 'Sin categorizar'
  const vibe = evento.age_restriction >= 18 ? 'adultos' : null

  // Mismo criterio que la web (`event-detail-page.tsx`): "gratis", "confirmar"
  // (precio en 0 sin marcar gratis, se oculta la caja) o un número.
  const precioEvento: PrecioEvento = evento.is_free ? 'gratis' : evento.price_min === 0 ? 'confirmar' : evento.price_min
  const precioTexto = precioEvento === 'gratis' ? 'Entrada Gratuita' : textoPrecio(precioEvento)

  // Como la web (`displayEvent.ticketUrl &&`, en `event-detail-page.tsx`):
  // `/go/<id>` solo redirige a `events.ticket_url` (`urlGo`/`urlCompra` de
  // abajo); con solo `ticket_sources` el botón llevaba a la ficha web, que
  // no cuenta el clic.
  const tieneTicket = Boolean(evento.ticket_url?.trim())
  const urlCompra = urlGo(evento.id, 'app')
  const urlLlegar = urlComoLlegar({ address: evento.venue?.address, venue: evento.venue?.name })

  function comprar() {
    if (urlCompra) Linking.openURL(urlCompra).catch(() => {})
  }

  function comoLlegar() {
    if (urlLlegar) Linking.openURL(urlLlegar).catch(() => {})
  }

  return (
    <ScrollView style={{ backgroundColor: colores.background }} contentContainerStyle={estilos.contenido}>
      <View style={[estilos.contenedorImagen, { width: anchoAfiche, aspectRatio: 3 / 4, borderRadius: 16 }]}>
        <Afiche url={evento.image_url} llenar ancho={800} />
        <View style={[estilos.badgeCategoria, { backgroundColor: colores.primary }]}>
          <Texto peso="bold" style={[estilos.textoBadge, { color: colores.primaryForeground }]} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
            {categoryName}
          </Texto>
        </View>
      </View>

      {/* El corazón y Compartir se mudaron a FilaAccionesEvento (R47, 47-f,
          QPS-197): ya no van sueltos junto al título (antes, acá, con
          `estilos.accionesTitulo`). */}
      <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
        {evento.title}
      </Texto>

      <View style={estilos.filasDatos}>
        <View style={estilos.filaDato}>
          <Icono nombre="Calendar" tamanio={20} color={colores.primary} />
          <Texto tono="secundario">{fecha}</Texto>
        </View>

        {hora ? (
          <View style={estilos.filaDato}>
            <Icono nombre="Clock" tamanio={20} color={colores.primary} />
            <Texto tono="secundario">{hora} hs</Texto>
          </View>
        ) : null}

        <View style={estilos.filaDato}>
          <Icono nombre="MapPin" tamanio={20} color={colores.primary} />
          <View style={estilos.lugarTexto}>
            <Texto peso="semibold">{lugar}</Texto>
            {direccion ? (
              <Texto tono="secundario" style={estilos.direccion}>
                {direccion}
              </Texto>
            ) : null}
          </View>
          {seguimiento?.lugar ? (
            <BotonSeguir
              tipo="lugar"
              id={seguimiento.lugar.id}
              etiqueta={seguimiento.lugar.nombre}
              siguiendoInicial={seguimiento.lugar.siguiendo}
            />
          ) : null}
        </View>

        {seguimiento?.cuenta ? (
          <BotonSeguir
            tipo="cuenta"
            id={seguimiento.cuenta.id}
            etiqueta={seguimiento.cuenta.username}
            siguiendoInicial={seguimiento.cuenta.siguiendo}
          />
        ) : null}

        {vibe ? (
          <View style={estilos.filaDato}>
            <Icono nombre="Users" tamanio={20} color={colores.primary} />
            <Texto tono="secundario">{vibeLabels[vibe]}</Texto>
          </View>
        ) : null}
      </View>

      {descripcion ? <Texto tono="secundario">{descripcion}</Texto> : null}

      {precioTexto ? (
        <View style={[estilos.cajaPrecio, { backgroundColor: colores.muted }]}>
          <Texto tono="secundario" style={estilos.etiquetaPrecio}>
            Precio de entrada
          </Texto>
          <Texto peso="bold" style={estilos.valorPrecio}>
            {precioTexto}
          </Texto>
        </View>
      ) : null}

      <View style={estilos.ctas}>
        {urlLlegar ? (
          <Pressable onPress={comoLlegar} accessibilityRole="link" style={[estilos.ctaPrimario, { backgroundColor: colores.primary }]}>
            <Icono nombre="Navigation" tamanio={18} color={colores.primaryForeground} />
            <Texto peso="semibold" style={{ color: colores.primaryForeground }}>
              Como llegar
            </Texto>
          </Pressable>
        ) : null}

        {tieneTicket && urlCompra ? (
          <Pressable onPress={comprar} accessibilityRole="link" style={[estilos.ctaOutline, { borderColor: colores.border }]}>
            <Icono nombre="ExternalLink" tamanio={18} color={colores.foreground} />
            <Texto peso="semibold">Comprar tickets</Texto>
          </Pressable>
        ) : null}

        <BotonCalendario evento={evento} />
      </View>

      <FilaAccionesEvento
        eventId={evento.id}
        titulo={evento.title}
        fecha={fecha}
        hora={hora}
        lugar={lugar}
        status={evento.status}
        tarjeta={datosTarjetaCompartir(evento) ?? undefined}
      />
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 16 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  contenedorImagen: { overflow: 'hidden', position: 'relative' },
  badgeCategoria: { position: 'absolute', left: 12, top: 12, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '70%' },
  textoBadge: { fontSize: 12 },
  // `filaTitulo`/`accionesTitulo` (el corazón y Compartir junto al título)
  // se sacaron en la R47 (47-f, QPS-197): se mudaron a FilaAccionesEvento.
  titulo: { fontSize: 30, lineHeight: 36 },
  filasDatos: { gap: 12 },
  filaDato: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lugarTexto: { flex: 1, gap: 2 },
  direccion: { fontSize: 13 },
  cajaPrecio: { borderRadius: 12, padding: 24 },
  etiquetaPrecio: { fontSize: 13, marginBottom: 4 },
  valorPrecio: { fontSize: 26 },
  ctas: { gap: 12 },
  ctaPrimario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14 },
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, borderWidth: 1 },
})
