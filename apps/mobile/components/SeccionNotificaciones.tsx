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
//
// 29-c: solo el estilo (Texto, tokens de useColoresQPS y CampoTexto) — la
// lógica de arriba (estado, carga, guardado) no cambia. El texto secundario
// (antes `colors.border`, casi invisible: F4) pasa a `mutedForeground`.
//
// 33-a (QPS-146): el rojo del mensaje de error estaba escrito a mano
// (`#dc2626`), el mismo problema que F4 corrigió en `CampoTexto` y en
// `cuenta.tsx`. D1 (29-g): la app arranca siempre en oscuro, así que el
// color queda fijo (no depende de `useColorScheme()`), igual que
// `COLOR_ERROR` de `cuenta.tsx`.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native'
import { CANALES_RADAR, type CanalRadar } from '@qps/core/notificaciones/preferencias'
import { AvisoActivarPush } from '@/components/AvisoActivarPush'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando, ErrorCarga } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { guardarNotificaciones, MENSAJE_NO_DISPONIBLE, obtenerNotificaciones } from '@/lib/notificaciones'
import { useSession } from '@/lib/session'

const ETIQUETAS_CANAL: Record<CanalRadar, string> = {
  email: 'Email',
  push: 'Push',
  ambos: 'Ambos',
}

// Mismo valor que `COLOR_ERROR` de `app/(tabs)/cuenta.tsx` (33-a, QPS-146).
const COLOR_ERROR = '#f87171'

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
  const colores = useColoresQPS()
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
    return <Cargando />
  }

  if (estado.tipo === 'no-disponible') {
    return (
      <View style={estilos.seccion}>
        <Texto peso="bold" style={estilos.titulo}>Notificaciones</Texto>
        <Texto tono="secundario">{MENSAJE_NO_DISPONIBLE}</Texto>
      </View>
    )
  }

  if (estado.tipo === 'error') {
    return (
      <View style={estilos.seccion}>
        <Texto peso="bold" style={estilos.titulo}>Notificaciones</Texto>
        <ErrorCarga mensaje={estado.error} onReintentar={cargar} />
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

  // Ronda 41, 41-e, decisión 4 del plan: el canal del Radar por push no lo
  // manda el backend todavía (solo email), así que esto es honesto, no una
  // cifra ni un horario (QPS-113 sigue sin confirmar).
  const radarPorPush = radarChannel === 'push' || radarChannel === 'ambos'

  return (
    <View style={estilos.seccion}>
      <Texto peso="bold" style={estilos.titulo}>Notificaciones</Texto>

      <AvisoActivarPush variante="cuenta" />

      <View style={estilos.filaInterruptor}>
        <Texto>Recordatorios de favoritos</Texto>
        <Switch
          value={favoriteReminders}
          onValueChange={(valor) => setEstado({ ...estado, favoriteReminders: valor })}
          accessibilityLabel="Recordatorios de favoritos"
        />
      </View>

      <View style={estilos.filaInterruptor}>
        <Texto>Novedades de lo que seguís</Texto>
        <Switch
          value={followNews}
          onValueChange={(valor) => setEstado({ ...estado, followNews: valor })}
          accessibilityLabel="Novedades de lo que seguís"
        />
      </View>

      <View style={estilos.filaInterruptor}>
        <View style={estilos.filaEtiquetaConPronto}>
          <Texto>Avisos de Qué Pinta Salta</Texto>
          <Texto tono="secundario" style={estilos.etiquetaPronto}>Pronto</Texto>
        </View>
        {/* Decisión 4 del plan: visible pero apagado. El valor que la
            persona ya tenía se guarda igual (ver `guardar`, más abajo: el
            upsert manda `announcements` tal como vino de la base, nunca un
            `false` fijo). */}
        <Switch value={announcements} disabled accessibilityLabel="Avisos de Qué Pinta Salta" />
      </View>

      <Texto peso="semibold" style={estilos.subtitulo}>Canal del Radar</Texto>
      <View style={estilos.filaChips}>
        {CANALES_RADAR.map((canal) => {
          const seleccionado = radarChannel === canal
          return (
            <Pressable
              key={canal}
              onPress={() => setEstado({ ...estado, radarChannel: canal })}
              accessibilityRole="button"
              accessibilityState={{ selected: seleccionado }}
              style={[estilos.chip, { borderColor: colores.border }, seleccionado && { backgroundColor: colores.primary }]}
            >
              <Texto peso="semibold" style={{ color: seleccionado ? colores.primaryForeground : colores.foreground }}>
                {ETIQUETAS_CANAL[canal]}
              </Texto>
            </Pressable>
          )
        })}
      </View>
      {radarPorPush ? (
        <Texto tono="secundario">Por ahora el Radar te sigue llegando por email.</Texto>
      ) : null}

      <Texto peso="semibold" style={estilos.subtitulo}>Horario de silencio</Texto>
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
        <Texto style={{ color: mensaje.tipo === 'error' ? COLOR_ERROR : colores.foreground }}>{mensaje.texto}</Texto>
      ) : null}

      <Pressable
        onPress={guardar}
        disabled={guardando}
        accessibilityRole="button"
        accessibilityState={{ busy: guardando }}
        style={[estilos.boton, { borderColor: colores.border, backgroundColor: colores.primary, marginTop: 8 }]}
      >
        {guardando ? (
          <ActivityIndicator color={colores.primaryForeground} />
        ) : (
          <Texto peso="semibold" style={{ color: colores.primaryForeground }}>Guardar notificaciones</Texto>
        )}
      </Pressable>
    </View>
  )
}

// El peso (bold/semibold) ya lo da `Texto` (Montserrat); acá solo tamaño y
// separación — nada de fontWeight, que no pega con una fuente custom.
const estilos = StyleSheet.create({
  seccion: { width: '100%', gap: 8, paddingVertical: 16 },
  titulo: { fontSize: 16 },
  subtitulo: { marginTop: 8 },
  filaInterruptor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filaEtiquetaConPronto: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  etiquetaPronto: { fontSize: 11, textTransform: 'uppercase' },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  filaHorario: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  campoHorario: { flex: 1 },
  textoHorario: { textAlign: 'center' },
  boton: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
})
