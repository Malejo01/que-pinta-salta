// Header propio de las pestañas (29-g, punto 5; ops/paridad-web-app.md §2
// punto 4 y §3.1; inventario-web-mobile.md "Navegación"). Mismo patrón que
// `apps/web/components/navbar.tsx` en su vista de celular: logo circular a
// la izquierda (lleva a Inicio) y, a la derecha, "Ingresar" sin sesión o el
// ícono de usuario con sesión (los dos llevan a /cuenta: ahí vive el login).
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LOGO_MARCA from '@/assets/logo-circular.png'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { useSession } from '@/lib/session'

// El aro del logo en la web (navbar.tsx): `dark:ring-2 dark:ring-[#C12026]/70
// dark:ring-offset-1 dark:ring-offset-background`. La app siempre está en
// oscuro (D1), así que es siempre esta variante.
const ARO_LOGO = 'rgba(193, 32, 38, 0.7)'

export function Encabezado() {
  const router = useRouter()
  const colores = useColoresQPS()
  const insets = useSafeAreaInsets()
  const { session } = useSession()
  const conSesion = Boolean(session)

  return (
    <View
      style={[
        estilos.contenedor,
        {
          paddingTop: insets.top + 8,
          backgroundColor: `${colores.background}E6`,
          borderBottomColor: colores.border,
        },
      ]}
    >
      <Pressable onPress={() => router.push('/')} accessibilityRole="button" accessibilityLabel="Ir a Inicio">
        <View style={[estilos.aroLogo, { borderColor: ARO_LOGO, backgroundColor: colores.background }]}>
          <Image source={LOGO_MARCA} style={estilos.logo} />
        </View>
      </Pressable>

      {conSesion ? (
        <Pressable
          onPress={() => router.push('/cuenta')}
          accessibilityRole="button"
          accessibilityLabel="Ir a Cuenta"
          // 46-c: 40×40 (ver `estilos.botonUsuario`), 8dp corto de los 48 de
          // `AREA_TACTIL_MINIMA`. Sin fondo/borde propio (solo el ícono
          // centrado): subir el tamaño del estilo movería el logo de la
          // izquierda (la fila es `space-between`) sin que se note nada
          // bueno a cambio, así que va con `hitSlop`. El detector estático
          // no lo ve: sigue en `tests/a11y/pendientes-componentes.ts`.
          hitSlop={hitSlopPara(40)}
          style={estilos.botonUsuario}
        >
          <Icono nombre="User" color={colores.foreground} tamanio={24} />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push('/cuenta')}
          accessibilityRole="button"
          accessibilityLabel="Ingresar"
          style={[estilos.botonIngresar, { backgroundColor: colores.primary }]}
        >
          <Icono nombre="LogIn" color={colores.primaryForeground} tamanio={18} />
          <Texto peso="semibold" style={{ color: colores.primaryForeground, fontSize: 14 }}>
            Ingresar
          </Texto>
        </Pressable>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 50 = 44 (logo) + 2×1 (ring-offset) + 2×2 (borde), como en la web.
  aroLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    padding: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  botonUsuario: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // minWidth 115, como "Ingresar" en navbar.tsx.
  botonIngresar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 115,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
})
