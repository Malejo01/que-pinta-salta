// Sección de notificaciones en Cuenta (R27, 27-b): recordatorios de
// favoritos, novedades de lo que seguís, avisos de Qué Pinta Salta, el
// canal del Radar y el horario de silencio. Solo se muestra con sesión (lo
// decide `app/(tabs)/cuenta.tsx`); el `userId` sale de `useSession()`
// adentro de este componente, nunca de una prop.
//
// `notification_preferences` no está en producción todavía: si
// `obtenerNotificaciones`/`guardarNotificaciones` devuelven `'no-disponible'`,
// se muestra `MENSAJE_NO_DISPONIBLE` sin romper el resto de Cuenta.
//
// Horario de silencio: sin selector de hora de ninguna librería — un campo
// de texto "HH:MM" que valida `validarPreferenciasNotificacion` de core al
// guardar.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { useTheme } from 'expo-router'
import { CANALES_RADAR, type CanalRadar } from '@qps/core/notificaciones/preferencias'
import { CampoTexto } from '@/components/CampoTexto'
import { guardarNotificaciones, MENSAJE_NO_DISPONIBLE, obtenerNotificaciones } from '@/lib/notificaciones'
import { useSession } from '@/lib/session'

const ETIQUETAS_CANAL: Record<CanalRadar, string> = {
  email: 'Email',
  push: 'Push',
  ambos: 'Ambos',
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'no-disponible' }
  | { tipo: 'error'; error: string }
  | {
      tipo: 'ok'
      radarChannel: CanalRadar
      favoriteReminders: boolean
      followNews: boolean
      announcements: boolean
      quietStart: string
      quietEnd: string
    }

export function SeccionNotificaciones() {
  const { colors } = useTheme()
  const { session } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    if (!userId) return
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerNotificaciones(userId)
    if (resultado.tipo === 'no-disponible') {
      setEstado({ tipo: 'no-disponible' })
      return
    }
    if (resultado.tipo === 'error') {
      setEstado({ tipo: 'error', error: resultado.error })
      return
    }
    setEstado({
      tipo: 'ok',
      radarChannel: resultado.preferencias.radar_channel,
      favoriteReminders: resultado.preferencias.favorite_reminders,
      followNews: resultado.preferencias.follow_news,
      announcements: resultado.preferencias.announcements,
      quietStart: resultado.preferencias.quiet_start,
      quietEnd: resultado.preferencias.quiet_end,
    })
  }, [userId])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!userId) return null

  if (estado.tipo === 'cargando') {
    return <ActivityIndicator style={estilos.espaciado} />
  }

  if (estado.tipo === 'no-disponible') {
    return (
      <View style={estilos.seccion}>
        <Text style={[estilos.titulo, { color: colors.text }]}>Notificaciones</Text>
        <Text style={{ color: colors.border }}>{MENSAJE_NO_DISPONIBLE}</Text>
      </View>
    )
  }

  if (estado.tipo === 'error') {
    return (
      <View style={estilos.seccion}>
        <Text style={[estilos.titulo, { color: colors.text }]}>Notificaciones</Text>
        <Text style={{ color: colors.text }}>{estado.error}</Text>
        <Pressable onPress={cargar} style={[estilos.boton, { borderColor: colors.border, marginTop: 8 }]}>
          <Text style={[estilos.textoBoton, { color: colors.text }]}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  const { radarChannel, favoriteReminders, followNews, announcements, quietStart, quietEnd } = estado

  async function guardar() {
    if (!userId || guardando) return
    setGuardando(true)
    setMensaje(null)
    const resultado = await guardarNotificaciones(userId, {
      radar_channel: radarChannel,
      favorite_reminders: favoriteReminders,
      follow_news: followNews,
      announcements,
      quiet_start: quietStart,
      quiet_end: quietEnd,
    })
    if (resultado.tipo === 'no-disponible') {
      setEstado({ tipo: 'no-disponible' })
    } else if (resultado.tipo === 'error') {
      setMensaje({ tipo: 'error', texto: resultado.error })
    } else {
      setMensaje({ tipo: 'ok', texto: 'Guardamos tus notificaciones.' })
    }
    setGuardando(false)
  }

  return (
    <View style={estilos.seccion}>
      <Text style={[estilos.titulo, { color: colors.text }]}>Notificaciones</Text>

      <View style={estilos.filaInterruptor}>
        <Text style={{ color: colors.text }}>Recordatorios de favoritos</Text>
        <Switch value={favoriteReminders} onValueChange={(valor) => setEstado({ ...estado, favoriteReminders: valor })} />
      </View>

      <View style={estilos.filaInterruptor}>
        <Text style={{ color: colors.text }}>Novedades de lo que seguís</Text>
        <Switch value={followNews} onValueChange={(valor) => setEstado({ ...estado, followNews: valor })} />
      </View>

      <View style={estilos.filaInterruptor}>
        <Text style={{ color: colors.text }}>Avisos de Qué Pinta Salta</Text>
        <Switch value={announcements} onValueChange={(valor) => setEstado({ ...estado, announcements: valor })} />
      </View>

      <Text style={[estilos.subtitulo, { color: colors.text }]}>Canal del Radar</Text>
      <View style={estilos.filaChips}>
        {CANALES_RADAR.map((canal) => {
          const seleccionado = radarChannel === canal
          return (
            <Pressable
              key={canal}
              onPress={() => setEstado({ ...estado, radarChannel: canal })}
              style={[estilos.chip, { borderColor: colors.border }, seleccionado && { backgroundColor: colors.primary }]}
            >
              <Text style={[estilos.textoChip, { color: seleccionado ? '#fff' : colors.text }]}>
                {ETIQUETAS_CANAL[canal]}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={[estilos.subtitulo, { color: colors.text }]}>Horario de silencio</Text>
      <View style={estilos.filaHorario}>
        <View style={estilos.campoHorario}>
          <CampoTexto
            label="Desde"
            value={quietStart}
            onChangeText={(valor) => setEstado({ ...estado, quietStart: valor })}
            placeholder="23:00"
            style={estilos.textoHorario}
          />
        </View>
        <View style={estilos.campoHorario}>
          <CampoTexto
            label="Hasta"
            value={quietEnd}
            onChangeText={(valor) => setEstado({ ...estado, quietEnd: valor })}
            placeholder="09:00"
            style={estilos.textoHorario}
          />
        </View>
      </View>

      {mensaje ? (
        <Text style={{ color: mensaje.tipo === 'error' ? '#dc2626' : colors.text }}>{mensaje.texto}</Text>
      ) : null}

      <Pressable
        onPress={guardar}
        disabled={guardando}
        style={[estilos.boton, { borderColor: colors.border, backgroundColor: colors.primary, marginTop: 8 }]}
      >
        {guardando ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[estilos.textoBoton, { color: '#fff' }]}>Guardar notificaciones</Text>
        )}
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { width: '100%', gap: 8, paddingVertical: 16 },
  titulo: { fontSize: 16, fontWeight: '700' },
  subtitulo: { fontWeight: '600', marginTop: 8 },
  espaciado: { marginTop: 16 },
  filaInterruptor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  textoChip: { fontWeight: '600' },
  filaHorario: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  campoHorario: { flex: 1 },
  textoHorario: { textAlign: 'center' },
  boton: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  textoBoton: { fontWeight: '600' },
})
