/**
 * La tarjeta 4:5 que se captura para "Compartir imagen" (R42, 42-d; plan
 * `ops/rondas/42-ficha-completa/plan.md`, decisión 4). Copia el diseño de la
 * tarjeta de la web (`apps/web/app/api/tarjeta/[id]/route.tsx`): el afiche a
 * sangre, un degradé oscuro de abajo hacia arriba (mismo truco que
 * `components/Hero.tsx`: franjas `<View>` apiladas con opacidad creciente —
 * SIN `expo-linear-gradient`, que no está instalada) y, abajo a la
 * izquierda, la marca, el título, la fecha y hora, el lugar y el link
 * visible.
 *
 * La tarjeta NO sigue el tema (decisión 4 del plan): los tres colores son
 * fijos, los mismos que usa la tarjeta de la web (`BRAND_PRIMARY`,
 * `BRAND_PRIMARY_FOREGROUND` y `BRAND_FOREGROUND` de
 * `apps/web/app/api/tarjeta/[id]/route.tsx`), para que se vea igual en el
 * WhatsApp de cualquiera, de día o de noche. Por eso tampoco usa
 * `useColoresQPS()` ni ningún dato de la sesión.
 */
import { forwardRef, useEffect } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { Afiche } from '@/components/Afiche'
import { Texto } from '@/components/Texto'
import { leerEnv } from '@/lib/env'
import { fuentesDeImagen } from '@/lib/imagenes/url-segura'
import type { DatosTarjetaCompartir } from '@/lib/compartir'
import LOGO_MARCA from '@/assets/logo-circular.png'

// Los mismos tres colores fijos de la tarjeta de la web (comentario de
// arriba): ningún hex suelto en un `color:` de esta pantalla fuera de estas
// constantes con nombre (`tests/colores-texto.test.ts`).
const ROJO_MARCA = '#a30419'
const TEXTO_TARJETA = '#ffffff'
const OSCURO_TARJETA = '#0a0a0a'

// El ancho (en px) sobre el que están pensados los tamaños de fuente y el
// padding de abajo — los mismos valores que usa la tarjeta de la web a
// 1080×1350. Escalando todo por `ancho / ANCHO_REFERENCIA` el resultado
// queda proporcionalmente igual sin importar el `ancho` de la vista previa
// (siempre más chico, ~360): `captureRef` (`lib/compartir-imagen/dispositivo.ts`)
// redimensiona la captura ENTERA a 1080×1350 al final, así que todo escala
// junto y el resultado final queda igual que si se hubiera dibujado a
// tamaño real.
const ANCHO_REFERENCIA = 1080

export interface TarjetaCompartirProps {
  datos: DatosTarjetaCompartir
  /** Ancho de la tarjeta, en px lógicos; el alto sale de `aspectRatio: 4/5`. */
  ancho: number
  /**
   * Avisa cuando la tarjeta está lista para capturarse: el afiche terminó
   * de cargar, o ya cayó en la marca — con o sin ninguna fuente válida
   * desde el principio (ver el efecto de abajo).
   */
  alListo?: () => void
}

export const TarjetaCompartir = forwardRef<View, TarjetaCompartirProps>(function TarjetaCompartir(
  { datos, ancho, alListo },
  ref,
) {
  const escala = ancho / ANCHO_REFERENCIA
  // La MISMA fuente que usa `Afiche` puertas adentro (`leerEnv().supabase?.url
  // ?? null`, `fuentesDeImagen`, ancho 800 como en la ficha): si no hay
  // ninguna fuente válida, `Afiche` muestra el `fallback` de abajo SIN
  // dibujar ningún `<Image>` — no hay `onLoad` ni `onError`, así que su
  // `alTerminar` nunca se llama en ese caso. La tarjeta lo sabe sola.
  const supabaseUrl = leerEnv().supabase?.url ?? null
  const hayFuente = fuentesDeImagen(datos.imagenUrl, supabaseUrl, 800).length > 0

  useEffect(() => {
    if (!hayFuente) alListo?.()
  }, [hayFuente, alListo])

  const fallbackMarca = (
    <View style={estilos.fondoMarca}>
      <Image source={LOGO_MARCA} style={estilos.logoMarca} resizeMode="contain" />
    </View>
  )

  return (
    <View
      ref={ref}
      // Android lo necesita para poder capturar la vista con view-shot.
      collapsable={false}
      style={[estilos.raiz, { width: ancho, backgroundColor: ROJO_MARCA }]}
    >
      {hayFuente ? (
        <View style={StyleSheet.absoluteFill}>
          <Afiche
            url={datos.imagenUrl}
            llenar
            ancho={800}
            alTerminar={() => alListo?.()}
            fallback={fallbackMarca}
          />
        </View>
      ) : (
        fallbackMarca
      )}

      <View style={estilos.degrade} pointerEvents="none">
        <View style={[estilos.franja, { opacity: 0 }]} />
        <View style={[estilos.franja, { opacity: 0.5 }]} />
        <View style={[estilos.franja, { opacity: 0.85 }]} />
        <View style={[estilos.franja, { opacity: 0.97 }]} />
      </View>

      <View style={[estilos.contenido, { padding: 72 * escala, gap: 20 * escala }]}>
        <Texto peso="bold" style={{ color: TEXTO_TARJETA, fontSize: 30 * escala, opacity: 0.85 }} numberOfLines={1}>
          {datos.marca}
        </Texto>
        <Texto peso="bold" style={{ color: TEXTO_TARJETA, fontSize: 64 * escala, lineHeight: 72 * escala }}>
          {datos.titulo}
        </Texto>
        <Texto style={{ color: TEXTO_TARJETA, fontSize: 36 * escala }}>{datos.fechaHora}</Texto>
        <Texto style={{ color: TEXTO_TARJETA, fontSize: 36 * escala, opacity: 0.9 }}>{datos.lugar}</Texto>
        <Texto
          style={{ color: TEXTO_TARJETA, fontSize: 28 * escala, opacity: 0.75, marginTop: 4 * escala }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {datos.linkVisible}
        </Texto>
      </View>
    </View>
  )
})

const estilos = StyleSheet.create({
  raiz: { aspectRatio: 4 / 5, overflow: 'hidden', position: 'relative', justifyContent: 'flex-end' },
  fondoMarca: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  logoMarca: { width: 64, height: 64, opacity: 0.8 },
  degrade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '35%', flexDirection: 'column' },
  franja: { flex: 1, backgroundColor: OSCURO_TARJETA },
  contenido: { flexDirection: 'column' },
})
