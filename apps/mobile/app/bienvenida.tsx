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
// (`InvitacionTrasAccion`). "Ahora no" no pide nada y no se vuelve a preguntar
// (R83: la invitación se decide una sola vez; se activa desde Cuenta).
//
// R81, 81-c (accesibilidad): el contenido va en un `ScrollView` (con la fuente
// al 200 % el paso 2 no entra en 360×800 y los botones quedaban tapados); los
// dos títulos son `header` y al pasar de paso el foco del lector va al título
// nuevo (mismo patrón que `components/HojaFiltros.tsx`); Atrás del sistema en
// el paso 2 vuelve al paso 1 en vez de cerrar la app; el logo decorativo queda
// fuera del árbol de accesibilidad.
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, BackHandler, findNodeHandle, Image, Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import LOGO_MARCA from '@/assets/logo-circular.png'
import { marcarBienvenidaVista } from '@/lib/bienvenida'
import { useColoresQPS } from '@/lib/colores'
import { activarPreferenciasAlAceptar } from '@/lib/notificaciones'
import { usePush } from '@/lib/push'
import { marcarAvisosPendientesLogin, marcarInvitacionVista } from '@/lib/push/invitacion'
import { useSession } from '@/lib/session'

type Destino = '/' | '/cuenta'

export default function Bienvenida() {
  const colores = useColoresQPS()
  const router = useRouter()
  const { activar } = usePush()
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const [destino, setDestino] = useState<Destino | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  // El estado no alcanza: dos toques rápidos entran antes del re-render.
  const trabajandoRef = useRef(false)
  const tituloRef = useRef<Text>(null)
  const primerRender = useRef(true)

  // Al pasar de paso, el foco del lector va al título nuevo (con una espera
  // corta: el contenido recién se montó). No se mueve al abrir la pantalla.
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false
      return
    }
    const temporizador = setTimeout(() => {
      const nodo = findNodeHandle(tituloRef.current)
      if (nodo !== null) AccessibilityInfo.setAccessibilityFocus(nodo)
    }, 150)
    return () => clearTimeout(temporizador)
  }, [destino])

  // Atrás del sistema en el paso 2 vuelve al paso 1 (si no, cerraba la app).
  // Mientras se guarda la respuesta, Atrás no hace nada.
  useEffect(() => {
    if (!destino) return
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!trabajandoRef.current) setDestino(null)
      return true
    })
    return () => suscripcion.remove()
  }, [destino])

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
    // Sin pedir nada, y no se vuelve a preguntar (se activa desde Cuenta).
    await marcarInvitacionVista()
    await terminar(adonde)
  }

  if (destino) {
    return (
      <ScrollView
        style={{ backgroundColor: colores.background }}
        contentContainerStyle={estilos.contenedor}
        keyboardShouldPersistTaps="handled"
      >
        <Text ref={tituloRef} accessibilityRole="header" style={[estilos.titulo, { color: colores.foreground }]}>
          ¿Te avisamos de lo que pinta?
        </Text>
        <Text style={[estilos.linea, { color: colores.foreground }]}>
          Te avisamos antes de lo que guardes y te mandamos novedades de Qué Pinta Salta. Lo cambiás cuando quieras en Cuenta.
        </Text>
        {userId ? null : (
          <Text style={[estilos.linea, { color: colores.foreground }]}>Cuando entres a tu cuenta te lo pedimos.</Text>
        )}
        <Pressable
          onPress={() => void siAvisame(destino)}
          disabled={trabajando}
          accessibilityRole="button"
          style={[estilos.boton, { backgroundColor: colores.primary }]}
        >
          <Text style={[estilos.textoBoton, { color: colores.primaryForeground }]}>Sí, avisame</Text>
        </Pressable>
        <Pressable
          onPress={() => void ahoraNo(destino)}
          disabled={trabajando}
          accessibilityRole="button"
          style={estilos.botonSecundario}
        >
          <Text style={[estilos.textoSecundario, { color: colores.foreground }]}>Ahora no</Text>
        </Pressable>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={{ backgroundColor: colores.background }}
      contentContainerStyle={estilos.contenedor}
      keyboardShouldPersistTaps="handled"
    >
      <Image
        source={LOGO_MARCA}
        style={estilos.logo}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text ref={tituloRef} accessibilityRole="header" style={[estilos.titulo, { color: colores.foreground }]}>
        Qué Pinta Salta
      </Text>
      <Text style={[estilos.linea, { color: colores.foreground }]}>
        Todo lo que pasa en Salta, en un solo lugar.
      </Text>
      <Pressable
        onPress={() => setDestino('/')}
        accessibilityRole="button"
        style={[estilos.boton, { backgroundColor: colores.primary }]}
      >
        <Text style={[estilos.textoBoton, { color: colores.primaryForeground }]}>Empezar</Text>
      </Pressable>
      <Pressable onPress={() => setDestino('/cuenta')} accessibilityRole="button" style={estilos.botonSecundario}>
        <Text style={[estilos.textoSecundario, { color: colores.foreground }]}>Entrar</Text>
      </Pressable>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    flexGrow: 1,
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
  textoBoton: { fontFamily: 'Montserrat_600SemiBold', fontSize: 16 },
  botonSecundario: { minHeight: 48, paddingVertical: 10, justifyContent: 'center' },
  textoSecundario: { fontFamily: 'Montserrat_600SemiBold', fontSize: 15 },
})
