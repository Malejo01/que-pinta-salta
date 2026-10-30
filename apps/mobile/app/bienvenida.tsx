// Bienvenida (R25, decisión 2 de Mauro del 13/10): se muestra una vez. La
// redirige acá `app/(tabs)/index.tsx` mientras `useBienvenidaVista` diga que
// todavía no se vio.
//
// R81 (81-b): dos pasos. En el primero, "Empezar" y "Entrar" eligen adónde
// ir; en el segundo se pregunta "¿Te avisamos de lo que pinta?" y recién ahí
// se marca la Bienvenida como vista y se navega (Empezar -> Inicio, Entrar ->
// Cuenta). El permiso del sistema SOLO se pide después de un "Sí, avisame"
// (nunca en frío): con sesión, la función `activar` de usePush lo pide y registra el token; sin
// sesión, se guarda una bandera y se activa cuando la persona inicia sesión
// (`InvitacionTrasAccion`). "Ahora no" no pide nada.
import { useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import LOGO_MARCA from '@/assets/logo-circular.png'
import { marcarBienvenidaVista } from '@/lib/bienvenida'
import { activarPreferenciasAlAceptar } from '@/lib/notificaciones'
import { usePush } from '@/lib/push'
import {
  marcarAvisosPendientesLogin,
  marcarCampaniaHecha,
  marcarInvitacionVista,
  posponerCampania,
} from '@/lib/push/invitacion'
import { useSession } from '@/lib/session'

type Destino = '/' | '/cuenta'

export default function Bienvenida() {
  const { colors } = useTheme()
  const router = useRouter()
  const { activar } = usePush()
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const [destino, setDestino] = useState<Destino | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  // El estado no alcanza: dos toques rápidos entran antes del re-render.
  const trabajandoRef = useRef(false)

  async function terminar(adonde: Destino) {
    await marcarBienvenidaVista()
    router.replace(adonde)
  }

  async function siAvisame(adonde: Destino) {
    if (trabajandoRef.current) return
    trabajandoRef.current = true
    setTrabajando(true)
    try {
      // Ya respondió: ni la campaña ni la tarjeta de Inicio la vuelven a pedir.
      await marcarCampaniaHecha()
      await marcarInvitacionVista()
      if (userId) {
        const resultado = await activar()
        // Si no quedó activo (negó el permiso, sin token), no hay preferencias
        // que guardar; en Cuenta puede reintentar. `activarPreferenciasAlAceptar`
        // no tira: devuelve `ok`.
        if (resultado === 'activo') await activarPreferenciasAlAceptar(userId)
      } else {
        await marcarAvisosPendientesLogin()
      }
    } finally {
      await terminar(adonde)
    }
  }

  async function ahoraNo(adonde: Destino) {
    if (trabajandoRef.current) return
    trabajandoRef.current = true
    setTrabajando(true)
    // Sin pedir nada; la campaña vuelve a preguntar en 7 días.
    await posponerCampania()
    await terminar(adonde)
  }

  if (destino) {
    return (
      <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
        <Text accessibilityRole="header" style={[estilos.titulo, { color: colors.text }]}>
          ¿Te avisamos de lo que pinta?
        </Text>
        <Text style={[estilos.linea, { color: colors.text }]}>
          Te avisamos antes de lo que guardaste y te mandamos novedades de Qué Pinta Salta. Lo cambiás cuando quieras en Cuenta.
        </Text>
        <Pressable
          onPress={() => void siAvisame(destino)}
          disabled={trabajando}
          accessibilityRole="button"
          style={[estilos.boton, { backgroundColor: colors.primary }]}
        >
          <Text style={estilos.textoBoton}>Sí, avisame</Text>
        </Pressable>
        <Pressable
          onPress={() => void ahoraNo(destino)}
          disabled={trabajando}
          accessibilityRole="button"
          style={estilos.botonSecundario}
        >
          <Text style={[estilos.textoSecundario, { color: colors.text }]}>Ahora no</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      <Image source={LOGO_MARCA} style={estilos.logo} resizeMode="contain" />
      <Text style={[estilos.titulo, { color: colors.text }]}>Qué Pinta Salta</Text>
      <Text style={[estilos.linea, { color: colors.text }]}>
        Todo lo que pasa en Salta, en un solo lugar.
      </Text>
      <Pressable
        onPress={() => setDestino('/')}
        accessibilityRole="button"
        style={[estilos.boton, { backgroundColor: colors.primary }]}
      >
        <Text style={estilos.textoBoton}>Empezar</Text>
      </Pressable>
      <Pressable onPress={() => setDestino('/cuenta')} accessibilityRole="button" style={estilos.botonSecundario}>
        <Text style={[estilos.textoSecundario, { color: colors.text }]}>Entrar</Text>
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  logo: { width: 120, height: 120, marginBottom: 8 },
  titulo: { fontFamily: 'Montserrat_700Bold', fontSize: 24, textAlign: 'center' },
  linea: { fontFamily: 'Montserrat_400Regular', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  boton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoBoton: { fontFamily: 'Montserrat_600SemiBold', color: '#fff', fontSize: 16 },
  botonSecundario: { minHeight: 48, paddingVertical: 10, justifyContent: 'center' },
  textoSecundario: { fontFamily: 'Montserrat_600SemiBold', fontSize: 15 },
})
