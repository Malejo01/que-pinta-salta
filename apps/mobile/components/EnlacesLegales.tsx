// EnlacesLegales (QPS-237, ronda 49): los links a los documentos legales
// (Política de privacidad siempre; Términos y condiciones solo si
// `TERMINOS_PUBLICADOS`, ver lib/legales.ts) y, opcionalmente, la línea de
// aceptación de arriba. Vive aparte de `app/(tabs)/cuenta.tsx` para no
// sumarle `Pressable` sueltos a esa pantalla: tests/a11y-pantallas.test.ts
// exige exactamente 8, y los que agrega este componente no cuentan ahí.
//
// Nunca el tono primario de Texto (QPS-241: `primary` deja de usarse para
// texto chico en oscuro): el texto de los links va en `foreground` (el tono
// por defecto de `Texto`) y subrayado; el de aceptación, chico, va en
// mutedForeground (tono secundario).
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { enlacesLegales, textoAceptacion } from '@/lib/legales'
import { urlSitio } from '@/lib/links'

export interface EnlacesLegalesProps {
  /** Muestra, arriba de los links, la línea de aceptación (rama sin sesión de cuenta.tsx). */
  conAceptacion?: boolean
}

export function EnlacesLegales({ conAceptacion = false }: EnlacesLegalesProps) {
  const enlaces = enlacesLegales()

  // Misma forma que abrirRecuperarContrasenia (cuenta.tsx): urlSitio valida
  // contra la lista cerrada y devuelve null si la ruta no está habilitada
  // (p. ej. /terminos mientras TERMINOS_PUBLICADOS sea false); nunca se abre
  // una URL armada a mano.
  function abrir(ruta: string) {
    const url = urlSitio(ruta)
    if (!url) return
    Linking.openURL(url).catch(() => {})
  }

  return (
    <View style={estilos.contenedor}>
      {conAceptacion ? (
        <Texto tono="secundario" style={estilos.aceptacion}>
          {textoAceptacion()}
        </Texto>
      ) : null}
      <View style={estilos.fila}>
        {enlaces.map((enlace) => (
          <Pressable
            key={enlace.ruta}
            onPress={() => abrir(enlace.ruta)}
            accessibilityRole="link"
            accessibilityLabel={enlace.texto}
            style={estilos.link}
          >
            <Texto style={estilos.textoLink}>{enlace.texto}</Texto>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { width: '100%', alignItems: 'center', gap: 4 },
  aceptacion: { fontSize: 11, textAlign: 'center' },
  fila: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  // 48 dp con minHeight + justifyContent (no solo hitSlop): así el detector
  // area-chica de 49-e, que sin style no evalúa nada, lo mide por la regla
  // que ya mira StyleSheet.create.
  link: { minHeight: 48, justifyContent: 'center' },
  textoLink: { fontSize: 12, textDecorationLine: 'underline' },
})
