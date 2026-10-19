// Pantalla "Contraseña" (R48, tarea 48-d): crear o cambiar la contraseña con
// la sesión vigente. Los textos (título, descripción y el texto del botón)
// salen de `textosContrasena(tipoDeCuenta(session.user))`
// (`@qps/core/auth/cuenta`, tarea 48-a): con Google, "Contraseña" (crea la
// primera); con email, "Cambiar contraseña".
//
// Ruta raíz (fuera de `(tabs)`), igual que `app/eliminar-cuenta.tsx`: el
// título se fija desde este mismo componente con `<Stack.Screen options=...
// />` (el `<Stack>` de `app/_layout.tsx` no está entre los archivos
// permitidos de esta tarea).
//
// Sin sesión no tiene sentido estar acá (se llega solo tocando la fila
// "Contraseña"/"Cambiar contraseña" de `app/(tabs)/cuenta.tsx`, que ya exige
// sesión): se redirige a `/cuenta` con `router.replace` en un `useEffect`
// (nunca durante el render, para no disparar la navegación como efecto
// secundario de renderizar).
//
// La lógica de guardado (validar + `supabase.auth.updateUser`) vive en
// `lib/contrasena.ts`, no acá — ver ese archivo para la garantía de que la
// contraseña nunca se loguea ni se guarda en ningún lado. Esta pantalla solo
// arma la UI y le pasa los dos valores que escribió la persona.
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { textosContrasena, tipoDeCuenta } from '@qps/core/auth/cuenta'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { guardarContrasena } from '@/lib/contrasena'
import { useSession } from '@/lib/session'

// Mismo criterio que `app/(tabs)/cuenta.tsx` y `app/eliminar-cuenta.tsx`: un
// rojo fijo para el error, nunca leído de `useColorScheme()` (D1, 29-g: la
// app arranca siempre oscura). Duplicado acá porque esta pantalla no está
// entre los archivos permitidos de esas tareas.
const COLOR_ERROR = '#f87171'

export default function Contrasena() {
  const router = useRouter()
  const colores = useColoresQPS()
  const { session, cargando } = useSession()

  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardada, setGuardada] = useState(false)

  useEffect(() => {
    if (!cargando && !session) router.replace('/cuenta')
  }, [cargando, session, router])

  if (cargando || !session) {
    return (
      <View style={[estilos.centrado, { backgroundColor: colores.background }]}>
        <Cargando />
      </View>
    )
  }

  const textos = textosContrasena(tipoDeCuenta(session.user))

  async function guardar() {
    setError(null)
    setGuardando(true)
    const resultado = await guardarContrasena(nueva, repetida)
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }
    setGuardada(true)
  }

  if (guardada) {
    return (
      <View style={[estilos.centrado, { backgroundColor: colores.background, padding: 24, gap: 16 }]}>
        <Stack.Screen options={{ title: textos.titulo }} />
        <Texto style={{ textAlign: 'center' }}>
          Contraseña guardada. Ya podés entrar con tu email y esta contraseña.
        </Texto>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={estilos.botonVolver(colores.primary)}>
          <Texto peso="semibold" style={{ color: colores.primaryForeground }}>
            Volver
          </Texto>
        </Pressable>
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colores.background }}
      contentContainerStyle={estilos.contenedor}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: textos.titulo }} />

      <Texto peso="bold" accessibilityRole="header" style={{ fontSize: 20 }}>
        {textos.titulo}
      </Texto>
      <Texto tono="secundario">{textos.descripcion}</Texto>

      <CampoTexto
        label="Contraseña nueva"
        value={nueva}
        onChangeText={setNueva}
        placeholder="Contraseña nueva"
        secureTextEntry
        mostrarOcultar
        autoCapitalize="none"
        autoComplete="off"
        editable={!guardando}
      />
      <CampoTexto
        label="Repetila"
        value={repetida}
        onChangeText={setRepetida}
        placeholder="Repetila"
        secureTextEntry
        mostrarOcultar
        autoCapitalize="none"
        autoComplete="off"
        editable={!guardando}
      />

      {error ? <Texto style={{ color: COLOR_ERROR }}>{error}</Texto> : null}

      <Pressable
        onPress={guardar}
        disabled={guardando}
        accessibilityRole="button"
        accessibilityState={{ busy: guardando }}
        style={estilos.boton(guardando, colores.primary, colores.border)}
      >
        {guardando ? (
          <ActivityIndicator color={colores.primaryForeground} />
        ) : (
          <Texto peso="semibold" style={{ color: colores.primaryForeground }}>
            {textos.boton}
          </Texto>
        )}
      </Pressable>
    </ScrollView>
  )
}

const estilos = {
  centrado: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  contenedor: { flexGrow: 1, padding: 24, gap: 14 },
  // Alto real de 48dp (AREA_TACTIL_MINIMA de lib/accesibilidad.ts), igual que
  // el botón de `app/eliminar-cuenta.tsx`: `minHeight` + centrado, no solo el
  // padding vertical.
  boton: (deshabilitado: boolean, color: string, colorDeshabilitado: string) => ({
    width: '100%' as const,
    minHeight: 48,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: deshabilitado ? colorDeshabilitado : color,
  }),
  botonVolver: (color: string) => ({
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: color,
  }),
}
