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
//
// R60, 52-d: se suma "Privacidad de los anuncios" (UMP/AdMob), visible SOLO
// cuando `necesitaOpcionesDePrivacidad()` da `true` (UE/Reino Unido/Suiza,
// según UMP; en Argentina, nunca). Va en una línea propia, debajo de la fila
// de links — no adentro de `estilos.fila`: esa fila es `accessibilityRole=
// "link"` (navegación a otra pantalla/URL), y esto es un `"button"` (abre un
// formulario nativo encima de la pantalla actual), una acción de otra
// familia. Mezclarlos en la misma fila horizontal haría que, para quien
// navega por lector de pantalla, los tres elementos "suenen" igual aunque
// uno se comporte distinto; aparte, la fila de links es de ancho fijo
// (`justifyContent: 'center'`, `gap: 16`) y la entrada nueva tiene un texto
// más largo que cualquier link de hoy, así que compartir fila la haría
// envolver en dos líneas de forma rara en pantallas angostas.
//
// Reactivo (no `necesitaOpcionesDePrivacidad()` leído una sola vez en el
// render): el estado de consentimiento se resuelve async al arrancar la app
// (`lib/anuncios/consentimiento.ts`), así que el valor inicial sincrónico
// puede ser `false` aunque la respuesta final sea `true` — `suscribirse` es
// la forma de enterarse cuando esa resolución (o el rechazo del
// consentimiento, el caso que más necesita ver el formulario) termina.
import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { mostrarOpcionesDePrivacidad, necesitaOpcionesDePrivacidad, suscribirse } from '@/lib/anuncios/consentimiento'
import { enlacesLegales, textoAceptacion } from '@/lib/legales'
import { urlSitio } from '@/lib/links'

export interface EnlacesLegalesProps {
  /** Muestra, arriba de los links, la línea de aceptación (rama sin sesión de cuenta.tsx). */
  conAceptacion?: boolean
}

export function EnlacesLegales({ conAceptacion = false }: EnlacesLegalesProps) {
  const enlaces = enlacesLegales()

  const [mostrarPrivacidadAnuncios, setMostrarPrivacidadAnuncios] = useState(necesitaOpcionesDePrivacidad())
  useEffect(() => suscribirse(() => setMostrarPrivacidadAnuncios(necesitaOpcionesDePrivacidad())), [])

  // Misma forma que abrirRecuperarContrasenia (cuenta.tsx): urlSitio valida
  // contra la lista cerrada y devuelve null si la ruta no está habilitada
  // (p. ej. /terminos si TERMINOS_PUBLICADOS vuelve a false); nunca se abre
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
      {mostrarPrivacidadAnuncios ? (
        <Pressable
          onPress={() => mostrarOpcionesDePrivacidad().catch(() => {})}
          accessibilityRole="button"
          accessibilityLabel="Privacidad de los anuncios"
          style={estilos.linkPrivacidad}
        >
          {/* Sin subrayado, a diferencia de los links de arriba (ux-ui, R60):
              el subrayado es la señal de "esto te saca de la app al
              navegador", y acá es al revés — abre el formulario de UMP
              encima de la pantalla. El `accessibilityRole="button"` ya lo
              distingue para el lector de pantalla; esto lo distingue para
              quien mira. */}
          <Texto style={estilos.textoPrivacidad}>Privacidad de los anuncios</Texto>
        </Pressable>
      ) : null}
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
  // Mismo criterio de 48 dp que `link`, en su propia línea (ver el comentario
  // de cabecera: no comparte `estilos.fila` con los links).
  linkPrivacidad: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  textoLink: { fontSize: 12, textDecorationLine: 'underline' },
  // Mismo tamaño que `textoLink` pero SIN subrayado (ver el comentario en el
  // JSX): es un botón, no un link.
  textoPrivacidad: { fontSize: 12 },
})
