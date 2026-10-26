// Fila de acciones de la ficha de un evento: ♥ Guardar · ✓ Voy · Compartir
// (R47, tarea 47-f, QPS-197). Reemplaza "Voy / Me interesa"
// (`BotonesAsistencia`, que sigue existiendo pero ya solo con Voy) más el
// corazón y Compartir que antes vivían sueltos junto al título
// (`accionesTitulo` de `app/evento/[id].tsx`).
//
// Un solo estado `{ guardado, voy, cantidadVoy }` (nunca el ♥ y el Voy por
// separado): es el punto de esta tarea, para que nunca se contradigan en
// pantalla. Voy está CONTENIDO en Guardados (`@qps/core/asistencia`): sacar
// el ♥ de un evento con Voy también saca el Voy (ver `tocarGuardar`), con el
// aviso `TEXTO_SACASTE_GUARDADO_CON_VOY` — en Android como toast
// (`lib/aviso.ts`) y SIEMPRE además como texto en línea acá abajo, porque
// `avisar()` no hace nada fuera de Android y nadie puede quedarse sin el
// mensaje.
//
// El orden de los botones sale de `ORDEN_FILA_ACCIONES`
// (`@qps/core/asistencia`, único lugar donde se fija ese orden): nunca se
// hardcodea una copia acá. "Compartir" se renderiza con `BotonCompartir` tal
// cual viene de la R42 (no se reimplementa ni se le cambia nada).
//
// El botón de Voy solo aparece con el evento `PUBLISHED` (prop `status`):
// `event_attendance_counts` solo cuenta eventos publicados, así que en
// cualquier otro estado el número quedaría clavado en 0 y el botón
// mentiría. En la ficha de hoy (`app/evento/[id].tsx`) esto es redundante
// -`obtenerEventoPorId` ya filtra `status = 'PUBLISHED'`, así que acá
// siempre llega `'PUBLISHED'`- pero el componente no asume quién lo llama.
//
// La decisión de qué botones mostrar vive en `botonesDeLaFila`, pura (sin
// React, sin Supabase): se puede probar sin montar nada.
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import {
  ORDEN_FILA_ACCIONES,
  TEXTO_SACASTE_GUARDADO_CON_VOY,
  textoBotonVoy,
  type AccionFila,
} from '@qps/core/asistencia'
import { BotonCompartir } from '@/components/BotonCompartir'
import { avisar } from '@/lib/aviso'
import type { DatosTarjetaCompartir } from '@/lib/compartir'
import { marcarAsistencia, obtenerAsistencia } from '@/lib/asistencia'
import { useColoresQPS } from '@/lib/colores'
import { desmarcarFavorito, marcarFavorito } from '@/lib/favoritos'
import { invitarTrasAccion } from '@/lib/push/invitacion'
import { useSession } from '@/lib/session'

export interface FilaAccionesEventoProps {
  eventId: string
  titulo: string
  fecha: string
  hora?: string | null
  lugar: string
  /** Solo con `'PUBLISHED'` se muestra el botón de Voy (ver arriba). */
  status: string
  /** R42: con los datos de la tarjeta, Compartir abre la hoja "Compartir tarjeta" (ver `BotonCompartir`). */
  tarjeta?: DatosTarjetaCompartir
}

/** El estado único de Guardar/Voy de esta fila (nunca dos estados separados). */
export interface EstadoFila {
  guardado: boolean
  voy: boolean
  cantidadVoy: number
}

type Estado =
  | { tipo: 'cargando' }
  | ({ tipo: 'ok' } & EstadoFila)
  | { tipo: 'no-disponible' }
  | { tipo: 'error'; error: string }

export interface BotonFila {
  accion: AccionFila
  texto: string
  seleccionado: boolean
}

export const MENSAJE_NO_DISPONIBLE_FILA = 'Pronto vas a poder guardar o marcar si vas.'
export const TEXTO_ENTRAR_PARA_GUARDAR = 'Entrá para guardar o marcar si vas.'

/**
 * Qué botones mostrar, en qué orden y con qué texto/selección — pura, sin
 * React ni Supabase. El orden sale de `ORDEN_FILA_ACCIONES`: nunca se repite
 * ese arreglo a mano. `mostrarVoy` en `false` saca "voy" de la lista (evento
 * no `PUBLISHED`).
 */
export function botonesDeLaFila(estado: EstadoFila, mostrarVoy: boolean): BotonFila[] {
  return ORDEN_FILA_ACCIONES.filter((accion) => accion !== 'voy' || mostrarVoy).map((accion) => {
    if (accion === 'guardar') {
      return { accion, texto: estado.guardado ? '♥ Guardado' : '♥ Guardar', seleccionado: estado.guardado }
    }
    if (accion === 'voy') {
      return { accion, texto: `✓ ${textoBotonVoy(estado.cantidadVoy)}`, seleccionado: estado.voy }
    }
    return { accion, texto: 'Compartir', seleccionado: false }
  })
}

/** El `accessibilityLabel` de cada botón (guardar/voy), según si ya está marcado. */
function etiquetaAccesible(accion: 'guardar' | 'voy', seleccionado: boolean): string {
  if (accion === 'guardar') {
    return seleccionado ? 'Quitar este evento de tus guardados' : 'Guardar este evento en tus favoritos'
  }
  return seleccionado ? 'Dejar de marcar que vas a este evento' : 'Marcar que vas a este evento'
}

export function FilaAccionesEvento({ eventId, titulo, fecha, hora, lugar, status, tarjeta }: FilaAccionesEventoProps) {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [enVuelo, setEnVuelo] = useState<AccionFila | null>(null)
  const [avisoEnLinea, setAvisoEnLinea] = useState<string | null>(null)

  const mostrarVoy = status === 'PUBLISHED'

  // El fetch va inline en el efecto con `.then()` (nunca una función separada
  // que haga `setEstado` de forma sincrónica al entrar: eso dispara
  // `react-hooks/set-state-in-effect`) — mismo patrón que
  // `app/evento/[id].tsx`. El estado arranca en `'cargando'` (valor inicial
  // de `useState`); si `userId` cambia más tarde (login a mitad de sesión),
  // se refresca en el momento, sin volver a mostrar el spinner.
  useEffect(() => {
    if (cargandoSesion) return
    let cancelado = false

    obtenerAsistencia(eventId, userId).then((resultado) => {
      if (cancelado) return
      if (resultado.tipo === 'ok') {
        setEstado({
          tipo: 'ok',
          guardado: resultado.guardado,
          voy: resultado.propia === 'voy',
          cantidadVoy: resultado.cantidades.voy,
        })
      } else {
        setEstado(resultado)
      }
    })

    return () => {
      cancelado = true
    }
  }, [cargandoSesion, eventId, userId])

  if (cargandoSesion || estado.tipo === 'cargando') {
    return <ActivityIndicator style={estilos.espaciado} />
  }

  if (estado.tipo === 'no-disponible') {
    return <Text style={{ color: colores.mutedForeground }}>{MENSAJE_NO_DISPONIBLE_FILA}</Text>
  }

  if (estado.tipo === 'error') {
    return <Text style={{ color: colors.text }}>{estado.error}</Text>
  }

  // Se extraen a constantes locales (no `estado.guardado` suelto) porque
  // `tocarGuardar`/`tocarVoy` son funciones anidadas: TypeScript no arrastra
  // el angostamiento de `estado` (ya en `{ tipo: 'ok' }` por los `return` de
  // arriba) adentro de una función que podría llamarse más tarde, después de
  // que `estado` cambie (mismo motivo que `const { cantidades, propia } =
  // estado` en `BotonesAsistencia.tsx`).
  const { guardado, voy, cantidadVoy } = estado

  async function tocarGuardar() {
    if (!userId) {
      router.push('/cuenta')
      return
    }
    if (enVuelo) return
    setEnVuelo('guardar')

    if (!guardado) {
      const resultado = await marcarFavorito(eventId, userId)
      if (resultado.ok) {
        invitarTrasAccion()
        setEstado({ tipo: 'ok', guardado: true, voy, cantidadVoy })
      } else {
        setEstado({ tipo: 'error', error: resultado.error })
      }
    } else {
      const resultado = await desmarcarFavorito(eventId, userId)
      if (resultado.ok) {
        const { voyQuitado } = resultado
        setEstado({
          tipo: 'ok',
          guardado: false,
          voy: voyQuitado ? false : voy,
          cantidadVoy: voyQuitado ? Math.max(0, cantidadVoy - 1) : cantidadVoy,
        })
        if (voyQuitado) {
          avisar(TEXTO_SACASTE_GUARDADO_CON_VOY)
          setAvisoEnLinea(TEXTO_SACASTE_GUARDADO_CON_VOY)
        } else {
          setAvisoEnLinea(null)
        }
      } else {
        setEstado({ tipo: 'error', error: resultado.error })
      }
    }

    setEnVuelo(null)
  }

  async function tocarVoy() {
    if (!userId) {
      router.push('/cuenta')
      return
    }
    if (enVuelo) return
    setEnVuelo('voy')

    const actual = { guardado, voy }
    const resultado = await marcarAsistencia(eventId, userId, 'voy', actual)

    if (resultado.tipo === 'no-disponible') {
      // La tabla/vista todavía no existe en este entorno (antes del jueves):
      // lo que ya se haya alcanzado a escribir (por ejemplo el "guardar" de
      // los dos pasos) queda en la base igual; la próxima carga de la ficha
      // lo refleja.
      setEstado({ tipo: 'no-disponible' })
    } else if (resultado.tipo === 'error') {
      // El `guardado` del resultado es el estado REAL que quedó en la base,
      // incluso en el error (ver `marcarAsistencia`): se aplica siempre.
      setEstado({ tipo: 'ok', guardado: resultado.guardado, voy, cantidadVoy })
    } else {
      const nuevoVoy = !actual.voy
      if (nuevoVoy) invitarTrasAccion()
      setEstado({
        tipo: 'ok',
        guardado: resultado.guardado,
        voy: nuevoVoy,
        cantidadVoy: Math.max(0, cantidadVoy + (nuevoVoy ? 1 : -1)),
      })
    }

    setEnVuelo(null)
  }

  function alPresionar(accion: AccionFila) {
    if (accion === 'guardar') tocarGuardar()
    if (accion === 'voy') tocarVoy()
  }

  const botones = botonesDeLaFila(estado, mostrarVoy)

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.fila}>
        {botones.map((boton) =>
          boton.accion === 'compartir' ? (
            <BotonCompartir
              key="compartir"
              eventId={eventId}
              titulo={titulo}
              fecha={fecha}
              hora={hora}
              lugar={lugar}
              tamanio={44}
              fondo="muted"
              tarjeta={tarjeta}
            />
          ) : (
            <Pressable
              key={boton.accion}
              onPress={() => alPresionar(boton.accion)}
              disabled={enVuelo !== null}
              accessibilityRole="button"
              accessibilityLabel={etiquetaAccesible(boton.accion as 'guardar' | 'voy', boton.seleccionado)}
              accessibilityState={{ selected: boton.seleccionado, busy: enVuelo === boton.accion }}
              style={[
                estilos.boton,
                { borderColor: colors.border },
                boton.seleccionado && { backgroundColor: colors.primary },
              ]}
            >
              {enVuelo === boton.accion ? (
                <ActivityIndicator color={boton.seleccionado ? '#fff' : colors.text} />
              ) : (
                <Text style={[estilos.textoBoton, { color: boton.seleccionado ? '#fff' : colors.text }]}>
                  {boton.texto}
                </Text>
              )}
            </Pressable>
          )
        )}
      </View>
      {avisoEnLinea ? <Text style={{ color: colores.mutedForeground }}>{avisoEnLinea}</Text> : null}
      {!userId ? <Text style={{ color: colores.mutedForeground }}>{TEXTO_ENTRAR_PARA_GUARDAR}</Text> : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { gap: 8 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  boton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  textoBoton: { fontWeight: '600' },
  espaciado: { marginTop: 8 },
})
