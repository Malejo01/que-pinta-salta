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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Texto } from '@/components/Texto'
import { avisar } from '@/lib/aviso'
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
export const TEXTO_INVITACION_ENTRAR =
  'Con tu cuenta te avisamos antes de lo que guardes. Lo cambiás cuando quieras en Cuenta.'
export const AVISO_AVISOS_ACTIVOS = 'Listo, te vamos a avisar.'
export const AVISO_AVISOS_NO_ACTIVADOS = 'No pudimos activar los avisos. Podés probar en Cuenta.'
export const AVISO_PREFERENCIA_NO_GUARDADA =
  'Los avisos quedaron activos, pero no pudimos guardar tu preferencia. Revisala en Cuenta.'

/** Retraso de la hoja post-Guardar/Voy, para no tapar el feedback del botón. */
const RETRASO_HOJA_MS = 900

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
      // `cambiarAvisosEquipo` no tira: devuelve `ok`. Si falla, los avisos
      // quedan activos igual y se le dice a la persona.
      const guardado = await cambiarAvisosEquipo(userId, true)
      avisar(guardado.ok ? AVISO_AVISOS_ACTIVOS : AVISO_PREFERENCIA_NO_GUARDADA)
      return
    }
    avisar(resultado === 'activo' ? AVISO_AVISOS_ACTIVOS : AVISO_AVISOS_NO_ACTIVADOS)
  }, [activar, userId])
}

interface ContenidoProps {
  variante: 'activar' | 'entrar'
  onPrincipal: () => void
  onDescartar: () => void
  /** La tarjeta de Inicio lleva la X; la hoja no (su salida es "Ahora no", tocar afuera o Atrás). */
  conCerrar: boolean
}

function ContenidoInvitacion({ variante, onPrincipal, onDescartar, conCerrar }: ContenidoProps) {
  const colores = useColoresQPS()
  const etiquetaPrincipal = variante === 'activar' ? 'Activar' : 'Entrar'

  return (
    <View style={estilos.contenido}>
      <View style={estilos.encabezado}>
        <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
          {variante === 'activar' ? TITULO_INVITACION : TITULO_INVITACION_ENTRAR}
        </Texto>
        {conCerrar ? (
          <Pressable
            onPress={onDescartar}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            style={estilos.cerrar}
          >
            <Texto tono="secundario" style={estilos.equis}>✕</Texto>
          </Pressable>
        ) : null}
      </View>
      <Texto tono="secundario">{variante === 'activar' ? TEXTO_INVITACION : TEXTO_INVITACION_ENTRAR}</Texto>
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
  const { estado, sincronizado } = usePush()
  const { cargando } = useSession()
  const vista = useInvitacionVista()
  const activar = useActivarAvisos()

  // Nada mientras carga la sesión ni antes de la primera sincronización: el
  // estado de push es provisorio y la tarjeta aparecería un instante.
  if (vista === null) return null
  const variante = seMuestraInvitacion({ estado, vista, cargando, sincronizado })
  if (variante === null) return null

  return (
    <View style={[estilos.tarjeta, { backgroundColor: colores.card, borderColor: colores.border }]}>
      <ContenidoInvitacion
        variante={variante}
        // Sin sesión: lleva a la pantalla de entrar (Cuenta) y no marca la bandera.
        onPrincipal={variante === 'activar' ? () => void activar() : () => router.push('/cuenta')}
        onDescartar={() => void marcarInvitacionVista()}
        conCerrar
      />
    </View>
  )
}

/** Hoja chica después del primer Guardar / Voy. Se monta una vez, en el layout raíz. */
export function InvitacionTrasAccion() {
  const colores = useColoresQPS()
  const insets = useSafeAreaInsets()
  const { estado, sincronizado } = usePush()
  const { cargando } = useSession()
  const activar = useActivarAvisos()
  const [abierta, setAbierta] = useState(false)
  const datosRef = useRef({ estado, sincronizado, cargando })

  useEffect(() => {
    datosRef.current = { estado, sincronizado, cargando }
  }, [estado, sincronizado, cargando])

  useEffect(() => {
    let activo = true
    let temporizador: ReturnType<typeof setTimeout> | null = null
    const baja = suscribirTrasAccion(() => {
      // Con retraso, para no tapar el feedback del botón; al abrir se vuelve
      // a chequear la bandera y el estado (pudieron cambiar en el medio).
      if (temporizador) clearTimeout(temporizador)
      temporizador = setTimeout(() => {
        temporizador = null
        invitacionFueVista().then((vista) => {
          if (activo && seMuestraInvitacion({ ...datosRef.current, vista }) === 'activar') setAbierta(true)
        })
      }, RETRASO_HOJA_MS)
    })
    return () => {
      activo = false
      if (temporizador) clearTimeout(temporizador)
      baja()
    }
  }, [])

  const cerrar = useCallback(() => {
    setAbierta(false)
    void marcarInvitacionVista()
  }, [])

  return (
    <Modal visible={abierta} transparent animationType="slide" onRequestClose={cerrar}>
      <View style={estilos.fondo}>
        {/* Hermanos (no el fondo envolviendo a la hoja): así el lector de
            pantalla ve la hoja como un elemento modal con sus botones, y el
            fondo toca-para-cerrar queda fuera del árbol de accesibilidad
            (rol y etiqueta solo para el detector de 46-b: con `accessible`
            falso y oculto, el lector de pantalla no lo anuncia). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={cerrar}
          accessible={false}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
        <View
          accessibilityViewIsModal
          style={[
            estilos.hoja,
            { backgroundColor: colores.card, borderColor: colores.border, paddingBottom: Math.max(28, insets.bottom + 16) },
          ]}
        >
          <ContenidoInvitacion
            variante="activar"
            onPrincipal={() => {
              setAbierta(false)
              void activar()
            }}
            onDescartar={cerrar}
            conCerrar={false}
          />
        </View>
      </View>
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
  hoja: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
})
