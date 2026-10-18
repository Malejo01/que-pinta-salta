// "+ Seguir" de un lugar o una cuenta de Instagram, desde la ficha de un
// evento (R47, tarea 47-f, QPS-197). Pesimista: espera la respuesta de
// `cambiarSeguimiento` (lib/radar.ts) antes de cambiar el texto — a
// diferencia del ♥/Voy de `FilaAccionesEvento`, acá no hay un "optimista"
// pedido en el encargo, y el Radar es la fuente de los emails: mostrar
// "✓ Siguiendo" un instante antes de que la escritura falle sale más caro
// que la demora de esperar.
//
// El valor inicial (`siguiendoInicial`) lo trae quien use este botón
// (`obtenerSeguimientoDeEvento`, `lib/radar.ts`): este componente no vuelve
// a pedirlo, para no repetir la consulta que ya hizo la pantalla.
//
// La lógica de texto (`textoDeBotonSeguir`) es pura: sin React, sin
// Supabase. Las escrituras pasan siempre por `cambiarSeguimiento`
// (`lib/radar.ts`): este archivo nunca importa `supabase`.
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { textoSeguir, textoSeguirCuenta, type TipoSeguimiento } from '@qps/core/radar/seguimiento'
import { useColoresQPS } from '@/lib/colores'
import { cambiarSeguimiento } from '@/lib/radar'
import { useSession } from '@/lib/session'

export interface BotonSeguirProps {
  tipo: 'lugar' | 'cuenta'
  id: string
  /** El nombre del lugar o el `@usuario` de la cuenta: solo para el `accessibilityLabel` y, en 'cuenta', para el texto ("Seguir @usuario"). */
  etiqueta: string
  /** El estado de siguiendo/no siguiendo que ya trajo la pantalla (`obtenerSeguimientoDeEvento`): este botón no vuelve a pedirlo. */
  siguiendoInicial: boolean
}

/** El texto del botón, según el tipo y si ya lo sigue. Pura: la usa `BotonSeguir`. */
export function textoDeBotonSeguir(tipo: TipoSeguimiento, etiqueta: string, siguiendo: boolean): string {
  return tipo === 'cuenta' ? textoSeguirCuenta(etiqueta, siguiendo) : textoSeguir(siguiendo)
}

export function BotonSeguir({ tipo, id, etiqueta, siguiendoInicial }: BotonSeguirProps) {
  const router = useRouter()
  const colores = useColoresQPS()
  const { session } = useSession()
  const userId = session?.user.id ?? null

  const [siguiendo, setSiguiendo] = useState(siguiendoInicial)
  const [guardando, setGuardando] = useState(false)

  async function alternar() {
    if (!userId) {
      router.push('/cuenta')
      return
    }
    if (guardando) return

    setGuardando(true)
    const resultado = await cambiarSeguimiento(userId, { tipo, id, seguir: !siguiendo })
    if (resultado.ok) {
      setSiguiendo(resultado.siguiendo)
    }
    setGuardando(false)
  }

  const texto = textoDeBotonSeguir(tipo, etiqueta, siguiendo)

  return (
    <Pressable
      onPress={alternar}
      disabled={guardando}
      accessibilityRole="button"
      accessibilityLabel={siguiendo ? `Dejar de seguir ${etiqueta}` : `Seguir ${etiqueta}`}
      accessibilityState={{ selected: siguiendo, busy: guardando }}
      style={[estilos.boton, { borderColor: colores.border }, siguiendo && { backgroundColor: colores.primary }]}
    >
      {guardando ? (
        <ActivityIndicator color={siguiendo ? colores.primaryForeground : colores.foreground} size="small" />
      ) : (
        <Text style={[estilos.texto, { color: siguiendo ? colores.primaryForeground : colores.foreground }]}>
          {texto}
        </Text>
      )}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  boton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  texto: { fontWeight: '600', fontSize: 13 },
})
