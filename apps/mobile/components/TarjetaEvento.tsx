// Tarjeta única de evento para Inicio, Buscar y Favoritos (R28, 28-f: F1).
// Replica `apps/web/components/event-card.tsx` en el tamaño de una grilla de
// 2 columnas: flyer 2:3 a sangre, degradé negro abajo y texto blanco encima,
// en vez de la fila con afiche de 64×64 que tenían las tres pantallas.
//
// R29, 29-b (F14, ops/paridad-web-app.md §3.3): el corazón y Compartir ahora
// viven también acá, arriba a la derecha, en círculos de 32 con fondo
// oscuro (`bg-black/60` de la web) — igual que la card real. Son
// `Pressable` propios (dónde van, en el párrafo de R72 que sigue).
//
// R72, 72-b (QPS-360): ya NO van anidados dentro del `Pressable` de la tarjeta.
// TalkBack y VoiceOver agrupan un elemento accesible con todos sus hijos, y el
// corazón y Compartir no recibían foco propio. Ahora un `View` contenedor
// lleva el estilo (tamaño, borde, sombra) y adentro hay dos hermanos: el
// `Pressable` de la tarjeta (ocupa todo) y las acciones, arriba con `zIndex`
// y `pointerEvents="box-none"` para no tapar el toque del resto de la tarjeta.
//
// R67, 67-a (F6 de la beta): la tarjeta también dibuja películas (`movie-…`) y
// flyers (`ig-…`). Navega con `rutaDeEvento` (lib/rutas.ts) a la ficha que
// corresponde, y para ellos no muestra Compartir (es de eventos reales).
//
// R69, 69-a (QPS-353): el corazón vuelve para películas y flyers. `BotonFavorito`
// es por tipo y recibe `objetivoDeFavorito(evento)` (`lib/rutas.ts`): el tipo
// y el uuid pelado, nunca `movie-…`/`ig-…` (que no deben llegar a `event_id`).
//
// El degradé no usa `expo-linear-gradient` (no es dependencia aprobada):
// son 4 `View` absolutos apilados, con negro de opacidad creciente hacia
// abajo, sobre la mitad inferior de la tarjeta.
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { formatEventDateShort } from '@qps/core/date-format'
import type { DisplayEvent } from '@qps/core/home/types'
import { Afiche } from '@/components/Afiche'
import { BotonCompartir } from '@/components/BotonCompartir'
import { BotonFavorito } from '@/components/BotonFavorito'
import { Icono } from '@/components/Icono'
import { InsigniaDestacado } from '@/components/InsigniaDestacado'
import { ESCALA_MAXIMA_COMPACTA } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { textoPrecio } from '@/lib/formato'
import { esEventoReal, objetivoDeFavorito, rutaDeEvento } from '@/lib/rutas'

export interface TarjetaEventoProps {
  evento: DisplayEvent
}

// R69, 69-r1: los botones de arriba a la derecha miden 32, van separados 6 y
// están a 8 del borde. El badge (arriba a la izquierda) no tiene que pasar por
// debajo de ellos: su contenedor termina donde empiezan los botones, con 8 de
// aire. Cuentas (n = cantidad de botones):
//   0 botones            -> 8 (solo el margen)
//   1 (solo corazón)     -> 8 + 32 + 8           = 48
//   2 (Compartir + ♥)    -> 8 + 32 + 6 + 32 + 8  = 86
// En la tarjeta de ~164 dp de ancho al badge le quedan 164 - 8 - 48 = 108 dp
// con el corazón solo y 164 - 8 - 86 = 70 dp con los dos.
// (Los botones llevan `tamanio={32}`, `right: 8` y `gap: 6` literales en el
// JSX/estilos: los leen tests/tarjeta.test.ts y tests/accesibilidad-hitslop-vecinos.test.ts.
// Si cambian, cambian también estas tres constantes.)
const TAMANIO_ACCION = 32
const GAP_ACCIONES = 6
const MARGEN_ARRIBA = 8

function derechaDelBadge(botones: number): number {
  if (botones <= 0) return MARGEN_ARRIBA
  return MARGEN_ARRIBA + botones * TAMANIO_ACCION + (botones - 1) * GAP_ACCIONES + MARGEN_ARRIBA
}

export function TarjetaEvento({ evento }: TarjetaEventoProps) {
  const router = useRouter()
  const colores = useColoresQPS()

  // `evento.date` es la fecha calendario ("YYYY-MM-DD", `formatDateInSalta`
  // en `@qps/core/home/transform`), igual que `event.date` en la web:
  // `formatEventDateShort` le aplica el mismo formato corto ("vie 12 oct").
  const fecha = formatEventDateShort(evento.date)
  const precio = textoPrecio(evento.price)
  const inicialCategoria = (evento.categoryName || 'Q').charAt(0).toUpperCase()
  const otrasFechas = evento.occurrences && evento.occurrences.length > 1 ? evento.occurrences.length - 1 : 0

  // R69, 69-a: el tipo y el uuid pelado que guarda el corazón (evento,
  // película o flyer); `null` si una película/flyer no trae un uuid válido.
  const objetivoFavorito = objetivoDeFavorito(evento)

  // R69, 69-r1: qué botones hay arriba a la derecha, calculado una sola vez y
  // usado para dibujarlos y para el borde derecho del badge (`estilos.arriba`).
  const hayCompartir = esEventoReal(evento)
  const botonesArriba = (hayCompartir ? 1 : 0) + (objetivoFavorito ? 1 : 0)
  const derechaArriba = derechaDelBadge(botonesArriba)

  const etiqueta = evento.isCinemaMovie
    ? `${evento.title}, en cartel`
    : `${evento.title}, ${fecha}${evento.time ? ` ${evento.time}` : ''}, en ${evento.venue}`

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.card }]}>
      <Pressable
        onPress={() => router.push(rutaDeEvento(evento))}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        style={estilos.tarjeta}
      >
        <Afiche
          url={evento.image}
          llenar
          fallback={
            <View style={[estilos.marca, { backgroundColor: colores.primary }]}>
              <Text style={[estilos.marcaInicial, { color: colores.primaryForeground }]} numberOfLines={1}>
                {inicialCategoria}
              </Text>
              <Text style={[estilos.marcaTexto, { color: colores.primaryForeground }]} numberOfLines={1}>
                QUÉ PINTA SALTA
              </Text>
            </View>
          }
        />

        <View style={estilos.degrade} pointerEvents="none">
          <View style={[estilos.franja, { opacity: 0 }]} />
          <View style={[estilos.franja, { opacity: 0.4 }]} />
          <View style={[estilos.franja, { opacity: 0.75 }]} />
          <View style={[estilos.franja, { opacity: 0.9 }]} />
        </View>

        <View style={[estilos.arriba, { right: derechaArriba }]} pointerEvents="none">
          <View style={[estilos.badge, { backgroundColor: colores.primary }]}>
            <Text
              style={[estilos.textoBadge, { color: colores.primaryForeground }]}
              numberOfLines={1}
              maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}
            >
              {evento.categoryName}
            </Text>
          </View>
          <InsigniaDestacado visible={evento.isFeatured} />
        </View>

        <View style={estilos.abajo} pointerEvents="none">
          <Text style={estilos.titulo} numberOfLines={2} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
            {evento.title}
          </Text>

          <View style={estilos.filaLugar}>
            <Icono nombre="MapPin" tamanio={12} color="rgba(255,255,255,0.8)" />
            <Text style={estilos.lugar} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
              {evento.venue}
            </Text>
          </View>

          <Text style={estilos.fecha} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
            {/* R69, 69-b (QPS-338): una película no tiene "fecha" (la de hoy no
                significa nada); lo visible coincide con la etiqueta de accesibilidad. */}
            {evento.isCinemaMovie ? 'En cartel' : `${fecha}${evento.time ? ` ${evento.time}` : ''}`}
          </Text>

          {otrasFechas > 0 ? (
            <Text style={estilos.masFechas} numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}>
              +{otrasFechas} fechas
            </Text>
          ) : null}

          {precio ? (
            <Text
              style={[estilos.precio, evento.price === 'gratis' && estilos.precioGratis]}
              numberOfLines={1}
              maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}
            >
              {precio}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/* R72, 72-b: hermanos del Pressable, no hijos. Orden de foco del lector:
          primero la tarjeta (título, fecha, lugar), después Compartir y por
          último el corazón (el orden del árbol es el del foco: no reordenar). */}
      {botonesArriba > 0 ? (
        <View style={estilos.accionesArriba} pointerEvents="box-none">
          {esEventoReal(evento) ? (
            <BotonCompartir eventId={evento.id} titulo={evento.title} fecha={fecha} hora={evento.time} lugar={evento.venue} tamanio={32} fondo="oscuro" />
          ) : null}
          {objetivoFavorito ? <BotonFavorito objetivo={objetivoFavorito} nombre={evento.title} tamanio={32} fondo="oscuro" /> : null}
        </View>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    aspectRatio: 2 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  // R72, 72-b: el Pressable accesible ocupa todo el contenedor.
  tarjeta: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  marca: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  marcaInicial: { fontSize: 48, fontWeight: '800', opacity: 0.9 },
  marcaTexto: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, opacity: 0.8 },
  // Clara hasta la mitad de la tarjeta, oscura hacia el borde inferior
  // (4 franjas, opacidad creciente: ver el comentario de arriba).
  degrade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '50%', flexDirection: 'column' },
  franja: { flex: 1, backgroundColor: '#000' },
  // `right` se pone en el JSX (`derechaDelBadge`): depende de qué botones hay.
  // Con `left` y `right` el ancho de `arriba` queda acotado, y el badge
  // (alineado con `flex-start`) se mide con ese máximo: el texto, con
  // `numberOfLines={1}`, corta con "…". `flexShrink: 1` queda como defensa
  // (en esta columna actúa sobre el alto, no sobre el ancho).
  arriba: { position: 'absolute', left: MARGEN_ARRIBA, top: MARGEN_ARRIBA, gap: 4, alignItems: 'flex-start' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1 },
  textoBadge: { fontSize: 11, fontWeight: '700' },
  accionesArriba: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', gap: 6, zIndex: 10 },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  titulo: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  filaLugar: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  lugar: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  fecha: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  masFechas: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  precio: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 4 },
  precioGratis: { color: '#4ade80' },
})
