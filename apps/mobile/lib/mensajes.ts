// Mensajes compartidos por varios módulos de datos de la app (QPS-131, R27
// tarea 27-b). `MENSAJE_SIN_CONFIGURACION` vivía repetido, literal, en
// `lib/asistencia.ts`, `lib/datos/eventos.ts` y `lib/datos/cines.ts`: ahora
// vive una sola vez acá y esos tres módulos lo reexportan (sus tests siguen
// valiendo sin cambios, porque siguen pudiendo importarlo con el mismo
// nombre desde el mismo archivo de siempre).
export const MENSAJE_SIN_CONFIGURACION = 'La app no tiene la configuración de datos: avisá al equipo.'

// A6 (nube Q1) · Vacíos y sin conexión. Hasta acá, una falla de red y un
// error del servidor (un 5xx) decían lo mismo en las cinco pantallas con
// lista ("No pudimos cargar los eventos. Revisá tu conexión."): con un 5xx
// ese "Revisá tu conexión" mandaba a la persona a revisar algo que andaba
// bien. Ahora `sinConexion` (que ya llegaba de `lib/datos/*`,
// `lib/favoritos.ts`, `lib/radar.ts` y de `cargarAgendaConCache`/
// `cargarFavoritosConCache`) llega a la pantalla, y `mensajeErrorCarga`
// (`lib/vacios.ts`) elige uno de estos textos. Los `MENSAJE_ERROR_RED` de
// `lib/datos/*` y `lib/favoritos.ts` NO cambian: los siguen mostrando tal
// cual las fichas (`app/evento/[id].tsx`, `app/pelicula/[id].tsx`,
// `app/flyer/[id].tsx`), que no son de este ticket.
//
// Sin jerga técnica en pantalla (nada de "servidor", "caché", "error 500"):
// "lo guardado", "conexión", "Probá de nuevo en un rato".

/** Sin red y sin nada guardado para mostrar (Inicio y Mis eventos, las dos pantallas con lo guardado de la R43). */
export const MENSAJE_SIN_CONEXION_SIN_GUARDADO =
  'No hay conexión y todavía no hay nada guardado para mostrarte. Conectate y tocá Reintentar.'

/** Sin red en Buscar: esta pantalla nunca guarda nada (punto 10 de la auditoría, fuera de A6), así que no promete "lo guardado". */
export const MENSAJE_SIN_CONEXION_BUSCAR = 'No hay conexión, así que no podemos buscar eventos. Conectate y tocá Reintentar.'

/** Sin red en Cines: la cartelera tampoco se guarda (la de ayer no sirve, R43). */
export const MENSAJE_SIN_CONEXION_CINES = 'No hay conexión, así que no podemos traer la cartelera. Conectate y tocá Reintentar.'

/** Sin red al abrir el Radar (con sesión). */
export const MENSAJE_SIN_CONEXION_RADAR = 'No hay conexión, así que no podemos traer tu Radar. Conectate y tocá Reintentar.'

/** Error que no es de red (un 5xx, una respuesta rara): neutro, sin mandar a revisar la conexión. */
export const MENSAJE_ERROR_SERVIDOR_EVENTOS = 'No pudimos cargar los eventos. Probá de nuevo en un rato.'
export const MENSAJE_ERROR_SERVIDOR_CINES = 'No pudimos cargar la cartelera. Probá de nuevo en un rato.'
export const MENSAJE_ERROR_SERVIDOR_FAVORITOS = 'No pudimos cargar Mis eventos. Probá de nuevo en un rato.'
export const MENSAJE_ERROR_SERVIDOR_RADAR = 'No pudimos cargar tu Radar. Probá de nuevo en un rato.'

/**
 * Sin sesión porque la sesión no se pudo confirmar por falta de red
 * (`sinConexion` de `useSession()`, R43 43-d) y sin nada guardado que
 * mostrar: ahí "Entrá…"/"Ingresar…" mentía (la persona SÍ tiene sesión, solo
 * que no se pudo confirmar). Mis eventos y Radar.
 */
export const MENSAJE_SESION_SIN_CONEXION =
  'No hay conexión y no pudimos confirmar tu sesión. Conectate y tocá Reintentar.'

/** Un refresco (tirar para abajo o "Reintentar") volvió a caer en lo guardado. Se ve junto al aviso y se anuncia. */
export const MENSAJE_SEGUIMOS_SIN_CONEXION = 'Seguimos sin conexión. Te dejamos lo último guardado.'

/** "Reintentar" sin sesión (Mis eventos, Radar) y la sesión todavía no se pudo confirmar: no hay nada guardado que ofrecer. */
export const MENSAJE_SEGUIMOS_SIN_CONEXION_SIN_SESION = 'Seguimos sin conexión. Probá de nuevo en un rato.'

/** Un refresco falló por red con datos ya en pantalla: se conservan (no se reemplazan por el error). */
export const MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION = 'No hay conexión, así que no pudimos actualizar. Seguís viendo lo que ya estaba cargado.'

/** Un refresco falló por otra cosa con datos ya en pantalla: mismo criterio, texto neutro. */
export const MENSAJE_NO_SE_ACTUALIZO = 'No pudimos actualizar. Seguís viendo lo que ya estaba cargado; probá de nuevo en un rato.'

/**
 * Guardar el Radar sin red (`guardarRadar`, `lib/radar.ts`): deja claro que
 * lo elegido NO se perdió — la pantalla conserva el estado editado (y el
 * "Tenés cambios sin guardar") hasta el próximo Guardar.
 */
export const MENSAJE_RADAR_GUARDAR_SIN_CONEXION =
  'No hay conexión, así que no pudimos guardar tu Radar. Tus cambios siguen acá: conectate y tocá Guardar de nuevo.'
