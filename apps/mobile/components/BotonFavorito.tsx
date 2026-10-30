// Botón de favorito, ícono redondo (R29, 29-b: F14, ops/paridad-web-app.md
// §3.3 y §3.4). Antes era un botón con borde y el texto "Guardar"/"Guardado";
// ahora es un círculo con el corazón solo (vacío, o lleno en rojo cuando
// está marcado), con dos usos: 32 y fondo oscuro (`bg-black/60`) en la
// tarjeta, 40 y fondo `muted` junto al título de la ficha.
//
// El comportamiento no cambia (R27, 27-b): sin sesión lleva a Cuenta; el
// `userId` sale siempre de `useSession()` acá adentro, nunca de una prop
// (mismo patrón que `BotonesAsistencia`); un `23505` en `lib/favoritos.ts`
// ya cuenta como éxito, no como error.
//
// R69, 69-a (QPS-353): el botón es POR TIPO. Recibe `objetivo` (`{ tipo, id }`,
// ver `lib/rutas.ts`) y guarda en la columna que corresponde: evento →
// `event_id`, película → `cinema_movie_id`, flyer → `instagram_flyer_id`,
// siempre con el uuid pelado. Así lo que quedó guardado de antes (películas y
// flyers) se puede sacar de Favoritos. Para película y flyer no hay Voy ni
// `voyQuitado` (ver `lib/favoritos.ts`).
//
// R47, tarea 47-f (QPS-197): Voy está CONTENIDO en Guardados
// (`@qps/core/asistencia`), así que sacar el ♥ de un evento con Voy también
// saca el Voy (`desmarcarFavorito`, `lib/favoritos.ts`). Esta tarjeta solo
// tiene el corazón (no el Voy: eso vive en `FilaAccionesEvento`, en la
// ficha), así que el único aviso posible acá es el toast de Android
// (`avisar`, `lib/aviso.ts`): no hay dónde mostrar el texto en línea sin
// invadir el layout de la tarjeta. Fuera de Android, el usuario se entera
// igual la próxima vez que vea el evento (ya no tiene el ✓ Voy).
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { TEXTO_SACASTE_GUARDADO_CON_VOY } from '@qps/core/asistencia'
import { avisar } from '@/lib/aviso'
import { desmarcarFavorito, marcarFavorito, obtenerEsFavorito } from '@/lib/favoritos'
import { Icono } from '@/components/Icono'
import { hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { invitarTrasAccion } from '@/lib/push/invitacion'
import type { ObjetivoFavorito } from '@/lib/rutas'
import { useSession } from '@/lib/session'

/**
 * `hitSlopPara(tamanio)` sirve para los dos usos: 40 en la ficha
 * (`app/evento/[id].tsx`, `estilos.accionesTitulo`, gap 8, junto a
 * `BotonCompartir`) y 32 en la tarjeta (`TarjetaEvento.tsx`,
 * `estilos.accionesArriba`, gap 6, también junto a `BotonCompartir`).
 *
 * Con 40: hitSlopPara(40) da 4 por lado — 4+4=8, justo el gap de la ficha, no
 * se pisa. Con 32: hitSlopPara(32) da 8 por lado — 8+8=16, más que el gap de
 * 6 de la tarjeta: el lado lateral se baja a la mitad del gap (3) en los dos
 * botones para no comerse el vecino (46-c, para que lo revise 46-q).
 *
 * R72, 72-c (QPS-362): el recorte lateral solo hace falta si HAY vecino
 * (`conVecino`, por defecto `true`). Solo, como el corazón de la tarjeta de
 * película o flyer, el área completa es hitSlopPara(32) = 8 por lado:
 * 32 + 8 + 8 = 48 de ancho y de alto (antes 32 + 3 + 3 = 38 de ancho). Contra
 * el borde: el botón está a 8 del borde de la tarjeta, así que el área llega
 * justo a 0 y no se sale.
 */
function hitSlopBotonAccion(tamanio: number, conVecino: boolean = true) {
  const base = hitSlopPara(tamanio)
  return tamanio <= 32 && conVecino ? { ...base, left: 3, right: 3 } : base
}

export interface BotonFavoritoProps {
  /**
   * R69, 69-a (QPS-353): qué se guarda y su uuid pelado (nunca `movie-…` ni
   * `ig-…`). Sale de `objetivoDeFavorito` (`lib/rutas.ts`) en la tarjeta, o se
   * arma a mano en cada ficha: `{ tipo: 'cinema', id }`, `{ tipo: 'flyer', id }`.
   */
  objetivo: ObjetivoFavorito
  /** 40 por defecto (junto al título de la ficha); la tarjeta pasa 32. */
  tamanio?: number
  /** `'muted'` por defecto (ficha); la tarjeta pasa `'oscuro'` (`bg-black/60`). */
  fondo?: 'muted' | 'oscuro'
  /**
   * R69, 69-r1: qué se guarda, para el lector de pantalla ("Agregar <nombre> a
   * favoritos"). Sin `nombre`, la etiqueta genérica de siempre.
   */
  nombre?: string
  /**
   * R72, 72-c: `false` si no hay otro botón al lado (corazón solo en la tarjeta
   * de película/flyer): el área táctil llega a 48x48. Por defecto `true`.
   */
  conVecino?: boolean
}

/** La etiqueta del lector de pantalla; con `nombre` dice qué se guarda. */
export function etiquetaFavorito(marcado: boolean, nombre?: string): string {
  if (!nombre) return marcado ? 'Quitar de favoritos' : 'Agregar a favoritos'
  return marcado ? `Quitar ${nombre} de favoritos` : `Agregar ${nombre} a favoritos`
}

type Estado = { tipo: 'cargando' } | { tipo: 'ok'; marcado: boolean } | { tipo: 'error'; error: string }

const ROJO_FAVORITO = '#ef4444'

export function BotonFavorito({ objetivo, tamanio = 40, fondo = 'muted', nombre, conVecino = true }: BotonFavoritoProps) {
  const { tipo: tipoFavorito, id } = objetivo
  const router = useRouter()
  const colores = useColoresQPS()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null

  // El estado se guarda con la clave (objetivo + usuario) a la que pertenece:
  // si la clave cambia, el resultado viejo ya no vale y se muestra "cargando"
  // hasta que llegue el nuevo, sin hacer `setState` síncrono dentro del efecto.
  const clave = `${tipoFavorito}:${id}:${userId ?? ''}`
  const [guardado, setGuardado] = useState<{ clave: string; estado: Estado } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const estado: Estado = !userId
    ? { tipo: 'ok', marcado: false }
    : guardado && guardado.clave === clave
      ? guardado.estado
      : { tipo: 'cargando' }

  const setEstado = useCallback((nuevo: Estado) => setGuardado({ clave, estado: nuevo }), [clave])

  useEffect(() => {
    if (cargandoSesion || !userId) return
    let cancelado = false
    obtenerEsFavorito(id, userId, tipoFavorito).then((resultado) => {
      if (cancelado) return
      setEstado(resultado.ok ? { tipo: 'ok', marcado: resultado.marcado } : { tipo: 'error', error: resultado.error })
    })
    return () => {
      cancelado = true
    }
  }, [cargandoSesion, id, tipoFavorito, userId, setEstado])

  async function alternar() {
    if (!userId) {
      router.push('/cuenta')
      return
    }
    if (estado.tipo !== 'ok' || guardando) return

    const marcadoAntes = estado.marcado
    setGuardando(true)

    // Dos ramas (no un ternario sobre un solo `resultado`): `voyQuitado` solo
    // existe en `ResultadoDesmarcarFavorito`, y TypeScript no lo sabe si las
    // dos llamadas comparten una sola variable unión.
    if (marcadoAntes) {
      const resultado = await desmarcarFavorito(id, userId, tipoFavorito)
      if (resultado.ok) {
        if (resultado.voyQuitado) avisar(TEXTO_SACASTE_GUARDADO_CON_VOY)
        setEstado({ tipo: 'ok', marcado: false })
      } else {
        setEstado({ tipo: 'error', error: resultado.error })
      }
    } else {
      const resultado = await marcarFavorito(id, userId, tipoFavorito)
      if (resultado.ok) invitarTrasAccion()
      setEstado(resultado.ok ? { tipo: 'ok', marcado: true } : { tipo: 'error', error: resultado.error })
    }

    setGuardando(false)
  }

  const marcado = estado.tipo === 'ok' && estado.marcado
  const cargando = cargandoSesion || estado.tipo === 'cargando' || guardando

  const fondoColor = fondo === 'oscuro' ? 'rgba(0,0,0,0.6)' : colores.muted
  const colorBase = fondo === 'oscuro' ? '#fff' : colores.foreground
  const colorIcono = marcado ? ROJO_FAVORITO : colorBase

  return (
    <Pressable
      onPress={alternar}
      disabled={cargando}
      accessibilityRole="button"
      accessibilityLabel={etiquetaFavorito(marcado, nombre)}
      accessibilityState={{ busy: cargando }}
      hitSlop={hitSlopBotonAccion(tamanio, conVecino)}
      style={[
        estilos.boton,
        { width: tamanio, height: tamanio, borderRadius: tamanio / 2, backgroundColor: fondoColor },
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={colorBase} size="small" />
      ) : (
        <Icono nombre="Heart" tamanio={Math.round(tamanio * 0.45)} color={colorIcono} fill={marcado ? ROJO_FAVORITO : 'none'} />
      )}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  boton: { alignItems: 'center', justifyContent: 'center' },
})
