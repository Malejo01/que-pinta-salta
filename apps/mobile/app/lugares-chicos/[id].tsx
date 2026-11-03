// Q5-4 · La ficha de un lugar para chicos en la app: tipo, edades, horarios de
// la semana (o «Espacio abierto» / «Con reserva»), acceso, accesibilidad
// verificada, «Verificado el…», contacto del lugar y «Cómo llegar», que abre
// la app de mapas con la dirección del lugar (nunca con la posición de nadie).
// Si vino de OpenStreetMap, la atribución «© colaboradores de OpenStreetMap».
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import * as Linking from 'expo-linking'
import { BotonSeguir } from '@/components/BotonSeguir'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { obtenerLugaresChicos } from '@/lib/datos/lugares-chicos'
import { urlContactoLugar } from '@/lib/links'
import { siguesElLugar } from '@/lib/radar'
import { useSession } from '@/lib/session'
import { LEYENDA_LUGARES, fechaVerificado } from '@/lib/lugares-chicos'
import { urlComoLlegar } from '@qps/core/metricas/links'
import {
  ATRIBUCION_OSM,
  ETIQUETA_ACCESO,
  ETIQUETA_TECHADO,
  ETIQUETA_TIPO,
  accesibilidadVerificada,
  estadoDeRevision,
  filasDeHorarios,
  textoEdades,
  textoHorarioDeHoy,
} from '@qps/core/lugares/permanentes'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'ok'; lugar: LugarChicosMapa | null }

export default function FichaLugarChicos() {
  const colores = useColoresQPS()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [ahora, setAhora] = useState(() => new Date())
  // Q5-6: «Seguir» el lugar. `null` hasta saber si ya lo sigue (el botón no se dibuja antes).
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const [siguiendo, setSiguiendo] = useState<boolean | null>(null)

  useEffect(() => {
    let vigente = true
    siguesElLugar(id, userId).then((valor) => {
      if (vigente) setSiguiendo(valor)
    })
    return () => {
      vigente = false
    }
  }, [id, userId])

  useEffect(() => {
    let cancelado = false
    obtenerLugaresChicos().then((r) => {
      if (cancelado) return
      setAhora(new Date())
      setEstado(r.ok ? { tipo: 'ok', lugar: r.lugares.find((l) => l.venueId === id) ?? null } : { tipo: 'error', error: r.error })
    })
    return () => {
      cancelado = true
    }
  }, [id, intento])

  if (estado.tipo === 'cargando') return <Cargando />
  if (estado.tipo === 'error') {
    return (
      <ErrorCarga
        mensaje={estado.error}
        onReintentar={() => {
          setEstado({ tipo: 'cargando' })
          setIntento((n) => n + 1)
        }}
      />
    )
  }
  const lugar = estado.lugar
  if (!lugar) return <Vacio mensaje="Este lugar ya no está publicado." />

  const llegar = urlComoLlegar({ address: `${lugar.nombre}, ${lugar.direccion}, Salta` })
  const accesibilidad = accesibilidadVerificada({
    tiene_rampa: lugar.tieneRampa,
    tiene_bano_adaptado: lugar.tieneBanoAdaptado,
    tiene_cambiador: lugar.tieneCambiador,
  })
  const urlWeb = urlContactoLugar(lugar.web, 'web')
  const urlInstagram = urlContactoLugar(lugar.instagram, 'instagram')
  const urlTelefono = urlContactoLugar(lugar.telefono, 'tel')
  const urlOsm = urlContactoLugar(null, 'osm')
  const abrirLlegar = () => {
    if (llegar) void Linking.openURL(llegar)
  }
  const abrirWeb = () => {
    if (urlWeb) void Linking.openURL(urlWeb)
  }
  const abrirInstagram = () => {
    if (urlInstagram) void Linking.openURL(urlInstagram)
  }
  const llamar = () => {
    if (urlTelefono) void Linking.openURL(urlTelefono)
  }
  const abrirLicenciaOsm = () => {
    if (urlOsm) void Linking.openURL(urlOsm)
  }
  const reserva = lugar.horarios.solo_con_reserva === true

  return (
    <ScrollView style={{ backgroundColor: colores.background }} contentContainerStyle={estilos.contenido}>
      <Stack.Screen options={{ title: 'Lugar para chicos' }} />
      <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
        {lugar.nombre}
      </Texto>
      <Texto tono="secundario">
        {ETIQUETA_TIPO.es[lugar.tipo]} · {textoEdades(lugar.edadMin, lugar.edadMax)}
      </Texto>
      <Texto tono="secundario">{lugar.direccion}</Texto>
      {lugar.descripcion ? <Texto>{lugar.descripcion}</Texto> : null}
      {siguiendo !== null ? (
        // `key`: si cambia la sesión, el botón arranca con el estado nuevo.
        <BotonSeguir key={`${userId ?? 'sin-sesion'}-${siguiendo}`} tipo="lugar" id={lugar.venueId} etiqueta={lugar.nombre} siguiendoInicial={siguiendo} />
      ) : null}

      {llegar ? (
        <Pressable onPress={abrirLlegar} accessibilityRole="link" accessibilityLabel={`Cómo llegar a ${lugar.nombre}`} style={[estilos.ctaLlegar, { backgroundColor: colores.primary }]}>
          <Icono nombre="Navigation" tamanio={18} color={colores.primaryForeground} />
          <Texto peso="bold" style={{ color: colores.primaryForeground }}>
            Cómo llegar
          </Texto>
        </Pressable>
      ) : null}

      <View style={[estilos.bloque, { borderColor: colores.border }]}>
        <Texto peso="semibold" accessibilityRole="header">
          Horarios
        </Texto>
        {reserva ? (
          <Texto peso="semibold">Con reserva: escribiles o llamalos antes de ir.</Texto>
        ) : lugar.horarios.siempre_abierto ? (
          <Texto>Espacio abierto</Texto>
        ) : (
          <>
            <Texto>{textoHorarioDeHoy(lugar.horarios, ahora)}</Texto>
            {filasDeHorarios(lugar.horarios).map((fila) => (
              <View key={fila.dia} style={estilos.filaHorario} accessible accessibilityLabel={`${fila.etiqueta}: ${fila.texto}`}>
                <Texto>{fila.etiqueta}</Texto>
                <Texto tono="secundario">{fila.texto}</Texto>
              </View>
            ))}
          </>
        )}
        {lugar.horarios.nota ? <Texto tono="secundario">{lugar.horarios.nota}</Texto> : null}
      </View>

      <View style={[estilos.bloque, { borderColor: colores.border }]}>
        <Texto>
          {ETIQUETA_ACCESO.es[lugar.acceso]}
          {lugar.notaPrecio ? ` · ${lugar.notaPrecio}` : ''}
          {lugar.techado ? ` · ${ETIQUETA_TECHADO.es[lugar.techado]}` : ''}
        </Texto>
        {accesibilidad.length > 0 ? <Texto>{accesibilidad.join(' · ')}</Texto> : null}
        {lugar.verificadoAt ? <Texto tono="secundario">Verificado el {fechaVerificado(lugar.verificadoAt)}</Texto> : null}
        {estadoDeRevision(lugar.tipo, lugar.verificadoAt, ahora) === 'puede_haber_cambiado' ? (
          <Texto peso="semibold">Puede haber cambiado: confirmá antes de ir.</Texto>
        ) : null}
      </View>

      <View style={estilos.filaContacto}>
        {urlWeb ? (
          <Pressable onPress={abrirWeb} accessibilityRole="link" accessibilityLabel={`Web de ${lugar.nombre}`} style={[estilos.botonContacto, { borderColor: colores.border }]}>
            <Texto peso="semibold">Web</Texto>
          </Pressable>
        ) : null}
        {urlInstagram ? (
          <Pressable onPress={abrirInstagram} accessibilityRole="link" accessibilityLabel={`Instagram de ${lugar.nombre}`} style={[estilos.botonContacto, { borderColor: colores.border }]}>
            <Texto peso="semibold">Instagram</Texto>
          </Pressable>
        ) : null}
        {urlTelefono ? (
          <Pressable onPress={llamar} accessibilityRole="link" accessibilityLabel={`Llamar a ${lugar.nombre}`} style={[estilos.botonContacto, { borderColor: colores.border }]}>
            <Texto peso="semibold">Llamar</Texto>
          </Pressable>
        ) : null}
      </View>

      <Texto tono="secundario" style={estilos.leyenda}>
        {LEYENDA_LUGARES}
      </Texto>
      {lugar.deOsm ? (
        <Pressable onPress={abrirLicenciaOsm} accessibilityRole="link" style={estilos.botonOsm}>
          <Texto tono="secundario" style={estilos.leyenda}>
            {ATRIBUCION_OSM.es}
          </Texto>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  titulo: { fontSize: 24 },
  ctaLlegar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  bloque: { gap: 6, borderTopWidth: 1, paddingTop: 12 },
  filaHorario: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  filaContacto: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botonContacto: { minHeight: 48, minWidth: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  botonOsm: { minHeight: 48, justifyContent: 'center' },
  leyenda: { fontSize: 12 },
})
