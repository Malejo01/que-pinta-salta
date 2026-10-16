// Botón de favorito de la ficha (R27, 27-b), junto a "Compartir". Sin
// sesión, lleva a Cuenta; con sesión, marca/desmarca con lib/favoritos.ts.
// Mismo patrón que BotonesAsistencia: el `userId` sale de `useSession()`
// adentro del componente, nunca de una prop.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import { desmarcarFavorito, marcarFavorito, obtenerEsFavorito } from '@/lib/favoritos'
import { Icono } from '@/components/Icono'
import { useSession } from '@/lib/session'

export interface BotonFavoritoProps {
  eventId: string
}

type Estado = { tipo: 'cargando' } | { tipo: 'ok'; marcado: boolean } | { tipo: 'error'; error: string }

export function BotonFavorito({ eventId }: BotonFavoritoProps) {
  const { colors } = useTheme()
  const router = useRouter()
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

  return (
    <Pressable
      onPress={alternar}
      disabled={cargando}
      style={[estilos.boton, { borderColor: colors.border }, marcado && { backgroundColor: colors.primary }]}
    >
      {cargando ? (
        <ActivityIndicator color={marcado ? '#fff' : colors.text} />
      ) : (
        <>
          <Icono nombre="Heart" tamanio={16} color={marcado ? '#fff' : colors.text} />
          <Text style={[estilos.textoBoton, { color: marcado ? '#fff' : colors.text }]}>
            {marcado ? 'Guardado' : 'Guardar'}
          </Text>
        </>
      )}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textoBoton: { fontWeight: '600' },
})
