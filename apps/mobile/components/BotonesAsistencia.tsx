// "Voy" de la ficha (R26, 26-b; reescrito en la R47, tarea 47-f, QPS-197:
// el modelo pasó de dos marcas, "Voy"/"Me interesa", a una sola, "Voy" — ver
// el informe de la tarea 47-e). Sin sesión, el botón invita a entrar (va a
// Cuenta); con sesión, marca/desmarca con `lib/asistencia.ts`. Si la tabla o
// la vista todavía no existen en este entorno (producción hasta el jueves),
// se muestra "Pronto vas a poder marcar si vas" y el resto de la ficha sigue
// andando. Nunca se muestra quién marcó: solo la cantidad.
//
// Este componente ya no se usa desde `app/evento/[id].tsx` (la R47 lo
// reemplaza por `FilaAccionesEvento`, que trae su propio botón de Voy con el
// mismo `textoBotonVoy`): queda sin uso en el árbol de pantallas, pero no se
// borra — ver el informe de la tarea 47-f para el lead de día.
//
// R38, tarea 38-a: el texto del botón sale de `textoBotonVoy`
// (`@qps/core/asistencia`): el contador recién aparece desde
// `UMBRAL_CONTADOR_ASISTENCIA`, igual que en la web.
//
// 33-a (QPS-147): el texto secundario usaba `colors.border` (el token de
// borde de `useTheme()`, casi invisible en tema claro); pasa a
// `colores.mutedForeground` (`useColoresQPS`, QPS-126) — mismo token que ya
// usan `EstadoCarga`/`PantallaRadar`/`SeccionNotificaciones` para sus
// mensajes secundarios. `colors.border` sigue para los bordes (no es texto).
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import { cantidadVisible, ETIQUETAS_ASISTENCIA, TEXTO_ENTRAR_PARA_MARCAR, textoBotonVoy, type TipoAsistencia } from '@qps/core/asistencia'
import { MENSAJE_NO_DISPONIBLE, marcarAsistencia, obtenerAsistencia, type EstadoAsistencia } from '@/lib/asistencia'
import { useColoresQPS } from '@/lib/colores'
import { useSession } from '@/lib/session'

export interface BotonesAsistenciaProps {
  eventId: string
}

type Estado = { tipo: 'cargando' } | EstadoAsistencia

export function BotonesAsistencia({ eventId }: BotonesAsistenciaProps) {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null

  // El estado se guarda con la clave (evento + usuario) a la que pertenece: si
  // cambia, el resultado viejo no vale y se muestra "cargando" hasta que llegue
  // el nuevo, sin `setState` síncrono dentro del efecto.
  const clave = `${eventId}:${userId ?? ''}`
  const [resultadoCarga, setResultadoCarga] = useState<{ clave: string; estado: Estado } | null>(null)
  const [marcando, setMarcando] = useState<TipoAsistencia | null>(null)

  const estado: Estado = resultadoCarga && resultadoCarga.clave === clave ? resultadoCarga.estado : { tipo: 'cargando' }

  const setEstado = useCallback((nuevo: Estado) => setResultadoCarga({ clave, estado: nuevo }), [clave])

  // Recarga desde un evento (después de marcar): vuelve a "cargando" y pide.
  const cargar = useCallback(async () => {
    setResultadoCarga(null)
    const resultado = await obtenerAsistencia(eventId, userId)
    setEstado(resultado)
  }, [eventId, userId, setEstado])

  useEffect(() => {
    if (cargandoSesion) return
    let cancelado = false
    obtenerAsistencia(eventId, userId).then((resultado) => {
      if (!cancelado) setEstado(resultado)
    })
    return () => {
      cancelado = true
    }
  }, [cargandoSesion, eventId, userId, setEstado])

  if (cargandoSesion || estado.tipo === 'cargando') {
    return <ActivityIndicator style={estilos.espaciado} />
  }

  if (estado.tipo === 'no-disponible') {
    return <Text style={{ color: colores.mutedForeground }}>{MENSAJE_NO_DISPONIBLE}</Text>
  }

  if (estado.tipo === 'error') {
    return <Text style={{ color: colors.text }}>{estado.error}</Text>
  }

  const { cantidades, propia, guardado } = estado

  async function marcar(tipo: TipoAsistencia) {
    if (!userId || marcando) return
    setMarcando(tipo)
    const resultado = await marcarAsistencia(eventId, userId, tipo, { guardado, voy: propia === 'voy' })
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
    // "Voy, 5 personas" (con la cantidad) desde el umbral de `cantidadVisible`;
    // si no, solo la etiqueta ("Voy"), igual que `textoBotonVoy`
    // pero en voseo accesible, no en el formato compacto "Voy · 5" del texto
    // visible.
    const visible = cantidadVisible(cantidad)
    const etiqueta = visible === null ? ETIQUETAS_ASISTENCIA[tipo] : `${ETIQUETAS_ASISTENCIA[tipo]}, ${visible} personas`
    return (
      <Pressable
        key={tipo}
        onPress={() => alPresionar(tipo)}
        disabled={marcando !== null}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityState={{ selected: marcado, busy: marcando === tipo }}
        style={[estilos.boton, { borderColor: colors.border }, marcado && { backgroundColor: colors.primary }]}
      >
        {marcando === tipo ? (
          <ActivityIndicator color={marcado ? '#fff' : colors.text} />
        ) : (
          <Text style={[estilos.textoBoton, { color: marcado ? '#fff' : colors.text }]}>
            {textoBotonVoy(cantidad)}
          </Text>
        )}
      </Pressable>
    )
  }

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.fila}>{boton('voy', cantidades.voy)}</View>
      {!userId ? <Text style={{ color: colores.mutedForeground }}>{TEXTO_ENTRAR_PARA_MARCAR}</Text> : null}
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
