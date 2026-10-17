// Pantalla "Eliminar mi cuenta" (R37, tarea 37-d), paridad con la web
// (`/perfil/eliminar-cuenta`, `apps/web/app/perfil/eliminar-cuenta/page.tsx`
// y `eliminar-cuenta-form.tsx`: mismos textos de qué se borra, qué no, y que
// es para siempre).
//
// Ruta raíz (fuera de `(tabs)`), igual que `app/flyer/[id].tsx`: el
// `<Stack>` de `app/_layout.tsx` solo declara `bienvenida` y `(tabs)`, así
// que las demás rutas raíz usan el header por defecto (que mostraría el
// nombre del archivo, "eliminar-cuenta" — fiero en una pantalla destructiva,
// y es la que mira Google Play). El título se fija desde este mismo
// componente con `<Stack.Screen options={{ title: ... }} />`, sin tocar
// `_layout.tsx` (fuera de los archivos permitidos de esta tarea).
//
// Toda la lógica de después del borrado (eliminarMiCuenta,
// limpiarTrasEliminarCuenta, completarEliminacionDeCuenta) vive en
// `lib/cuenta.ts`, no acá: así se puede probar sin montar nada de React
// Native (`tests/eliminar-cuenta.test.ts`). Esta pantalla solo arma la UI y
// le pasa a `completarEliminacionDeCuenta` el token de la sesión y
// `() => router.replace('/bienvenida')`.
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { completarEliminacionDeCuenta, confirmacionValida } from '@/lib/cuenta'
import { useSession } from '@/lib/session'

// Mismo criterio que `app/(tabs)/cuenta.tsx` (ver su comentario: F4 de la
// R24, D1 de 29-g): un rojo fijo para texto de error/acción destructiva,
// nunca leído de `useColorScheme()` — la app arranca siempre oscura.
// Duplicado acá porque esta pantalla no puede importar nada de `cuenta.tsx`
// (archivos permitidos de la tarea 37-d).
const COLOR_ERROR = '#f87171'

export default function EliminarCuenta() {
  const router = useRouter()
  const colores = useColoresQPS()
  const { session, cargando } = useSession()

  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const habilitado = confirmacionValida(texto) && !enviando && Boolean(session?.access_token)

  async function eliminar() {
    if (!habilitado || !session?.access_token) return
    setError(null)
    setEnviando(true)

    const entroConGoogle = session.user.app_metadata.provider === 'google'
    const resultado = await completarEliminacionDeCuenta(session.access_token, entroConGoogle, {
      navegarABienvenida: () => router.replace('/bienvenida'),
    })

    if (!resultado.ok) {
      setError(resultado.mensaje)
      setEnviando(false)
    }
    // Si salió bien, completarEliminacionDeCuenta ya navegó a /bienvenida:
    // esta pantalla deja de estar montada, así que no hace falta (ni
    // conviene) tocar más estado acá.
  }

  if (cargando) {
    return (
      <View style={[estilos.centrado, { backgroundColor: colores.background }]}>
        <Stack.Screen options={{ title: 'Eliminar mi cuenta' }} />
        <Cargando />
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colores.background }}
      contentContainerStyle={estilos.contenedor}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: 'Eliminar mi cuenta' }} />

      <Texto peso="bold" style={{ fontSize: 20, color: COLOR_ERROR }}>
        Eliminar mi cuenta
      </Texto>
      <Texto tono="secundario">Esta acción es para siempre y no se puede deshacer.</Texto>

      {session?.user.email ? <Texto>Cuenta: {session.user.email}</Texto> : null}

      <View style={estilos.bloque}>
        <Texto peso="semibold">Qué se borra:</Texto>
        <Texto>• Tus favoritos.</Texto>
        <Texto>• Tus marcas de &quot;Voy&quot; y &quot;Me interesa&quot;.</Texto>
        <Texto>• Las preferencias de Mi Radar y de notificaciones.</Texto>
        <Texto>• Los avisos que tenés activados.</Texto>
        <Texto>• Los tokens de aviso de tu celular.</Texto>
        <Texto>• La cuenta misma, con tu email y tu contraseña.</Texto>
      </View>

      <View style={estilos.bloque}>
        <Texto peso="semibold">Qué no se borra:</Texto>
        <Texto tono="secundario">
          Los eventos que cargaste siguen publicados, pero quedan sin tu nombre: pasan a figurar sin autor.
        </Texto>
      </View>

      <CampoTexto
        label="Escribí ELIMINAR para confirmar"
        value={texto}
        onChangeText={setTexto}
        placeholder="ELIMINAR"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        editable={!enviando}
      />

      {error ? <Texto style={{ color: COLOR_ERROR }}>{error}</Texto> : null}

      <Pressable
        onPress={eliminar}
        disabled={!habilitado}
        accessibilityRole="button"
        accessibilityLabel="Eliminar mi cuenta para siempre"
        style={estilos.boton(habilitado, colores.border)}
      >
        {enviando ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Texto peso="semibold" style={{ color: '#ffffff' }}>
            Eliminar mi cuenta para siempre
          </Texto>
        )}
      </Pressable>
    </ScrollView>
  )
}

const estilos = {
  centrado: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  contenedor: { flexGrow: 1, padding: 24, gap: 14 },
  bloque: { gap: 4 },
  boton: (habilitado: boolean, colorDeshabilitado: string) => ({
    width: '100%' as const,
    minHeight: 44,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: habilitado ? COLOR_ERROR : colorDeshabilitado,
  }),
}
