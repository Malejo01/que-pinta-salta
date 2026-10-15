// Ficha de un evento (R26, 26-b). El `id` de la ruta se valida como uuid
// antes de pedir nada a la red (esUuid, sin cambios desde el esqueleto).
// "Comprar" y "Cómo llegar" solo abren `urlGo`/`urlComoLlegar` de
// `@qps/core/metricas/links`: nunca el `ticket_url` directo — ese link no
// cuenta el clic ni valida el destino.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import * as Linking from 'expo-linking'
import { Redirect, useLocalSearchParams, useRouter, useTheme } from 'expo-router'
import { formatEventDate } from '@qps/core/date-format'
import { capitalizeFirst, cleanDescription, formatEventTimeDisplay, formatPriceDisplay } from '@qps/core/event-display'
import { urlComoLlegar, urlEvento, urlGo } from '@qps/core/metricas/links'
import { ticketUrlsOf } from '@qps/core/scraper/dedup-key'
import { Afiche } from '@/components/Afiche'
import { BotonesAsistencia } from '@/components/BotonesAsistencia'
import { BotonFavorito } from '@/components/BotonFavorito'
import { useColoresQPS } from '@/lib/colores'
import { obtenerEventoPorId, type ResultadoEvento } from '@/lib/datos/eventos'
import { esUuid } from '@/lib/links'

type Estado = { tipo: 'cargando' } | ResultadoEvento

export default function EventoPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()
  // El ancho de la ventana se lee con `useWindowDimensions()`, nunca con
  // `Dimensions` a nivel de módulo (QPS-132): así reacciona a una rotación o
  // a un cambio de tamaño sin reiniciar la app.
  const { width } = useWindowDimensions()
  const anchoAfiche = width - 32

  const valido = esUuid(id)

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })

  const cargar = useCallback(async () => {
    if (!valido) return
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerEventoPorId(id)
    setEstado(resultado)
  }, [id, valido])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!valido) {
    return <Redirect href="/" />
  }

  if (estado.tipo === 'cargando') {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    )
  }

  if (estado.tipo === 'no-encontrado') {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Este evento ya no está disponible.</Text>
        <Pressable
          onPress={() => router.replace('/')}
          style={[estilos.boton, { borderColor: colors.border, marginTop: 12 }]}
        >
          <Text style={[estilos.textoBoton, { color: colors.text }]}>Volver a Inicio</Text>
        </Pressable>
      </View>
    )
  }

  if (estado.tipo === 'error') {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>{estado.error}</Text>
        <Pressable onPress={cargar} style={[estilos.boton, { borderColor: colors.border, marginTop: 12 }]}>
          <Text style={[estilos.textoBoton, { color: colors.text }]}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  const { evento } = estado
  const fecha = capitalizeFirst(formatEventDate(evento.start_date, true))
  const hora = formatEventTimeDisplay(evento.start_date)
  const precio = formatPriceDisplay({ is_free: evento.is_free, price_min: evento.price_min })
  const descripcion = cleanDescription(evento.description) ?? cleanDescription(evento.short_description)
  const lugar = evento.venue?.name || 'Lugar por confirmar'
  const direccion = evento.venue?.address || ''

  const tieneTicket = ticketUrlsOf({ ticket_url: evento.ticket_url, ticket_sources: evento.ticket_sources }).size > 0
  const urlCompra = urlGo(evento.id, 'app')
  const urlLlegar = urlComoLlegar({ address: evento.venue?.address, venue: evento.venue?.name })

  async function compartir() {
    const url = urlEvento(evento.id, 'app')
    if (!url) return
    const mensaje = `${evento.title}\n${fecha}${hora ? ` · ${hora} hs` : ''} · ${lugar}\n${url}`
    try {
      await Share.share({ message: mensaje })
    } catch {
      // El usuario canceló o no hay con qué compartir: no es un error que mostrar.
    }
  }

  function comprar() {
    if (urlCompra) Linking.openURL(urlCompra).catch(() => {})
  }

  function comoLlegar() {
    if (urlLlegar) Linking.openURL(urlLlegar).catch(() => {})
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={estilos.contenido}>
      <Afiche url={evento.image_url} estilo={{ width: anchoAfiche, height: 320, borderRadius: 12 }} />

      <Text style={[estilos.titulo, { color: colors.text }]}>{evento.title}</Text>
      <Text style={{ color: colores.mutedForeground }}>
        {fecha}
        {hora ? ` · ${hora} hs` : ''}
      </Text>

      <View>
        <Text style={[estilos.lugar, { color: colors.text }]}>{lugar}</Text>
        {direccion ? <Text style={{ color: colores.mutedForeground }}>{direccion}</Text> : null}
      </View>

      <Text style={[estilos.precio, { color: colors.text }]}>{precio}</Text>

      {descripcion ? <Text style={{ color: colors.text }}>{descripcion}</Text> : null}

      <BotonesAsistencia eventId={evento.id} />

      <View style={estilos.filaBotones}>
        <BotonFavorito eventId={evento.id} />

        <Pressable onPress={compartir} style={[estilos.boton, { borderColor: colors.border }]}>
          <Text style={[estilos.textoBoton, { color: colors.text }]}>Compartir</Text>
        </Pressable>

        {urlLlegar ? (
          <Pressable onPress={comoLlegar} style={[estilos.boton, { borderColor: colors.border }]}>
            <Text style={[estilos.textoBoton, { color: colors.text }]}>Cómo llegar</Text>
          </Pressable>
        ) : null}

        {tieneTicket && urlCompra ? (
          <Pressable onPress={comprar} style={[estilos.boton, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <Text style={[estilos.textoBoton, { color: colores.primaryForeground }]}>Comprar entrada</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  titulo: { fontSize: 22, fontWeight: '700' },
  lugar: { fontWeight: '600' },
  precio: { fontWeight: '700', fontSize: 17 },
  filaBotones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  textoBoton: { fontWeight: '600' },
})
