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
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { desmarcarFavorito, marcarFavorito, obtenerEsFavorito } from '@/lib/favoritos'
import { Icono } from '@/components/Icono'
import { useColoresQPS } from '@/lib/colores'
import { useSession } from '@/lib/session'

export interface BotonFavoritoProps {
  eventId: string
  /** 40 por defecto (junto al título de la ficha); la tarjeta pasa 32. */
  tamanio?: number
  /** `'muted'` por defecto (ficha); la tarjeta pasa `'oscuro'` (`bg-black/60`). */
  fondo?: 'muted' | 'oscuro'
}

type Estado = { tipo: 'cargando' } | { tipo: 'ok'; marcado: boolean } | { tipo: 'error'; error: string }

const ROJO_FAVORITO = '#ef4444'

export function BotonFavorito({ eventId, tamanio = 40, fondo = 'muted' }: BotonFavoritoProps) {
  const router = useRouter()
  const colores = useColoresQPS()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    if (!userId) {
      setEstado({ tipo: 'ok', marcado: false })
      return
    }
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerEsFavorito(eventId, userId)
    setEstado(resultado.ok ? { tipo: 'ok', marcado: resultado.marcado } : { tipo: 'error', error: resultado.error })
  }, [eventId, userId])

  useEffect(() => {
    if (cargandoSesion) return
    cargar()
  }, [cargandoSesion, cargar])

  async function alternar() {
    if (!userId) {
      router.push('/cuenta')
      return
    }
    if (estado.tipo !== 'ok' || guardando) return

    const marcadoAntes = estado.marcado
    setGuardando(true)
    const resultado = marcadoAntes ? await desmarcarFavorito(eventId, userId) : await marcarFavorito(eventId, userId)
    setEstado(resultado.ok ? { tipo: 'ok', marcado: !marcadoAntes } : { tipo: 'error', error: resultado.error })
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
      accessibilityLabel={marcado ? 'Quitar de favoritos' : 'Agregar a favoritos'}
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
