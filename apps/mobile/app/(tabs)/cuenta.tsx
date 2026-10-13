// Pantalla de Cuenta (R24): email y contraseña con las mismas cuentas que la
// web (decisión 3 de Mauro), Google detrás de EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
// (decisión 2) y Salir. El login es opcional: esta es la única pantalla que
// cambia según haya o no sesión.
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { useTheme } from 'expo-router'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { mensajeErrorAlta } from '@qps/core/auth/mensajes'
import { leerEnv } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/session'

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

function mensajeDeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const registro = error as Record<string, unknown>
    if (typeof registro.code === 'string' && MENSAJES_ERROR[registro.code]) {
      return MENSAJES_ERROR[registro.code]
    }
    if (typeof registro.message === 'string' && /invalid login credentials/i.test(registro.message)) {
      return MENSAJES_ERROR.invalid_credentials
    }
  }
  return MENSAJE_GENERICO
}

export default function Cuenta() {
  const { colors } = useTheme()
  const { session, cargando } = useSession()
  const { googleWebClientId } = leerEnv()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [accionEnCurso, setAccionEnCurso] = useState<'entrar' | 'crear' | 'google' | 'salir' | null>(null)
  const [avisoConfirmacion, setAvisoConfirmacion] = useState(false)

  const estilos = {
    contenedor: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24, gap: 12 },
    titulo: { color: colors.text, fontSize: 18, fontWeight: '600' as const, marginBottom: 8 },
    texto: { color: colors.text },
    error: { color: '#dc2626' },
    input: {
      width: '100%' as const,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      color: colors.text,
    },
    boton: (deshabilitado: boolean) => ({
      width: '100%' as const,
      backgroundColor: deshabilitado ? colors.border : colors.primary,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center' as const,
    }),
    textoBoton: { color: '#fff', fontWeight: '600' as const },
  }

  if (cargando) {
    return (
      <View style={estilos.contenedor}>
        <ActivityIndicator />
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
      if (respuesta.type === 'cancelled') {
        // El usuario canceló el flujo: no es un error.
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
      setError(mensajeDeError(excepcion))
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
      <View style={estilos.contenedor}>
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
      </View>
    )
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Cuenta</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.border}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={estilos.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Contraseña"
        placeholderTextColor={colors.border}
        secureTextEntry
        autoCapitalize="none"
        style={estilos.input}
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
        <Pressable onPress={entrarConGoogle} disabled={accionEnCurso !== null} style={estilos.boton(accionEnCurso !== null)}>
          {accionEnCurso === 'google' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={estilos.textoBoton}>Entrar con Google</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}
