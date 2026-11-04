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
//
// Q6-1b: los textos salen del diccionario (`t.eliminarCuenta`). La lista de
// «qué se borra» en castellano es `es.eliminarCuenta.queSeBorra`, la que
// compara con la web `apps/web/tests/cuenta/play-pendientes.test.ts`; en
// inglés, su traducción. Los errores de `lib/cuenta.ts` se guardan en
// castellano y se muestran con `t.errores.traducir`. La palabra que se
// escribe sigue siendo ELIMINAR en los dos idiomas (la exige el servidor).
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { CONTACTO_EMAIL } from '@qps/core/contacto'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { useTextos } from '@/lib/i18n'
import { completarEliminacionDeCuenta, confirmacionValida } from '@/lib/cuenta'
import { useSession } from '@/lib/session'
import { useAnunciarAviso } from '@/lib/anunciar-aviso-hook'

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
  const textos = useTextos()
  const t = textos.eliminarCuenta

  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const habilitado = confirmacionValida(texto) && !enviando && Boolean(session?.access_token)
  // Q6-6: si el borrado falla, el error se le dice al lector de pantalla
  // (antes aparecía en silencio arriba del botón).
  useAnunciarAviso(error ? textos.errores.traducir(error) : null)

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
        <Stack.Screen options={{ title: t.titulo }} />
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
      <Stack.Screen options={{ title: t.titulo }} />

      <Texto peso="bold" accessibilityRole="header" style={{ fontSize: 20, color: COLOR_ERROR }}>
        {t.titulo}
      </Texto>
      <Texto tono="secundario">{t.paraSiempre}</Texto>

      {session?.user.email ? <Texto>{t.cuenta(session.user.email)}</Texto> : null}

      <View style={estilos.bloque}>
        <Texto peso="semibold">{t.queSeBorraTitulo}</Texto>
        {t.queSeBorra.map((item) => (
          <Texto key={item}>{`• ${item}`}</Texto>
        ))}
      </View>

      <View style={estilos.bloque}>
        <Texto peso="semibold">{t.queNoSeBorraTitulo}</Texto>
        <Texto tono="secundario">{t.queNoSeBorra}</Texto>
      </View>

      <View style={estilos.bloque}>
        <Texto tono="secundario">{t.escribinos}</Texto>
        <Texto selectable accessibilityLabel={t.correoContacto(CONTACTO_EMAIL)} accessibilityHint={t.comoCopiar}>
          {CONTACTO_EMAIL}
        </Texto>
        <Texto tono="secundario" style={{ fontSize: 12 }}>
          {t.comoCopiar}
        </Texto>
      </View>

      <CampoTexto
        label={t.confirmar}
        value={texto}
        onChangeText={setTexto}
        placeholder={t.palabra}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        editable={!enviando}
      />

      {error ? <Texto style={{ color: COLOR_ERROR }}>{textos.errores.traducir(error)}</Texto> : null}

      <Pressable
        onPress={eliminar}
        disabled={!habilitado}
        accessibilityRole="button"
        accessibilityLabel={t.boton}
        // Q6-6: mientras borra, «ocupado» (el `disabled` ya lo suma el Pressable).
        accessibilityState={{ busy: enviando }}
        style={estilos.boton(habilitado ? COLOR_ERROR : colores.border)}
      >
        {enviando ? (
          <ActivityIndicator color={habilitado ? COLOR_ERROR : colores.mutedForeground} />
        ) : (
          <Texto peso="semibold" style={{ color: habilitado ? COLOR_ERROR : colores.mutedForeground, textAlign: 'center' }}>
            {t.boton}
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
  // Ronda 49 (QPS-241, grupo 1): contorno en vez de relleno — blanco sobre
  // COLOR_ERROR daba 2,77, abajo del mínimo de "texto" (4,5), y esta es la
  // pantalla que Google mira para la ficha de Play. El fondo ya no cambia
  // (siempre transparent): lo que cambia con el estado es el color del
  // borde, que decide el llamador (`colorBorde`) — COLOR_ERROR habilitado,
  // `colores.border` deshabilitado.
  boton: (colorBorde: string) => ({
    width: '100%' as const,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 2,
    padding: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'transparent',
    borderColor: colorBorde,
  }),
}
