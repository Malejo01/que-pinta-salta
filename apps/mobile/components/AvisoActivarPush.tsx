// Ronda 41, tarea 41-e: el aviso para activar las notificaciones push, en
// dos variantes (`'cuenta'`: completo, dentro de SeccionNotificaciones;
// `'favoritos'`: una tarjeta chica arriba de la lista). Lee el estado de
// 41-c (`usePush()`, `lib/push/estado.ts`) y no toca nada de `lib/push/`:
// solo lo consume (no es un archivo permitido de esta tarea).
//
// QPS-113 no está confirmado: ningún texto de este archivo lleva cifras de
// topes ni horarios (tests/push-cuenta.test.ts lo verifica con un detector).
//
// Estilo: Texto, useColoresQPS y el mismo patrón de botón que
// SeccionNotificaciones.tsx (Pressable con borderColor/backgroundColor de
// los tokens). Sin colores escritos a mano.
import { Fragment } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { usePush } from '@/lib/push'
import { TEXTOS_PUSH, type EstadoPush } from '@/lib/push/estado'

export type VarianteAvisoPush = 'cuenta' | 'favoritos'

export type AccionBotonPush = 'activar' | 'reintentar' | 'abrirAjustes'

export interface BotonPush {
  etiqueta: string
  /** `null`: el botón se muestra deshabilitado (el caso de `pidiendo`). */
  accion: AccionBotonPush | null
}

/**
 * Qué botón (si hay) va con cada estado de push. Pura y exportada, para
 * testearla directo sin montar nada de React Native. El `switch` sin
 * `default` cubre los 8 estados de `EstadoPush` (si se agrega un estado
 * nuevo y no se suma acá, TypeScript lo marca).
 * - `sin-pedir`/`denegado`: "Activar notificaciones" (llama a `activar`).
 * - `bloqueado`: "Abrir ajustes" (llama a `abrirAjustes`).
 * - `error-registro`: "Reintentar" (llama a `reintentar`).
 * - `pidiendo`: el mismo botón de activar, pero deshabilitado, con el texto
 *   de `TEXTOS_PUSH.pidiendo`.
 * - `no-disponible`, `activo`, `sin-sesion`: sin botón.
 */
export function botonParaEstado(estado: EstadoPush): BotonPush | null {
  switch (estado) {
    case 'sin-pedir':
    case 'denegado':
      return { etiqueta: 'Activar notificaciones', accion: 'activar' }
    case 'bloqueado':
      return { etiqueta: 'Abrir ajustes', accion: 'abrirAjustes' }
    case 'error-registro':
      return { etiqueta: 'Reintentar', accion: 'reintentar' }
    case 'pidiendo':
      return { etiqueta: TEXTOS_PUSH.pidiendo, accion: null }
    case 'no-disponible':
    case 'activo':
    case 'sin-sesion':
      return null
  }
}

/**
 * La variante `favoritos` solo se muestra con sesión y estado `sin-pedir` o
 * `denegado`. Con cualquier otro estado (incluido `sin-sesion`), no se
 * renderiza.
 */
export function seMuestraAvisoFavoritos(estado: EstadoPush): boolean {
  return estado === 'sin-pedir' || estado === 'denegado'
}

const EXPLICACION_CUENTA =
  'Te avisamos antes de tus favoritos y cuando haya algo nuevo de lo que seguís en tu Radar. Podés elegir qué te llega y el horario de silencio.'
const PREGUNTA_FAVORITOS = '¿Querés que te avisemos antes de tus favoritos?'

export interface AvisoActivarPushProps {
  variante: VarianteAvisoPush
}

export function AvisoActivarPush({ variante }: AvisoActivarPushProps) {
  const colores = useColoresQPS()
  const { estado, activar, reintentar, abrirAjustes } = usePush()

  if (estado === 'sin-sesion') return null
  if (variante === 'favoritos' && !seMuestraAvisoFavoritos(estado)) return null

  const boton = botonParaEstado(estado)
  const accionesPorNombre: Record<AccionBotonPush, () => void> = {
    activar: () => {
      activar()
    },
    reintentar: () => {
      reintentar()
    },
    abrirAjustes,
  }

  return (
    <View
      style={[
        estilos.contenedor,
        variante === 'favoritos' ? estilos.chico : null,
        { borderColor: colores.border, backgroundColor: colores.card },
      ]}
    >
      {variante === 'cuenta' ? (
        <Fragment>
          <Texto tono="secundario">{EXPLICACION_CUENTA}</Texto>
          <Texto tono="secundario">{TEXTOS_PUSH[estado]}</Texto>
        </Fragment>
      ) : (
        <Texto peso="semibold">{PREGUNTA_FAVORITOS}</Texto>
      )}

      {boton ? (
        <Pressable
          onPress={boton.accion ? accionesPorNombre[boton.accion] : undefined}
          disabled={!boton.accion}
          accessibilityRole="button"
          accessibilityLabel={boton.etiqueta}
          style={[
            estilos.boton,
            { borderColor: colores.border, backgroundColor: boton.accion ? colores.primary : colores.muted },
          ]}
        >
          <Texto peso="semibold" style={{ color: boton.accion ? colores.primaryForeground : colores.mutedForeground }}>
            {boton.etiqueta}
          </Texto>
        </Pressable>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { width: '100%', gap: 8, padding: 14, borderWidth: 1, borderRadius: 12 },
  // La variante 'favoritos' se monta directo en la pantalla (sin un
  // contenedor padre que ya tenga padding, a diferencia de 'cuenta', que
  // vive dentro de SeccionNotificaciones): necesita su propio margen.
  chico: { marginHorizontal: 16, marginTop: 16, paddingVertical: 10 },
  boton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 4,
  },
})
