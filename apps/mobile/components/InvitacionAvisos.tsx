// Ronda 70, tarea 70-a: invitación a activar los avisos, una sola vez por
// teléfono (la bandera y la regla viven en `lib/push/invitacion.ts`).
//
// - `InvitacionAvisos`: tarjeta en Inicio.
// - `InvitacionTrasAccion`: hoja chica, montada una vez en `app/_layout.tsx`,
//   que aparece después del primer Guardar / Voy exitoso (si todavía no se vio
//   y el permiso está sin pedir).
//
// Sin cifras de topes ni horarios en los textos (QPS-113 sin confirmar).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { cambiarAvisosEquipo } from '@/lib/notificaciones'
import { usePush } from '@/lib/push'
import {
  invitacionFueVista,
  marcarInvitacionVista,
  seMuestraInvitacion,
  suscribirCambioVista,
  suscribirTrasAccion,
} from '@/lib/push/invitacion'
import { useSession } from '@/lib/session'

export const TITULO_INVITACION = 'Activá los avisos para enterarte de lo que pinta'
export const TEXTO_INVITACION =
  'Te avisamos antes de lo que guardaste y te mandamos novedades de Qué Pinta Salta. Lo cambiás cuando quieras en Cuenta.'
export const TITULO_INVITACION_ENTRAR = 'Entrá a tu cuenta para activar los avisos'

/** `null` mientras se lee la bandera; después `true`/`false`. Se resincroniza si otra instancia la marca. */
function useInvitacionVista(): boolean | null {
  const [vista, setVista] = useState<boolean | null>(null)

  useEffect(() => {
    let activo = true
    const leer = () => {
      invitacionFueVista().then((valor) => {
        if (activo) setVista(valor)
      })
    }
    leer()
    const baja = suscribirCambioVista(leer)
    return () => {
      activo = false
      baja()
    }
  }, [])

  return vista
}

/** Activa el push y, si quedó activo, guarda `announcements = true` (solo esa columna). */
function useActivarAvisos() {
  const { activar } = usePush()
  const { session } = useSession()
  const userId = session?.user.id ?? null

  return useCallback(async () => {
    await marcarInvitacionVista()
    const resultado = await activar()
    if (resultado === 'activo' && userId) {
      // Si no se puede guardar la preferencia, los avisos quedan activos igual.
      await cambiarAvisosEquipo(userId, true).catch(() => {})
    }
  }, [activar, userId])
}

interface ContenidoProps {
  variante: 'activar' | 'entrar'
  onPrincipal: () => void
  onDescartar: () => void
}

function ContenidoInvitacion({ variante, onPrincipal, onDescartar }: ContenidoProps) {
  const colores = useColoresQPS()
  const etiquetaPrincipal = variante === 'activar' ? 'Activar' : 'Entrar'

  return (
    <View style={estilos.contenido}>
      <View style={estilos.encabezado}>
        <Texto peso="bold" style={estilos.titulo}>
          {variante === 'activar' ? TITULO_INVITACION : TITULO_INVITACION_ENTRAR}
        </Texto>
        <Pressable
          onPress={onDescartar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar la invitación a activar los avisos"
          style={estilos.cerrar}
        >
          <Texto tono="secundario" style={estilos.equis}>✕</Texto>
        </Pressable>
      </View>
      <Texto tono="secundario">{TEXTO_INVITACION}</Texto>
      <View style={estilos.botones}>
        <Pressable
          onPress={onPrincipal}
          accessibilityRole="button"
          accessibilityLabel={variante === 'activar' ? 'Activar los avisos' : 'Entrar a mi cuenta'}
          style={[estilos.boton, { backgroundColor: colores.primary }]}
        >
          <Texto peso="bold" style={{ color: colores.primaryForeground }}>{etiquetaPrincipal}</Texto>
        </Pressable>
        <Pressable
          onPress={onDescartar}
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          style={[estilos.boton, { borderWidth: 1, borderColor: colores.border }]}
        >
          <Texto peso="semibold">Ahora no</Texto>
        </Pressable>
      </View>
    </View>
  )
}

/** Tarjeta de Inicio. No dibuja nada si no corresponde (ver `seMuestraInvitacion`). */
export function InvitacionAvisos() {
  const colores = useColoresQPS()
  const router = useRouter()
  const { estado } = usePush()
  const vista = useInvitacionVista()
  const activar = useActivarAvisos()

  if (vista === null) return null
  const variante = seMuestraInvitacion({ estado, vista })
  if (variante === null) return null

  return (
    <View style={[estilos.tarjeta, { backgroundColor: colores.card, borderColor: colores.border }]}>
      <ContenidoInvitacion
        variante={variante}
        // Sin sesión: lleva a la pantalla de entrar (Cuenta) y no marca la bandera.
        onPrincipal={variante === 'activar' ? () => void activar() : () => router.push('/cuenta')}
        onDescartar={() => void marcarInvitacionVista()}
      />
    </View>
  )
}

/** Hoja chica después del primer Guardar / Voy. Se monta una vez, en el layout raíz. */
export function InvitacionTrasAccion() {
  const colores = useColoresQPS()
  const { estado } = usePush()
  const activar = useActivarAvisos()
  const [abierta, setAbierta] = useState(false)
  const estadoRef = useRef(estado)

  useEffect(() => {
    estadoRef.current = estado
  }, [estado])

  useEffect(() => {
    let activo = true
    const baja = suscribirTrasAccion(() => {
      invitacionFueVista().then((vista) => {
        if (activo && seMuestraInvitacion({ estado: estadoRef.current, vista }) === 'activar') setAbierta(true)
      })
    })
    return () => {
      activo = false
      baja()
    }
  }, [])

  const cerrar = useCallback(() => {
    setAbierta(false)
    void marcarInvitacionVista()
  }, [])

  return (
    <Modal visible={abierta} transparent animationType="slide" onRequestClose={cerrar}>
      <Pressable
        style={estilos.fondo}
        onPress={cerrar}
        accessibilityRole="button"
        accessibilityLabel="Cerrar la invitación a activar los avisos"
      >
        {/* Un View (no Pressable) adentro: toques en la hoja no la cierran. */}
        <View
          onStartShouldSetResponder={() => true}
          style={[estilos.hoja, { backgroundColor: colores.card, borderColor: colores.border }]}
        >
          <ContenidoInvitacion
            variante="activar"
            onPrincipal={() => {
              setAbierta(false)
              void activar()
            }}
            onDescartar={cerrar}
          />
        </View>
      </Pressable>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  tarjeta: { marginHorizontal: 16, marginTop: 20, borderWidth: 1, borderRadius: 16, padding: 16 },
  contenido: { gap: 10 },
  encabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titulo: { flex: 1, fontSize: 16 },
  cerrar: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: -12, marginRight: -12 },
  equis: { fontSize: 18 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 4 },
  boton: { flex: 1, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  hoja: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
})
