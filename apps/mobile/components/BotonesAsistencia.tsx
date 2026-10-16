// "Voy" / "Me interesa" de la ficha (R26, 26-b). Sin sesión, los botones
// invitan a entrar (van a Cuenta); con sesión, marcan/desmarcan con
// `lib/asistencia.ts`. Si la tabla o la vista todavía no existen en este
// entorno (producción hasta el jueves), se muestra "Pronto vas a poder
// marcar si vas" y el resto de la ficha sigue andando. Nunca se muestra
// quién marcó: solo las cantidades.
//
// 33-a (QPS-147): el texto secundario usaba `colors.border` (el token de
// borde de `useTheme()`, casi invisible en tema claro); pasa a
// `colores.mutedForeground` (`useColoresQPS`, QPS-126) — mismo token que ya
// usan `EstadoCarga`/`PantallaRadar`/`SeccionNotificaciones` para sus
// mensajes secundarios. `colors.border` sigue para los bordes (no es texto).
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import {
  MENSAJE_NO_DISPONIBLE,
  marcarAsistencia,
  obtenerAsistencia,
  type EstadoAsistencia,
  type TipoAsistencia,
} from '@/lib/asistencia'
import { useColoresQPS } from '@/lib/colores'
import { useSession } from '@/lib/session'

export interface BotonesAsistenciaProps {
  eventId: string
}

type Estado = { tipo: 'cargando' } | EstadoAsistencia

const ETIQUETAS: Record<TipoAsistencia, string> = {
  voy: 'Voy',
  me_interesa: 'Me interesa',
}

export function BotonesAsistencia({ eventId }: BotonesAsistenciaProps) {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [marcando, setMarcando] = useState<TipoAsistencia | null>(null)

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerAsistencia(eventId, userId)
    setEstado(resultado)
  }, [eventId, userId])

  useEffect(() => {
    if (cargandoSesion) return
    cargar()
  }, [cargandoSesion, cargar])

  if (cargandoSesion || estado.tipo === 'cargando') {
    return <ActivityIndicator style={estilos.espaciado} />
  }

  if (estado.tipo === 'no-disponible') {
    return <Text style={{ color: colores.mutedForeground }}>{MENSAJE_NO_DISPONIBLE}</Text>
  }

  if (estado.tipo === 'error') {
    return <Text style={{ color: colors.text }}>{estado.error}</Text>
  }

  const { cantidades, propia } = estado

  async function marcar(tipo: TipoAsistencia) {
    if (!userId || marcando) return
    setMarcando(tipo)
    const resultado = await marcarAsistencia(eventId, userId, tipo, propia)
    if (resultado.tipo === 'ok') {
      await cargar()
    } else if (resultado.tipo === 'no-disponible') {
      setEstado({ tipo: 'no-disponible' })
    } else {
      setEstado({ tipo: 'error', error: resultado.error })
    }
    setMarcando(null)
  }

  function alPresionar(tipo: TipoAsistencia) {
    if (!userId) {
      router.push('/cuenta')
      return
    }
    marcar(tipo)
  }

  function boton(tipo: TipoAsistencia, cantidad: number) {
    const marcado = propia === tipo
    return (
      <Pressable
        key={tipo}
        onPress={() => alPresionar(tipo)}
        disabled={marcando !== null}
        style={[estilos.boton, { borderColor: colors.border }, marcado && { backgroundColor: colors.primary }]}
      >
        {marcando === tipo ? (
          <ActivityIndicator color={marcado ? '#fff' : colors.text} />
        ) : (
          <Text style={[estilos.textoBoton, { color: marcado ? '#fff' : colors.text }]}>
            {ETIQUETAS[tipo]} · {cantidad}
          </Text>
        )}
      </Pressable>
    )
  }

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.fila}>
        {boton('voy', cantidades.voy)}
        {boton('me_interesa', cantidades.meInteresa)}
      </View>
      {!userId ? <Text style={{ color: colores.mutedForeground }}>Entrá para marcar si vas.</Text> : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { gap: 8 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  textoBoton: { fontWeight: '600' },
  espaciado: { marginTop: 8 },
})
