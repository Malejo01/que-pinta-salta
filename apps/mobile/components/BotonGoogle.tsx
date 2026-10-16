// Botón de Google del login (29-c, ops/paridad-web-app.md §3.9): outline, a
// ancho completo, con la G multicolor. Los `path` del ícono son los mismos
// que `GoogleIcon` en `apps/web/app/auth/login/page.tsx` (copiados tal
// cual): `react-native-svg` ya está instalada (D2), así que no hace falta
// el `GoogleSigninButton` nativo de la R28 para dibujar el botón — pero
// `onPress` sigue siendo el `entrarConGoogle` de quien llama (hoy,
// `app/(tabs)/cuenta.tsx`), con su propio registro de errores (F8, R28).
// Este componente no sabe nada de Supabase ni de Sentry.
//
// Conserva la condición de la R28: sin EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, no
// se muestra — ni siquiera intenta dibujarse.
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { leerEnv } from '@/lib/env'

export interface BotonGoogleProps {
  onPress: () => void
  /** Muestra un indicador en vez del ícono y el texto, como "Entrar" y
   * "Crear cuenta" en cuenta.tsx mientras la acción está en curso. */
  cargando?: boolean
  disabled?: boolean
}

export function BotonGoogle({ onPress, cargando, disabled }: BotonGoogleProps) {
  const colores = useColoresQPS()
  const { googleWebClientId } = leerEnv()

  if (!googleWebClientId) return null

  const deshabilitado = Boolean(disabled) || Boolean(cargando)

  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel="Continuar con Google"
      style={[
        estilos.boton,
        {
          backgroundColor: colores.background,
          borderColor: colores.border,
          opacity: deshabilitado ? 0.6 : 1,
        },
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={colores.foreground} />
      ) : (
        <View style={estilos.contenido}>
          <GIcon />
          <Texto peso="semibold">Google</Texto>
        </View>
      )}
    </Pressable>
  )
}

/** La G multicolor de Google: mismos `path` (y colores) que `GoogleIcon` en
 * `apps/web/app/auth/login/page.tsx`. */
function GIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  )
}

const estilos = StyleSheet.create({
  boton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    minHeight: 48,
  },
  contenido: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
