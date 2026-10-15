// Pantalla de Cuenta (R24): email y contraseña con las mismas cuentas que la
// web (decisión 3 de Mauro), Google detrás de EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
// (decisión 2) y Salir. El login es opcional: esta pantalla cambia según
// haya o no sesión (R27, 27-b: con sesión también se ven el Radar y las
// notificaciones, en SeccionRadar y SeccionNotificaciones).
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, useColorScheme, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import Constants from 'expo-constants'
import {
  GoogleSignin,
  GoogleSigninButton,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin'
import { mensajeErrorAlta } from '@qps/core/auth/mensajes'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando } from '@/components/EstadoCarga'
import { SeccionNotificaciones } from '@/components/SeccionNotificaciones'
import { SeccionRadar } from '@/components/SeccionRadar'
import { useColoresQPS } from '@/lib/colores'
import { codigoErrorGoogle, mensajeErrorGoogle, registrarErrorGoogle } from '@/lib/google'
import { leerEnv } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/session'
import { textoVersion } from '@/lib/version'

// Mapeo corto de códigos conocidos de @supabase/auth-js a mensajes en
// español. Nunca se muestra el texto crudo de la API.
const MENSAJES_ERROR: Record<string, string> = {
  invalid_credentials: 'El email o la contraseña no son correctos.',
  email_not_confirmed: 'Todavía no confirmaste el email: revisá tu casilla.',
  user_already_exists: 'Ya existe una cuenta con ese email.',
  email_exists: 'Ya existe una cuenta con ese email.',
  identity_already_exists: 'Ya existe una cuenta con ese email.',
  weak_password: 'La contraseña es muy débil: probá con una más larga.',
  validation_failed: 'Revisá el email y la contraseña.',
  over_email_send_rate_limit: 'Demasiados intentos. Probá de nuevo en un rato.',
  over_request_rate_limit: 'Demasiados intentos. Probá de nuevo en un rato.',
}

const MENSAJE_GENERICO = 'No se pudo completar la operación. Probá de nuevo.'
const MENSAJE_SIN_CONFIG = 'La app no tiene la configuración de cuentas: avisá al equipo.'
const MENSAJE_SIN_ID_TOKEN = 'Google no devolvió un token válido. Probá de nuevo.'
// F6 (decisión 5 del plan, QPS-145): credenciales inválidas suma esta
// segunda línea. La web no tiene "¿Olvidaste tu contraseña?", así que no se
// agrega: no hay a dónde llevar.
const SUGERENCIA_GOOGLE = 'Si entraste con Google, usá el botón de Google.'
// F4: el rojo fijo de R24 no se leía en tema oscuro.
const ROJO_ERROR_CLARO = '#dc2626'
const ROJO_ERROR_OSCURO = '#f87171'

function mensajeDeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const registro = error as Record<string, unknown>
    if (typeof registro.code === 'string' && MENSAJES_ERROR[registro.code]) {
      const mensaje = MENSAJES_ERROR[registro.code]
      return registro.code === 'invalid_credentials' ? `${mensaje}\n${SUGERENCIA_GOOGLE}` : mensaje
    }
    if (typeof registro.message === 'string' && /invalid login credentials/i.test(registro.message)) {
      return `${MENSAJES_ERROR.invalid_credentials}\n${SUGERENCIA_GOOGLE}`
    }
  }
  return MENSAJE_GENERICO
}

export default function Cuenta() {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const esquema = useColorScheme()
  const router = useRouter()
  const { session, cargando } = useSession()
  const { googleWebClientId } = leerEnv()
  // 28-c: línea chica al pie, con y sin sesión. `textoVersion` es pura y
  // nunca devuelve algo fuera de `\d+\.\d+\.\d+` / la lista de entornos, así
  // que una clave puesta por error en `extra` no podría llegar a mostrarse.
  const version = textoVersion({
    version: Constants.expoConfig?.version,
    entorno: Constants.expoConfig?.extra?.entorno,
  })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [accionEnCurso, setAccionEnCurso] = useState<'entrar' | 'crear' | 'google' | 'salir' | null>(null)
  const [avisoConfirmacion, setAvisoConfirmacion] = useState(false)

  const estilos = {
    contenedor: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24, gap: 12 },
    contenedorSesion: { flexGrow: 1, alignItems: 'center' as const, padding: 24, gap: 12 },
    titulo: { color: colors.text, fontSize: 18, fontWeight: '600' as const, marginBottom: 8 },
    texto: { color: colors.text },
    error: { color: esquema === 'dark' ? ROJO_ERROR_OSCURO : ROJO_ERROR_CLARO },
    boton: (deshabilitado: boolean) => ({
      width: '100%' as const,
      backgroundColor: deshabilitado ? colors.border : colors.primary,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center' as const,
    }),
    textoBoton: { color: '#fff', fontWeight: '600' as const },
    linkBienvenida: { marginTop: 8, padding: 8 },
    textoLinkBienvenida: { fontSize: 13, fontWeight: '600' as const, textDecorationLine: 'underline' as const },
    version: { fontSize: 11, color: colores.mutedForeground, marginTop: 4 },
  }

  if (cargando) {
    return (
      <View style={estilos.contenedor}>
        <Cargando />
      </View>
    )
  }

  async function entrar() {
    if (!supabase) {
      setError(MENSAJE_SIN_CONFIG)
      return
    }
    setError(null)
    setAvisoConfirmacion(false)
    setAccionEnCurso('entrar')
    try {
      const { error: errorEntrar } = await supabase.auth.signInWithPassword({ email, password })
      if (errorEntrar) setError(mensajeDeError(errorEntrar))
    } catch (excepcion) {
      setError(mensajeDeError(excepcion))
    } finally {
      setAccionEnCurso(null)
    }
  }

  async function crearCuenta() {
    if (!supabase) {
      setError(MENSAJE_SIN_CONFIG)
      return
    }
    setError(null)
    setAvisoConfirmacion(false)
    setAccionEnCurso('crear')
    try {
      const { error: errorCrear } = await supabase.auth.signUp({ email, password })
      if (errorCrear) {
        // QPS-124: el error del alta nunca muestra el texto crudo de la API
        // (confirmaría si el email ya existe); el mismo mensaje que la web.
        setError(mensajeErrorAlta(errorCrear))
      } else {
        setAvisoConfirmacion(true)
      }
    } catch (excepcion) {
      setError(mensajeErrorAlta(excepcion))
    } finally {
      setAccionEnCurso(null)
    }
  }

  async function entrarConGoogle() {
    if (!supabase || !googleWebClientId) {
      setError(MENSAJE_SIN_CONFIG)
      return
    }
    setError(null)
    setAccionEnCurso('google')
    try {
      GoogleSignin.configure({ webClientId: googleWebClientId })
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const respuesta = await GoogleSignin.signIn()
      if (isCancelledResponse(respuesta)) {
        // El usuario canceló el flujo: no es un error (F8), no se muestra nada.
        return
      }
      if (!isSuccessResponse(respuesta)) {
        setError(MENSAJE_GENERICO)
        return
      }
      const idToken = respuesta.data.idToken
      if (!idToken) {
        setError(MENSAJE_SIN_ID_TOKEN)
        return
      }
      const { error: errorGoogle } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })
      if (errorGoogle) setError(mensajeDeError(errorGoogle))
    } catch (excepcion) {
      // F8: solo el código del error de Google sale hacia Sentry/console;
      // el mensaje al usuario sigue siendo genérico salvo que Play Services
      // no esté disponible.
      registrarErrorGoogle(excepcion)
      setError(mensajeErrorGoogle(codigoErrorGoogle(excepcion)))
    } finally {
      setAccionEnCurso(null)
    }
  }

  async function salir() {
    if (!supabase) return
    setError(null)
    setAccionEnCurso('salir')
    try {
      const entroConGoogle = session?.user.app_metadata.provider === 'google'
      await supabase.auth.signOut()
      if (entroConGoogle) {
        try {
          await GoogleSignin.signOut()
        } catch {
          // No estaba firmado con Google del lado nativo: no pasa nada.
        }
      }
    } catch (excepcion) {
      setError(mensajeDeError(excepcion))
    } finally {
      setAccionEnCurso(null)
    }
  }

  if (session) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={estilos.contenedorSesion}>
        <Text style={estilos.titulo}>Cuenta</Text>
        <Text style={estilos.texto}>{session.user.email}</Text>
        {error ? <Text style={estilos.error}>{error}</Text> : null}
        <Pressable
          onPress={salir}
          disabled={accionEnCurso !== null}
          style={estilos.boton(accionEnCurso !== null)}
        >
          {accionEnCurso === 'salir' ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Salir</Text>}
        </Pressable>

        <SeccionRadar />
        <SeccionNotificaciones />

        {/* F9: volver a ver la Bienvenida, al pie de Cuenta. */}
        <Pressable onPress={() => router.push('/bienvenida')} style={estilos.linkBienvenida}>
          <Text style={[estilos.textoLinkBienvenida, { color: colors.text }]}>Ver la bienvenida</Text>
        </Pressable>
        <Text style={estilos.version}>{version}</Text>
      </ScrollView>
    )
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Cuenta</Text>
      <CampoTexto
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <CampoTexto
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="Contraseña"
        secureTextEntry
        mostrarOcultar
        autoCapitalize="none"
      />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {avisoConfirmacion ? (
        <Text style={estilos.texto}>Te mandamos un email para confirmar la cuenta.</Text>
      ) : null}
      <Pressable onPress={entrar} disabled={accionEnCurso !== null} style={estilos.boton(accionEnCurso !== null)}>
        {accionEnCurso === 'entrar' ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Entrar</Text>}
      </Pressable>
      <Pressable onPress={crearCuenta} disabled={accionEnCurso !== null} style={estilos.boton(accionEnCurso !== null)}>
        {accionEnCurso === 'crear' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={estilos.textoBoton}>Crear cuenta</Text>
        )}
      </Pressable>
      {googleWebClientId ? (
        <GoogleSigninButton
          size={GoogleSigninButton.Size.Wide}
          color={esquema === 'dark' ? GoogleSigninButton.Color.Dark : GoogleSigninButton.Color.Light}
          disabled={accionEnCurso !== null}
          onPress={entrarConGoogle}
        />
      ) : null}

      {/* F9: volver a ver la Bienvenida, al pie de Cuenta. */}
      <Pressable onPress={() => router.push('/bienvenida')} style={estilos.linkBienvenida}>
        <Text style={[estilos.textoLinkBienvenida, { color: colors.text }]}>Ver la bienvenida</Text>
      </Pressable>
      <Text style={estilos.version}>{version}</Text>
    </View>
  )
}
