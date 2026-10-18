// 46-b: línea de base de `tests/accesibilidad-detector.test.ts` para
// `app/**` — mismo criterio que `tests/a11y/pendientes-componentes.ts` (leer
// su comentario de cabecera primero): lo que el barrido encuentra HOY, solo
// puede bajar, un archivo ausente vale 0 para las seis reglas.
import type { LineaBaseAccesibilidad } from './pendientes-componentes'

export const PENDIENTES_PANTALLAS: LineaBaseAccesibilidad = {
  // El botón "Reintentar" del ErrorBoundary de toda la app: sin
  // accessibilityRole.
  'app/_layout.tsx': { 'sin-rol': 1 },
  // "Empezar" y "Entrar": ninguno de los dos tiene accessibilityRole.
  'app/bienvenida.tsx': { 'sin-rol': 2 },
  // El nombre del cine (el trigger del acordeón, estilos.triggerCine,
  // minHeight: 44) SÍ tiene accessibilityRole: solo suma a `area-chica`.
  // "Comprar Entradas" SÍ tiene accessibilityRole="button", pero abre
  // `Linking.openURL(urlCompra)` directo en el `onPress` (rol "button", no
  // "link"): suma a `link-externo`.
  'app/cines.tsx': { 'link-externo': 1, 'area-chica': 1 },
  // "Eliminar mi cuenta" (el único Pressable del archivo) ya tiene
  // accessibilityRole y accessibilityLabel: 0 hallazgos de las cuatro reglas
  // con línea de base. Tiene un `minHeight: 44` (estilos.boton, el estilo es
  // una FUNCIÓN que depende de `habilitado`), pero `estilos` en este archivo
  // es un objeto plano (`const estilos = {...}`), no un
  // `StyleSheet.create(...)`: la heurística de `area-chica` (que busca
  // `StyleSheet.create` por nombre) no lo ve — documentado en el reporte de
  // la tarea, no es un archivo de esta lista a propósito.
  //
  // "Comprar tickets"/"Cómo llegar": ninguno de los dos tiene
  // accessibilityRole, y los dos abren `Linking.openURL` a través de una
  // función (`comprar`/`comoLlegar`) declarada en el propio archivo.
  'app/evento/[id].tsx': { 'sin-rol': 2, 'link-externo': 2 },
  // "Ver en Instagram": tiene accessibilityRole="button" (no "link") y abre
  // `abrirPostDeInstagram(...)` directo en el `onPress` — el fixture real
  // de `style={({ pressed }) => [...]}` que pide el encargo (46-b, punto 3
  // de "Qué hacer") está en este archivo.
  'app/flyer/[id].tsx': { 'link-externo': 1 },
  // Mismo `BloqueCine` duplicado que `app/cines.tsx` (ver su comentario):
  // el trigger (área chica, minHeight: 44) y "Comprar Entradas"
  // (link-externo).
  'app/pelicula/[id].tsx': { 'link-externo': 1, 'area-chica': 1 },
  // "Ver la bienvenida" (se repite dos veces en el archivo: con sesión y sin
  // sesión), "Entrar" y "Crear cuenta": los cuatro sin accessibilityRole.
  // "¿Olvidaste tu contraseña?" SÍ tiene accessibilityRole="button", pero su
  // `onPress` llama a `abrirRecuperarContrasenia` (declarada en el mismo
  // archivo), que hace `Linking.openURL(url)` — aunque `url` salga de
  // `urlSitio(...)` (un destino propio, no de terceros), sigue abriendo el
  // navegador del sistema, así que el criterio textual de la regla
  // (`Linking.openURL`, sin importar el origen del link) también lo marca.
  'app/(tabs)/cuenta.tsx': { 'sin-rol': 4, 'link-externo': 1 },
  // El tile de categoría (grilla de "Explorar por categoria") no tiene
  // accessibilityRole. El chip "Solo gratis" (estilos.chipGratis,
  // minHeight: 44) suma a `area-chica`; el botón de limpiar la búsqueda
  // (estilos.botonLimpiar, minWidth/minHeight: 44 + hitSlop={8}) está en la
  // lista de excepciones del test (llega a 48 con el hitSlop), así que NO
  // suma acá — ver `EXCEPCIONES_AREA_CHICA` en
  // `tests/accesibilidad-detector.test.ts`.
  //
  // Aviso para 46-c/46-d (no es archivo permitido de esta tarea, no se
  // toca): `tests/colores-texto.test.ts:402` ya exige la cadena literal
  // `hitSlop={8}` en este mismo botón de limpiar — si cambian el hitSlop acá
  // (por `hitSlopPara(44)`, por ejemplo), ese test rompe primero.
  'app/(tabs)/buscar.tsx': { 'sin-rol': 1, 'area-chica': 1 },
}
