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
import { textosContrasena, tipoDeCuenta, validarContrasenaNueva } from '@qps/core/auth/cuenta'
import { MENSAJE_ALTA_CON_SESION, MENSAJE_ALTA_ENVIADA, mensajeErrorAlta, mensajeErrorIngreso, resultadoAltaConSesion } from '@qps/core/auth/mensajes'
import LOGO_MARCA from '@/assets/logo-circular.png'
import WORDMARK from '@/assets/titulo-horizontal.png'
import PATRON_MARCA from '@/assets/patron-claro.png'
import { BotonGoogle } from '@/components/BotonGoogle'
import { CampoTexto } from '@/components/CampoTexto'
import { EnlacesLegales } from '@/components/EnlacesLegales'
import { Cargando } from '@/components/EstadoCarga'
import { Icono, type NombreIcono } from '@/components/Icono'
import { LoQueSeguis } from '@/components/LoQueSeguis'
import { SeccionNotificaciones } from '@/components/SeccionNotificaciones'
import { Texto } from '@/components/Texto'
import { hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { codigoErrorGoogle, mensajeErrorGoogle, registrarErrorGoogle } from '@/lib/google'
import { leerEnv } from '@/lib/env'
import { urlSitio } from '@/lib/links'
import { borrarTokenDeEsteTelefono } from '@/lib/push/registro'
import { supabase } from '@/lib/supabase'
import { avisar } from '@/lib/aviso'
import { useSession } from '@/lib/session'
import { textoVersion } from '@/lib/version'

// Mapeo corto de códigos conocidos de @supabase/auth-js a mensajes en
// español. Nunca se muestra el texto crudo de la API.
//
// R48, 48-d (vuelta 2): `entrar` (el único camino que podía producir
// `invalid_credentials`/`email_not_confirmed`) pasó a `mensajeErrorIngreso`
// de `@qps/core/auth/mensajes` — decisión de Mauro, el plan de la ronda ya
// fijaba esos textos. El mapa queda para `entrarConGoogle`/`salir()`, que
// hoy no producen esos dos códigos: no se borran (quedan anotadas abajo)
// para que el PR las vea.
const MENSAJES_ERROR: Record<string, string> = {
  // Sin uso real: ni `entrarConGoogle` ni `salir()` producen este código.
  // El mensaje unificado de `mensajeErrorIngreso` quedó en UNA sola línea
  // (perdió el `\n` + "Si entraste con Google…" que tenía acá, porque un
  // `\n` no corta nada en HTML) — si hace falta recuperar el corte, hay que
  // partirlo en core (`@qps/core/auth/mensajes`), no volver a escribirlo acá.
  invalid_credentials: 'El email o la contraseña no son correctos.',
  // Sin uso real: `entrar` era el único camino que podía producir este código.
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
  // R67, 67-d: el alta con sesión pasa de la vista del formulario a la de
  // sesión; el estado vive en `Cuenta` (no se desmonta), así el texto
  // sobrevive al cambio de vista. Se guarda el email con el que se hizo el
  // alta (no un booleano) y se muestra solo si coincide con el de la sesión
  // actual: si la sesión cambia a otra cuenta (token revocado, otro
  // dispositivo, otro ingreso), el aviso no aparece, sin `useEffect` ni
  // leer `data` de la respuesta. Además se apaga a mano en `entrar`,
  // `entrarConGoogle` y `salir`.
  const [avisoAltaConSesionPara, setAvisoAltaConSesionPara] = useState<string | null>(null)
  const mostrarAvisoAltaConSesion =
    avisoAltaConSesionPara !== null &&
    session?.user.email?.trim().toLowerCase() === avisoAltaConSesionPara

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
    setAvisoAltaConSesionPara(null)
    setAccionEnCurso('entrar')
    try {
      // R48, 48-d (vuelta 2): `entrar` pasa a `mensajeErrorIngreso` de core
      // (el plan de la ronda ya fijaba estos textos — ver los comentarios de
      // `MENSAJES_ERROR`, arriba, sobre qué cambió para cada código): una
      // sola definición de estos mensajes, compartida con la web.
      const { error: errorEntrar } = await supabase.auth.signInWithPassword({ email, password })
      if (errorEntrar) setError(mensajeErrorIngreso(errorEntrar))
    } catch (excepcion) {
      setError(mensajeErrorIngreso(excepcion))
    } finally {
      setAccionEnCurso(null)
    }
  }

  async function crearCuenta() {
    if (!supabase) {
      setError(MENSAJE_SIN_CONFIG)
      return
    }
    // R48, 48-d: el alta tiene un solo campo de contraseña (no dos, como la
    // web) — se le pasa el mismo valor dos veces a `validarContrasenaNueva`
    // para reusar su mensaje y su `LARGO_MINIMO_CONTRASENA` sin inventar un
    // segundo campo; con los dos iguales, la única validación que puede
    // fallar es el largo mínimo (la de coincidencia nunca, `password ===
    // password`). Se valida ANTES de llamar a `signUp`.
    const validacionContrasena = validarContrasenaNueva(password, password)
    if (!validacionContrasena.ok) {
      setError(validacionContrasena.mensaje)
      setAvisoConfirmacion(false)
      return
    }
    setError(null)
    setAvisoConfirmacion(false)
    setAvisoAltaConSesionPara(null)
    setAccionEnCurso('crear')
    try {
      // QPS-124 (R48, 48-a; R67, 67-d): `resultadoAltaConSesion` clasifica la
      // respuesta en "sesion", "enviado" o "error". Dentro de "enviado" no
      // distingue si el email ya tenía cuenta — así el alta nunca puede
      // usarse para averiguar si un email está registrado. El tercer caso,
      // "sesion" (el alta nueva con "Confirm email" apagado), tampoco filtra
      // nada: un email registrado antes nunca vuelve con sesión, y quien
      // llega ahí entró a una cuenta nueva que él mismo creó. El error nunca
      // muestra el texto crudo de la API.
      const respuesta = await supabase.auth.signUp({ email, password })
      const resultado = resultadoAltaConSesion(respuesta)
      if (resultado.tipo === 'error') {
        setError(resultado.mensaje)
      } else if (resultado.tipo === 'sesion') {
        // R67, 67-d: supabase-js ya guardó la sesión y `useSession` la
        // levanta con `onAuthStateChange`: la pantalla pasa sola a la vista
        // con sesión. Toast en Android (`avisar`) y texto en línea en todas.
        setAvisoAltaConSesionPara(email.trim().toLowerCase())
        avisar(MENSAJE_ALTA_CON_SESION)
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
    setAvisoAltaConSesionPara(null)
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
    setAvisoAltaConSesionPara(null)
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
        {mostrarAvisoAltaConSesion ? <Texto tono="secundario">{MENSAJE_ALTA_CON_SESION}</Texto> : null}

        {error ? <Texto style={estilos.error}>{error}</Texto> : null}

        <SeccionNotificaciones />

        <FilaAcceso icono="Radio" texto="Mi Radar Salteño" onPress={() => router.push('/radar')} />
        <FilaAcceso icono="Heart" texto="Mis eventos" onPress={() => router.push('/favoritos')} />
        {/* R48, tarea 48-d: con Google dice "Contraseña" (crea la primera),
            con email "Cambiar contraseña" — mismo componente de fila que
            Radar/Favoritos, antes de "Cerrar sesión". El ícono "User" es el
            más cercano de la lista cerrada de `Icono.tsx` (QPS-125): no hay
            "Lock"/"KeyRound" (el que usa la web en
            `components/change-password-form.tsx`) y ese archivo no está
            entre los permitidos de esta tarea — reportado para una tarea
            futura que sume el ícono correcto. */}
        <FilaAcceso
          icono="User"
          texto={textosContrasena(tipoDeCuenta(session.user)).titulo}
          onPress={() => router.push('/contrasena')}
        />

        {/* R47, tarea 47-g (QPS-197): lo que el usuario sigue (lugares,
            cuentas de Instagram y categorías), debajo de los accesos. El
            `userId` lo lee esta pantalla (useSession, más arriba), no
            LoQueSeguis. */}
        <LoQueSeguis userId={session.user.id} />

        {/* F9: volver a ver la Bienvenida, al pie de Cuenta. */}
        <Pressable onPress={() => router.push('/bienvenida')} accessibilityRole="button" style={estilos.linkBienvenida}>
          <Texto peso="semibold" style={{ fontSize: 13, textDecorationLine: 'underline' }}>
            Ver la bienvenida
          </Texto>
        </Pressable>
        <Texto tono="secundario" style={estilos.version}>
          {version}
        </Texto>

        {/* QPS-237: los links legales, al pie, antes de "Cerrar sesión". */}
        <EnlacesLegales />

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
            Iniciar sesión
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
            <Texto style={{ fontSize: 13, textDecorationLine: 'underline' }}>
              ¿Olvidaste tu contraseña?
            </Texto>
          </Pressable>

          {error ? <Texto style={estilos.error}>{error}</Texto> : null}
          {avisoConfirmacion ? <Texto tono="secundario">{MENSAJE_ALTA_ENVIADA}</Texto> : null}

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

          {/* QPS-237: la línea de aceptación y los links legales, al crear
              cuenta o continuar con Google. */}
          <EnlacesLegales conAceptacion />
        </View>

        {/* F9: volver a ver la Bienvenida, al pie de Cuenta. */}
        <Pressable onPress={() => router.push('/bienvenida')} accessibilityRole="button" style={estilos.linkBienvenida}>
          <Texto peso="semibold" style={{ fontSize: 13, textDecorationLine: 'underline' }}>
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
