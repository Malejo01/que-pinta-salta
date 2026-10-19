// Ronda 51, tarea 51-e: la franja que ve quien entra a la ficha de un evento
// desde un aviso push patrocinado (`?patrocinado=1`, montada por
// `app/evento/[id].tsx` cuando llega ese parámetro de ruta). Es la SEGUNDA
// forma de bajar la preferencia — la primera es el botón de la notificación
// misma (`lib/push/categorias.ts` + `interpretarRespuestaPush`, cableado en
// `components/ManejadorTapPush.tsx`) — para quien tocó el aviso pero no usó
// (o no vio, en iOS/si falló el registro) ese botón.
//
// Sin sesión, `cambiarPatrocinados` no tiene a quién guardarle la
// preferencia (el `userId` sale SIEMPRE de `useSession()`, nunca de otro
// lado, ni del push que trajo hasta acá): el componente no tiene nada útil
// que ofrecer y devuelve `null`.
//
// Estilo: mismo patrón que `AvisoActivarPush.tsx`/`SeccionNotificaciones.tsx`
// (franja con borde/fondo de `useColoresQPS()`, botón con fondo `primary` y
// texto `primaryForeground` — nunca `color: colores.primary` como color de
// TEXTO, regla de la R49 que vigila `tests/primario-texto.test.ts`).
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { AREA_TACTIL_MINIMA } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { cambiarPatrocinados } from '@/lib/notificaciones'
import { useSession } from '@/lib/session'

const TEXTO_FRANJA = 'Llegaste por un aviso patrocinado'
const TEXTO_BOTON = 'No recibir más avisos patrocinados'
const TEXTO_EXITO = 'Listo, no vas a recibir más. Podés volver a prenderlos en Cuenta.'

// Mismo valor que `COLOR_ERROR` de `SeccionNotificaciones.tsx` y
// `app/(tabs)/cuenta.tsx` (33-a, QPS-146): fijo, no depende de
// `useColorScheme()` (D1, 29-g: la app arranca siempre en oscuro).
const COLOR_ERROR = '#f87171'

type Estado = { tipo: 'inicial' } | { tipo: 'guardando' } | { tipo: 'ok' } | { tipo: 'error'; mensaje: string }

/**
 * Sin tope de escala de texto (`ESCALA_MAXIMA_COMPACTA`, `lib/accesibilidad.ts`)
 * a propósito: esa constante es para cajas de tamaño FIJO (la tarjeta de
 * evento, el Hero, el badge de categoría de esta misma ficha), donde un
 * texto agrandado se corta o desborda. Esta franja no tiene una altura fija
 * (crece con el contenido, igual que `AvisoActivarPush.tsx`, el componente
 * más parecido de la app — tampoco aplica el tope) y el botón usa
 * `minHeight` (no `height`), así que un texto más grande lo agranda en vez
 * de cortarlo.
 */
export function AvisoPatrocinado() {
  const colores = useColoresQPS()
  const { session } = useSession()
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicial' })

  if (!session) return null

  // Variable aparte (no `session.user.id` directo dentro de `noRecibirMas`,
  // más abajo): `session` angosta a no-null en ESTE scope (el `if` de
  // arriba), pero esa angostura no cruza al cuerpo de una función anidada
  // definida después — `userId`, ya un `string` llano, sí se captura tal
  // cual por el closure, sin volver a depender de la angostura.
  const userId = session.user.id
  const busy = estado.tipo === 'guardando'

  async function noRecibirMas() {
    if (busy) return
    setEstado({ tipo: 'guardando' })
    const resultado = await cambiarPatrocinados(userId, false)
    if (resultado.ok) {
      setEstado({ tipo: 'ok' })
    } else {
      setEstado({ tipo: 'error', mensaje: resultado.mensaje })
    }
  }

  return (
    <View style={[estilos.contenedor, { borderColor: colores.border, backgroundColor: colores.card }]}>
      {estado.tipo === 'ok' ? (
        <Texto tono="secundario">{TEXTO_EXITO}</Texto>
      ) : (
        <>
          <Texto tono="secundario">{TEXTO_FRANJA}</Texto>

          {estado.tipo === 'error' ? <Texto style={{ color: COLOR_ERROR }}>{estado.mensaje}</Texto> : null}

          <Pressable
            onPress={noRecibirMas}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={TEXTO_BOTON}
            accessibilityState={{ busy }}
            style={[estilos.boton, { borderColor: colores.border, backgroundColor: busy ? colores.muted : colores.primary }]}
          >
            <Texto peso="semibold" style={{ color: busy ? colores.mutedForeground : colores.primaryForeground }}>
              {TEXTO_BOTON}
            </Texto>
          </Pressable>
        </>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { width: '100%', gap: 8, padding: 14, borderWidth: 1, borderRadius: 12 },
  boton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: AREA_TACTIL_MINIMA,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
})
