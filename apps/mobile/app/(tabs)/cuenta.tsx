// Pantalla de Cuenta (R24; 29-c la rehace para la paridad visual con la web,
// ops/paridad-web-app.md §3.9 e inventario-web-mobile.md "Auth"): sin
// sesión, el login con el estilo de /auth/login (logo + wordmark, card,
// CampoTexto, BotonGoogle, patrón de fondo); con sesión, el avatar con la
// inicial del email, Notificaciones, los accesos a "Mi Radar Salteño" y
// "Mis Favoritos" (los textos del dropdown de navbar.tsx) y "Cerrar sesión"
// chico al final. El Radar ya no vive acá: es su propia pestaña (R29), así
// que SeccionRadar se va de esta pantalla (el archivo se borró el 16/10).
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin'
import { mensajeErrorAlta } from '@qps/core/auth/mensajes'
import LOGO_MARCA from '@/assets/logo-circular.png'
import WORDMARK from '@/assets/titulo-horizontal.png'
import PATRON_MARCA from '@/assets/patron-claro.png'
import { BotonGoogle } from '@/components/BotonGoogle'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando } from '@/components/EstadoCarga'
import { Icono, type NombreIcono } from '@/components/Icono'
import { SeccionNotificaciones } from '@/components/SeccionNotificaciones'
import { Texto } from '@/components/Texto'
import { hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { codigoErrorGoogle, mensajeErrorGoogle, registrarErrorGoogle } from '@/lib/google'
import { leerEnv } from '@/lib/env'
import { urlSitio } from '@/lib/links'
import { borrarTokenDeEsteTelefono } from '@/lib/push/registro'
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
// segunda línea (independiente del link "¿Olvidaste tu contraseña?" de más
// abajo, que ahora sí existe en la app, R29-h).
const SUGERENCIA_GOOGLE = 'Si entraste con Google, usá el botón de Google.'
// F4: el rojo fijo de R24 no se leía en tema oscuro. D1 (29-g): la app
// siempre arranca oscura, así que ya no depende de useColorScheme().
const COLOR_ERROR = '#f87171'

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

// Fila de acceso con chevron ("Mi Radar Salteño" / "Mis Favoritos"): mismos
// textos que el dropdown de la web (navbar.tsx). `Icono` no tiene un
// `ChevronRight` en su lista cerrada (QPS-125): se rota `ChevronDown` -90°.
interface FilaAccesoProps {
  icono: NombreIcono
  texto: string
  onPress: () => void
}

function FilaAcceso({ icono, texto, onPress }: FilaAccesoProps) {
  const colores = useColoresQPS()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={texto}
      style={[estilosFila.fila, { borderBottomColor: colores.border }]}
    >
      <View style={estilosFila.izquierda}>
        <Icono nombre={icono} color={colores.primary} tamanio={20} />
        <Texto peso="semibold">{texto}</Texto>
      </View>
      <View style={{ transform: [{ rotate: '-90deg' }] }}>
        <Icono nombre="ChevronDown" color={colores.mutedForeground} tamanio={18} />
      </View>
    </Pressable>
  )
}

const estilosFila = StyleSheet.create({
  fila: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  izquierda: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})

export default function Cuenta() {
  const colores = useColoresQPS()
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
    pantalla: { flex: 1, backgroundColor: colores.background },
    contenedorLogin: {
      flexGrow: 1,
      alignItems: 'center' as const,
      padding: 24,
      gap: 16,
    },
    contenedorSesion: {
      flexGrow: 1,
      alignItems: 'center' as const,
      padding: 24,
      gap: 8,
    },
    aroLogo: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 2,
      borderColor: 'rgba(193, 32, 38, 0.7)',
      padding: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    logo: { width: 72, height: 72, borderRadius: 36 },
    wordmark: { width: 180, height: 44, resizeMode: 'contain' as const },
    card: {
      width: '100%' as const,
      backgroundColor: colores.card,
      borderColor: colores.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 20,
      gap: 14,
    },
    separador: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginVertical: 2,
    },
    lineaSeparador: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colores.border },
    error: { color: COLOR_ERROR },
    boton: (deshabilitado: boolean) => ({
      width: '100%' as const,
      backgroundColor: deshabilitado ? colores.border : colores.primary,
      borderRadius: 8,
      padding: 12,
      minHeight: 48,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    }),
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colores.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: 4,
    },
    linkBienvenida: { marginTop: 8, padding: 8 },
    version: { fontSize: 11, marginTop: 4 },
    salir: { marginTop: 20, padding: 8 },
    // 37-d: "Eliminar mi cuenta", lejos de "Entrar"/"Crear cuenta" y después
    // de "Cerrar sesión" (acción destructiva, nunca cerca de los botones
    // principales).
    eliminarCuenta: { marginTop: 8, padding: 8 },
  }

  if (cargando) {
    return (
      <View style={[estilos.pantalla, { alignItems: 'center', justifyContent: 'center' }]}>
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

  // F6 (29-e dejó /auth/recuperar en la web; esto es el link que faltaba en
  // la app, R29-h): abre la ruta propia validada por `urlSitio`, nunca una
  // URL armada a mano (ver tests/aperturas-url.test.ts).
  function abrirRecuperarContrasenia() {
    const url = urlSitio('/auth/recuperar')
    if (!url) return
    Linking.openURL(url).catch(() => {})
  }

  async function salir() {
    if (!supabase) return
    setError(null)
    setAccionEnCurso('salir')
    try {
      const entroConGoogle = session?.user.app_metadata.provider === 'google'
      // Ronda 41, 41-e: borra la fila del token de este teléfono antes de
      // cerrar la sesión. `borrarTokenDeEsteTelefono` (41-c) nunca tira, así
      // que no se envuelve en su propio try/catch (eso ocultaría si algún
      // día empieza a tirar).
      await borrarTokenDeEsteTelefono()
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
    const inicial = session.user.email ? session.user.email.charAt(0).toUpperCase() : '?'
    return (
      <ScrollView
        style={estilos.pantalla}
        contentContainerStyle={estilos.contenedorSesion}
        keyboardShouldPersistTaps="handled"
      >
        <View style={estilos.avatar}>
          <Texto peso="bold" style={{ color: colores.primaryForeground, fontSize: 24 }}>
            {inicial}
          </Texto>
        </View>
        <Texto peso="semibold">{session.user.email}</Texto>

        {error ? <Texto style={estilos.error}>{error}</Texto> : null}

        <SeccionNotificaciones />

        <FilaAcceso icono="Radio" texto="Mi Radar Salteño" onPress={() => router.push('/radar')} />
        <FilaAcceso icono="Heart" texto="Mis Favoritos" onPress={() => router.push('/favoritos')} />

        {/* F9: volver a ver la Bienvenida, al pie de Cuenta. */}
        <Pressable onPress={() => router.push('/bienvenida')} accessibilityRole="button" style={estilos.linkBienvenida}>
          <Texto peso="semibold" tono="primario" style={{ fontSize: 13, textDecorationLine: 'underline' }}>
            Ver la bienvenida
          </Texto>
        </Pressable>
        <Texto tono="secundario" style={estilos.version}>
          {version}
        </Texto>

        {/* "Cerrar sesión" al final, chico: nunca el botón principal. */}
        <Pressable
          onPress={salir}
          disabled={accionEnCurso !== null}
          accessibilityRole="button"
          style={estilos.salir}
        >
          {accionEnCurso === 'salir' ? (
            <ActivityIndicator color={colores.mutedForeground} />
          ) : (
            <Texto tono="secundario" style={{ fontSize: 13 }}>
              Cerrar sesión
            </Texto>
          )}
        </Pressable>

        {/* 37-d: "Eliminar mi cuenta", acción destructiva, bien abajo
            (después de "Cerrar sesión"), nunca cerca de los botones
            principales. */}
        <Pressable
          onPress={() => router.push('/eliminar-cuenta')}
          accessibilityRole="button"
          accessibilityLabel="Eliminar mi cuenta"
          style={estilos.eliminarCuenta}
        >
          <Texto style={{ fontSize: 12, color: COLOR_ERROR }}>Eliminar mi cuenta</Texto>
        </Pressable>
      </ScrollView>
    )
  }

  return (
    <View style={estilos.pantalla}>
      {/* Patrón de marca al 4%, como /auth/login en la web. */}
      <ImageBackground
        source={PATRON_MARCA}
        resizeMode="repeat"
        style={StyleSheet.absoluteFill}
        imageStyle={{ opacity: 0.04 }}
      />
      <ScrollView
        contentContainerStyle={estilos.contenedorLogin}
        keyboardShouldPersistTaps="handled"
      >
        <View style={estilos.aroLogo}>
          <Image source={LOGO_MARCA} style={estilos.logo} />
        </View>
        <Image source={WORDMARK} style={estilos.wordmark} />

        <View style={estilos.card}>
          <Texto peso="bold" accessibilityRole="header" style={{ fontSize: 20 }}>
            Iniciar Sesion
          </Texto>

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

          {/* F6 (29-e la dejó armada en la web; esto es el link que faltaba
              en la app, R29-h): abre /auth/recuperar con urlSitio. Abre afuera
              de la app (rol "link"). Alto real: una sola línea de texto,
              fontSize 13, sin padding propio (~18dp) — hitSlopPara(300, 18)
              agrega 15dp arriba/abajo (300 asegura 0 horizontal: el texto ya
              es mucho más ancho que 48). */}
          <Pressable onPress={abrirRecuperarContrasenia} accessibilityRole="link" hitSlop={hitSlopPara(300, 18)}>
            <Texto tono="primario" style={{ fontSize: 13, textDecorationLine: 'underline' }}>
              ¿Olvidaste tu contraseña?
            </Texto>
          </Pressable>

          {error ? <Texto style={estilos.error}>{error}</Texto> : null}
          {avisoConfirmacion ? (
            <Texto tono="secundario">Te mandamos un email para confirmar la cuenta.</Texto>
          ) : null}

          <Pressable
            onPress={entrar}
            disabled={accionEnCurso !== null}
            accessibilityRole="button"
            accessibilityState={{ busy: accionEnCurso !== null }}
            style={estilos.boton(accionEnCurso !== null)}
          >
            {accionEnCurso === 'entrar' ? (
              <ActivityIndicator color={colores.primaryForeground} />
            ) : (
              <Texto peso="semibold" style={{ color: colores.primaryForeground }}>
                Entrar
              </Texto>
            )}
          </Pressable>

          <Pressable
            onPress={crearCuenta}
            disabled={accionEnCurso !== null}
            accessibilityRole="button"
            accessibilityState={{ busy: accionEnCurso !== null }}
            style={estilos.boton(accionEnCurso !== null)}
          >
            {accionEnCurso === 'crear' ? (
              <ActivityIndicator color={colores.primaryForeground} />
            ) : (
              <Texto peso="semibold" style={{ color: colores.primaryForeground }}>
                Crear cuenta
              </Texto>
            )}
          </Pressable>

          {googleWebClientId ? (
            <View style={estilos.separador}>
              <View style={estilos.lineaSeparador} />
              <Texto tono="secundario" style={{ fontSize: 11 }}>
                O continuar con
              </Texto>
              <View style={estilos.lineaSeparador} />
            </View>
          ) : null}

          <BotonGoogle
            onPress={entrarConGoogle}
            cargando={accionEnCurso === 'google'}
            disabled={accionEnCurso !== null}
          />
        </View>

        {/* F9: volver a ver la Bienvenida, al pie de Cuenta. */}
        <Pressable onPress={() => router.push('/bienvenida')} accessibilityRole="button" style={estilos.linkBienvenida}>
          <Texto peso="semibold" tono="primario" style={{ fontSize: 13, textDecorationLine: 'underline' }}>
            Ver la bienvenida
          </Texto>
        </Pressable>
        <Texto tono="secundario" style={estilos.version}>
          {version}
        </Texto>
      </ScrollView>
    </View>
  )
}
