// Aviso de "mostrando lo último guardado" (R43, plan §7): una banda fija
// arriba del contenido, dentro del scroll — nunca un toast, nunca algo que
// tape la pantalla. Sigue visible mientras la persona recorre la caché;
// 43-c la hace desaparecer con pull-to-refresh o "Reintentar" cuando vuelve
// la red.
//
// Mismos tokens que `EstadoCarga` (`useColoresQPS`, `mutedForeground` para
// el texto, acá vía `tono="secundario"` de `Texto`). Fondo `muted` (no
// `card`, que son las tarjetas de contenido) se mantiene, pero 43-c2
// (pasada de ux-ui) encontró que en oscuro —el único esquema que la app usa
// hoy: `lib/colores.ts` llama siempre a `coloresSegunEsquema('dark')`—
// `muted` y `card` casi no se distinguen (contraste ~1,09:1): el fondo solo
// no alcanza para que la banda se note como un aviso aparte. Lo que de
// verdad la separa es el borde inferior en `colores.border`, que en oscuro
// queda bastante más arriba que `muted` y que `card` (mismo patrón que el
// separador de `Encabezado.tsx`).
//
// Sin ícono: `components/Icono.tsx` es el único wrapper de íconos aprobado,
// y su lista (los 32 que también usa la web) no tiene ninguno de "sin
// señal" — el encargo permite ir sin ícono en ese caso.
//
// A6 (nube Q1): con lo guardado a la vista, "Reintentar" se ve acá mismo
// (antes solo existía el gesto de tirar para abajo, que no se descubre). Va
// AFUERA del `View accessible` del aviso — `accessible` agrupa todo lo de
// adentro en un solo elemento para el lector de pantalla, y un botón ahí
// adentro no se podría tocar — y es `BotonReintentar` de `EstadoCarga` (nunca
// un `<Text>Reintentar</Text>` a mano). Al lado del botón, la `nota` del
// último refresco ("Seguimos sin conexión...", "No pudimos actualizar..."):
// la anuncia la pantalla con `announceForAccessibility` en el mismo handler
// del refresco, así que esta línea NO es live region (Android leería dos
// veces). `detalle` es una línea de más DENTRO del bloque accesible (Mis
// eventos: los eventos que ya pasaron no se muestran). `AvisoNoSeActualizo`,
// más abajo, es la misma banda para cuando lo que se ve NO es lo guardado
// sino una carga fresca que un refresco no pudo actualizar.
import { StyleSheet, View } from 'react-native'
import { BotonReintentar } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { TITULO_SIN_CONEXION, textoGuardadoEn } from '@/lib/sin-conexion/aviso'

export interface AvisoSinConexionProps {
  /** Cuándo se guardó lo que se está mostrando (sale de `leerCache`, ya validado). */
  guardadoEn: Date
  /** Una línea de más dentro del aviso (y de su `accessibilityLabel`). */
  detalle?: string
  /** Si está, se dibuja "Reintentar" al lado del aviso (afuera del bloque accesible). */
  onReintentar?: () => void
  /** Mientras el reintento está en curso, el botón se apaga. */
  reintentando?: boolean
  /** Lo que pasó con el último refresco, si hay algo que decir (ver `decidirRefresco`, `lib/vacios.ts`). */
  nota?: string | null
}

export function AvisoSinConexion({ guardadoEn, detalle, onReintentar, reintentando = false, nota = null }: AvisoSinConexionProps) {
  const colores = useColoresQPS()
  // Una sola vez: el texto visible y el `accessibilityLabel` tienen que decir
  // exactamente lo mismo. Si se llamara `textoGuardadoEn` dos veces (una para
  // cada lugar) con dos `new Date()` distintos, podrían caer en lados
  // opuestos de la medianoche de Salta y el lector de pantalla anunciaría
  // algo distinto de lo que se ve.
  const textoSegundaLinea = textoGuardadoEn(guardadoEn, new Date())

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.muted, borderBottomColor: colores.border }]}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${TITULO_SIN_CONEXION}. ${textoSegundaLinea}${detalle ? `. ${detalle}` : ''}`}
        style={estilos.bloqueTexto}
      >
        <Texto peso="semibold" tono="secundario">
          {TITULO_SIN_CONEXION}
        </Texto>
        <Texto tono="secundario" style={estilos.subtitulo}>
          {textoSegundaLinea}
        </Texto>
        {detalle ? (
          <Texto tono="secundario" style={estilos.subtitulo}>
            {detalle}
          </Texto>
        ) : null}
      </View>
      {onReintentar ? <FilaReintentar nota={nota} onReintentar={onReintentar} reintentando={reintentando} /> : null}
    </View>
  )
}

/** La nota del último refresco (si hay) y "Reintentar", en una fila. */
function FilaReintentar({
  nota,
  onReintentar,
  reintentando,
}: {
  nota: string | null
  onReintentar: () => void
  reintentando: boolean
}) {
  return (
    <View style={estilos.filaReintentar}>
      {nota ? (
        <Texto tono="secundario" style={[estilos.subtitulo, estilos.nota]}>
          {nota}
        </Texto>
      ) : (
        <View style={estilos.nota} />
      )}
      <BotonReintentar onReintentar={onReintentar} deshabilitado={reintentando} />
    </View>
  )
}

export interface AvisoNoSeActualizoProps {
  /** "No pudimos actualizar..." (con o sin conexión): el `nota` de `decidirRefresco`. */
  texto: string
  onReintentar: () => void
  reintentando?: boolean
}

/**
 * A6: la misma banda, para cuando un refresco falló con una carga FRESCA a la
 * vista (no lo guardado): lo que se ve se conserva y esto avisa que no se
 * pudo actualizar, con "Reintentar". El texto lo anuncia la pantalla
 * (`announceForAccessibility`), por eso acá no hay live region.
 */
export function AvisoNoSeActualizo({ texto, onReintentar, reintentando = false }: AvisoNoSeActualizoProps) {
  const colores = useColoresQPS()
  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.muted, borderBottomColor: colores.border }]}>
      <Texto tono="secundario" style={estilos.subtitulo}>
        {texto}
      </Texto>
      <FilaReintentar nota={null} onReintentar={onReintentar} reintentando={reintentando} />
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 2,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  subtitulo: { fontSize: 13 },
  bloqueTexto: { gap: 2 },
  filaReintentar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  nota: { flex: 1 },
})
