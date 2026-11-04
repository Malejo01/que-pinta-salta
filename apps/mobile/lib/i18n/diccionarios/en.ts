/** Q5-11 · Diccionario de la app en inglés. Mismas claves que `es.ts` (`satisfies`). */
import type { Diccionario } from './es'
import { TEXTO_SACASTE_GUARDADO_CON_VOY, cantidadVisible } from '@qps/core/asistencia'
import { validarContrasenaNueva } from '@qps/core/auth/cuenta'
import {
  MENSAJE_ALTA_CON_SESION,
  MENSAJE_ALTA_ENVIADA,
  MENSAJE_ALTA_GENERICO,
  mensajeErrorAlta,
  mensajeErrorContrasena,
  mensajeErrorIngreso,
} from '@qps/core/auth/mensajes'
import { CONTACTO_EMAIL } from '@qps/core/contacto'
import * as M from '../../mensajes'

const validacionCorta = validarContrasenaNueva('', '')
const validacionDistinta = validarContrasenaNueva('123456', '654321')

/**
 * Q6-1 · Los mensajes que llegan ya armados (en castellano) desde `lib/` o
 * `@qps/core`, en inglés. La clave es el texto en castellano. Los de la capa
 * de datos (que importan Supabase) van con su texto literal: el test
 * `tests/i18n-pantallas.test.ts` compara cada clave con la constante real,
 * así que si una cambia, el test avisa. Un mensaje que no esté acá se
 * muestra en castellano.
 */
export const ERRORES_EN: Record<string, string> = {
  [M.MENSAJE_SIN_CONFIGURACION]: 'The app is missing its data settings: please let the team know.',
  [M.MENSAJE_SIN_CONEXION_INICIO]: 'You are offline, so we cannot load what’s on. Connect and tap Try again.',
  [M.MENSAJE_SIN_CONEXION_FAVORITOS]: 'You are offline, so we cannot load My events. Connect and tap Try again.',
  [M.MENSAJE_SIN_CONEXION_BUSCAR]: 'You are offline, so we cannot search events. Connect and tap Try again.',
  [M.MENSAJE_SIN_CONEXION_CINES]: 'You are offline, so we cannot load the cinema listings. Connect and tap Try again.',
  [M.MENSAJE_SIN_CONEXION_RADAR]: 'You are offline, so we cannot load your Radar. Connect and tap Try again.',
  [M.MENSAJE_ERROR_SERVIDOR_EVENTOS]: 'We could not load the events. Please try again in a while.',
  [M.MENSAJE_ERROR_SERVIDOR_CINES]: 'We could not load the cinema listings. Please try again in a while.',
  [M.MENSAJE_ERROR_SERVIDOR_FAVORITOS]: 'We could not load My events. Please try again in a while.',
  [M.MENSAJE_ERROR_SERVIDOR_RADAR]: 'We could not load your Radar. Please try again in a while.',
  [M.MENSAJE_SEGUIMOS_SIN_CONEXION]: 'We tried again and you are still offline.',
  [M.MENSAJE_VOLVIO_LA_CONEXION]: 'You are back online.',
  [M.MENSAJE_ACTUALIZADO]: 'Done, updated.',
  [M.MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION]: 'We could not update: you are offline.',
  [M.MENSAJE_NO_SE_ACTUALIZO]: 'We could not update. Please try again in a while.',
  'Sin conexión, mostrando lo último guardado': 'Offline, showing the last saved version',
  [M.MENSAJE_RADAR_GUARDAR_SIN_CONEXION]:
    'We could not save your Radar and it may be half saved until you save again. Your changes are still here: when you are back online, tap Save again.',
  // Capa de datos (lib/datos, lib/favoritos, lib/notificaciones, lib/radar, lib/asistencia).
  'No pudimos cargar los eventos. Revisá tu conexión.': 'We could not load the events. Check your connection.',
  'No pudimos cargar la cartelera. Revisá tu conexión.': 'We could not load the cinema listings. Check your connection.',
  'No pudimos cargar tus favoritos. Revisá tu conexión.': 'We could not load your favourites. Check your connection.',
  'No pudimos guardar el favorito. Probá de nuevo.': 'We could not save the favourite. Please try again.',
  'Ese evento ya no está disponible.': 'That event is no longer available.',
  'No pudimos cargar tus notificaciones. Probá de nuevo.': 'We could not load your notifications. Please try again.',
  'No pudimos guardar tus notificaciones. Probá de nuevo.': 'We could not save your notifications. Please try again.',
  'Pronto vas a poder elegir tus notificaciones.': 'Soon you will be able to choose your notifications.',
  'No pudimos guardar tu preferencia de avisos del equipo. Probá de nuevo.': 'We could not save your team notices preference. Please try again.',
  'No pudimos guardar tu preferencia de avisos patrocinados. Probá de nuevo.': 'We could not save your sponsored notifications preference. Please try again.',
  'No pudimos cargar tu Radar. Probá de nuevo.': 'We could not load your Radar. Please try again.',
  'No pudimos guardar tu Radar. Probá de nuevo.': 'We could not save your Radar. Please try again.',
  'No pudimos enviar la prueba. Revisá tu conexión.': 'We could not send the test. Check your connection.',
  'No pudimos cargar esta sección. Probá de nuevo.': 'We could not load this section. Please try again.',
  'Pronto vas a poder marcar si vas.': 'Soon you will be able to mark that you are going.',
  'Esa acción no es válida.': 'That action is not valid.',
  // Ingreso con Google (lib/google.ts).
  'Actualizá los servicios de Google Play.': 'Update Google Play services.',
  'No se pudo completar el ingreso con Google. Probá de nuevo o entrá con tu email.':
    'We could not finish signing in with Google. Try again or sign in with your email.',
  'No hay conexión. Revisá tu internet y probá de nuevo con Google.': 'You are offline. Check your internet and try Google again.',
  'El ingreso con Google no está disponible en este momento. Probá de nuevo más tarde o entrá con tu email.':
    'Signing in with Google is not available right now. Try again later or sign in with your email.',
  'Ya hay un ingreso con Google abierto. Terminalo o cerralo y probá de nuevo.':
    'A Google sign-in is already open. Finish or close it and try again.',
  // Ingreso y alta (@qps/core/auth): mismas traducciones que la web.
  [MENSAJE_ALTA_GENERICO]: 'We could not create the account. If you already have one, sign in.',
  [MENSAJE_ALTA_ENVIADA]:
    'If that email did not have an account, we sent you an email to confirm it. If you already had one, sign in or reset your password.',
  [MENSAJE_ALTA_CON_SESION]: 'All set, your account is ready.',
  [mensajeErrorAlta({ code: 'weak_password' })]: 'The password is too weak: use at least 6 characters.',
  [mensajeErrorAlta({ code: 'email_address_invalid' })]: 'Check the email: it does not look valid.',
  [mensajeErrorAlta({ status: 429 })]: 'Too many attempts. Please try again in a few minutes.',
  [mensajeErrorIngreso({ code: 'invalid_credentials' })]:
    'The email or password is incorrect. If you signed up with Google, use the Google button.',
  [mensajeErrorIngreso({ code: 'email_not_confirmed' })]: 'You have not confirmed your email yet: check your inbox.',
  [mensajeErrorIngreso({})]: 'We could not sign you in. Please try again in a few minutes.',
  ...(validacionCorta.ok ? {} : { [validacionCorta.mensaje]: 'The password must be at least 6 characters long.' }),
  ...(validacionDistinta.ok ? {} : { [validacionDistinta.mensaje]: 'The passwords do not match.' }),
  // Los de `app/(tabs)/cuenta.tsx` (MENSAJES_ERROR y compañía: la excepción
  // documentada de tests/paridad-mensajes-auth.test.ts, que sigue ahí).
  'El email o la contraseña no son correctos.': 'The email or password is incorrect.',
  'Ya existe una cuenta con ese email.': 'There is already an account with that email.',
  'La contraseña es muy débil: probá con una más larga.': 'The password is too weak: try a longer one.',
  'Revisá el email y la contraseña.': 'Check the email and password.',
  'Demasiados intentos. Probá de nuevo en un rato.': 'Too many attempts. Please try again in a while.',
  'No se pudo completar la operación. Probá de nuevo.': 'We could not complete that. Please try again.',
  'La app no tiene la configuración de cuentas: avisá al equipo.': 'The app is missing its account settings: please let the team know.',
  'Google no devolvió un token válido. Probá de nuevo.': 'Google did not return a valid token. Please try again.',
  'Si entraste con Google, usá el botón de Google.': 'If you signed up with Google, use the Google button.',
  [TEXTO_SACASTE_GUARDADO_CON_VOY]: 'You removed it from your saved events and are no longer marked as going.',
  // Q6-1b: Contraseña (`mensajeErrorContrasena` de core; el de contraseña débil ya está arriba).
  [mensajeErrorContrasena({ code: 'same_password' })]: 'That is already your password. Choose another one.',
  [mensajeErrorContrasena({ code: 'reauthentication_needed' })]: 'For your security, sign out, sign in again and try again.',
  [mensajeErrorContrasena({})]: 'We could not save the password. Please try again in a few minutes.',
  // Q6-1b: Eliminar mi cuenta (`lib/cuenta.ts`, que importa Supabase: texto literal, lo
  // compara con el real `tests/i18n-cuenta-ficha.test.ts`).
  'No pudimos eliminar la cuenta. Revisá tu conexión.': 'We could not delete the account. Check your connection.',
  [`No se borró nada. Probá de nuevo en unos minutos o escribinos a ${CONTACTO_EMAIL}.`]:
    `Nothing was deleted. Please try again in a few minutes or email us at ${CONTACTO_EMAIL}.`,
}


export const en = {
  comun: {
    reintentar: 'Try again',
    cargando: 'Loading…',
    quitarFiltros: 'Clear filters',
    enCastellano: '(in Spanish)',
  },
  pestanas: {
    inicio: 'Home',
    buscar: 'Search',
    radar: 'Radar',
    misEventos: 'My events',
    cuenta: 'Account',
  },
  estados: {
    reintentar: 'Try again',
    reintentando: 'Trying again…',
  },
  bienvenida: {
    marca: 'Qué Pinta Salta',
    bajada: 'Everything happening in Salta, in one place.',
    empezar: 'Get started',
    entrar: 'Sign in',
    avisosTitulo: 'Shall we let you know what’s on?',
    avisosTexto: 'We remind you before the events you save and send you news from Qué Pinta Salta. You can change this any time in Account.',
    siAvisame: 'Yes, notify me',
    ahoraNo: 'Not now',
  },
  ficha: {
    titulo: 'Event',
    contenidoEnCastellano: '(in Spanish)',
    precioDeEntrada: 'Ticket price',
    entradaGratuita: 'Free entry',
    lugarPorConfirmar: 'Venue to be confirmed',
    sinCategorizar: 'Uncategorised',
    horaSufijo: '',
    comoLlegar: 'Directions',
    comprarTickets: 'Buy tickets',
    mapaDeEventos: 'See on the events map',
    yaNoEsta: 'This event is no longer available.',
    volverAInicio: 'Back to Home',
    soloAdultos: 'Adults only (18+)',
  },
  pelicula: {
    titulo: 'Film',
    yaNoEsta: 'This film is no longer showing.',
    sinFunciones: 'No showings today',
    errorCarga: 'We could not load the cinema listings. Check your connection.',
  },
  flyer: {
    titulo: 'Flyer',
    yaNoEsta: 'This flyer is no longer available.',
    verEnInstagram: 'See on Instagram',
    deCuenta: (cuenta: string) => `the flyer from ${cuenta}`,
    errorCarga: 'We could not load the flyer. Check your connection.',
  },
  navegacion: {
    volver: 'Back',
  },
  filtros: {
    gratis: 'Free',
    soloGratis: 'Free events only',
    paraChicos: 'For kids',
    soloParaChicos: 'Events for kids only',
    titulo: 'Filters',
    categorias: 'Categories',
    cerrar: 'Close',
    limpiar: 'Clear',
    limpiarFiltros: 'Clear filters',
    boton: (activos: number) => (activos > 0 ? `Filters · ${activos}` : 'Filters'),
    botonEtiqueta: (activos: number) => (activos <= 0 ? 'Filters' : `Filters, ${activos} active`),
    quitar: (nombre: string) => `Remove ${nombre}`,
    verEventos: (cantidad: number) => `See ${cantidad} ${cantidad === 1 ? 'event' : 'events'}`,
  },
  recientes: {
    titulo: 'Recent searches',
    borrar: 'Clear history',
    borrarEtiqueta: 'Clear search history',
    borrado: 'Done, your recent searches are cleared.',
    buscarDeNuevo: (busqueda: string) => `Search again: ${busqueda}`,
    confirmarTitulo: 'Clear your history?',
    confirmarTexto: 'This deletes your recent searches from this phone.',
    cancelar: 'Cancel',
    confirmarBorrar: 'Clear',
  },
  invitacion: {
    ahoraNo: 'Not now',
    cerrar: 'Close',
  },
  loQueSeguis: {
    titulo: 'What you follow',
    irAlRadar: 'Go to Radar',
    lugares: 'Places',
    cuentas: 'Instagram accounts',
    categorias: 'Categories',
    dejarDeSeguir: 'Unfollow',
    dejandoDeSeguir: 'Unfollowing…',
    dejarDeSeguirA: (nombre: string) => `Unfollow ${nombre}`,
  },
  cines: {
    titulo: 'Cinemas',
    buscar: 'Search films by title...',
    limpiarBusqueda: 'Clear search',
  },
  idioma: {
    titulo: 'Language',
    descripcion: 'The app language. “Automatic” follows your phone.',
    automatico: 'Automatic',
    castellano: 'Español',
    ingles: 'English',
    cambiadoA: (nombre: string) => `Language: ${nombre}`,
  },
  lugaresChicos: {
    titulo: 'Places for kids',
    acceso: 'Playgrounds, indoor play areas, play centres and cultural spaces',
    leyenda: 'The Qué Pinta Salta team adds and verifies this information. We do not inspect the places: check opening hours before you go.',
    todos: 'All',
    todosLosTipos: 'All types',
    gratis: 'Free',
    soloGratis: 'Free places only',
    abiertoAhora: 'Open now',
    elegiTuBarrio: 'Pick your neighbourhood',
    elegiTuBarrioEtiqueta: 'Pick your neighbourhood to sort by distance',
    cercaDe: (barrio: string) => `Near ${barrio}`,
    barrioCambiar: (barrio: string) => `Neighbourhood: ${barrio}. Change`,
    sinBarrio: 'No neighbourhood',
    sinOrdenar: 'Not sorted by distance',
    ordenadosPorBarrio: (barrio: string) => `Sorted by distance from ${barrio}`,
    ordenadosPorUbicacion: 'Sorted by distance from your approximate location.',
    barrioPrivacidad: 'The neighbourhood is only used on your phone to sort the list: it is not stored or sent.',
    conteo: (n: number) => (n === 0 ? 'No places with these filters' : n === 1 ? '1 place' : `${n} places`),
    vacioSinDatos: 'No verified places yet. We are adding the first ones.',
    vacioConFiltros: 'No places with these filters.',
    abreLaFicha: 'Opens the place details',
    tituloFicha: 'Place for kids',
    yaNoEsta: 'This place is no longer published.',
    comoLlegar: 'Directions',
    comoLlegarA: (nombre: string) => `Directions to ${nombre}`,
    horarios: 'Opening hours',
    conReserva: 'By reservation: message or call them before you go.',
    espacioAbierto: 'Open space',
    verificadoEl: (fecha: string) => `Verified on ${fecha}`,
    puedeHaberCambiado: 'This may have changed: check before you go.',
    web: 'Website',
    webDe: (nombre: string) => `${nombre} website`,
    instagram: 'Instagram',
    instagramDe: (nombre: string) => `${nombre} on Instagram`,
    llamar: 'Call',
    llamarA: (nombre: string) => `Call ${nombre}`,
    errorCarga: 'We could not load the places for kids. Check your connection.',
  },
  // ── Q6-1: Home, Search, My events, Radar, Account and their components ──
  portada: {
    atajos: { hoy: 'Today', 'esta-noche': 'Tonight', finde: 'Weekend', semana: 'This week' },
    frases: { hoy: 'today', 'esta-noche': 'tonight', finde: 'this weekend', semana: 'this week' },
    hoyEnSalta: 'Today in Salta',
    vacioHoy: 'No events listed for today. See what is coming up in the next few days.',
    verEstaSemana: 'See this week',
    verLoDeHoy: 'See today',
    verElFinde: 'See the weekend',
    buscarEnTodasLasFechas: 'Search all dates',
    verCartelera: 'See what’s showing',
    verCategoriaEnTodasLasFechas: (nombre: string) => `See ${nombre} on all dates`,
    todasLasCategorias: 'All categories',
    verTodosLosPrecios: 'See all prices',
    verTodasLasEdades: 'See all ages',
    enCartel: 'Now showing',
    conteo: (peliculas: number, eventos: number) => {
      const textoEventos = `${eventos} ${eventos === 1 ? 'event' : 'events'}`
      if (peliculas === 0) return textoEventos
      const textoPeliculas = `${peliculas} ${peliculas === 1 ? 'film' : 'films'}`
      return eventos === 0 ? textoPeliculas : `${textoPeliculas} · ${textoEventos}`
    },
    quienGratis: (nombreCategoria: string | null) => (nombreCategoria === null ? 'Free' : `Free ${nombreCategoria}`),
    vacioGratis: (nombreCategoria: string | null, frase: string, esCine: boolean) => {
      if (nombreCategoria === null) return `No free events ${frase}.`
      const base = `No free ${nombreCategoria} events ${frase}.`
      return esCine ? `${base} Films now showing are not free.` : base
    },
    vacioCategoriaSimple: (nombreCategoria: string, frase: string) => `No ${nombreCategoria} events ${frase}.`,
    quienParaChicos: (nombreCategoria: string | null, esInfantil: boolean, gratis: boolean) => {
      const conGratis = gratis ? 'Free ' : ''
      if (nombreCategoria === null) return gratis ? 'Free for kids' : 'For kids'
      if (esInfantil) return `${conGratis}${nombreCategoria}`
      return `${conGratis}${nombreCategoria} for kids`
    },
    vacioParaChicos: (nombreCategoria: string | null, esInfantil: boolean, esCine: boolean, gratis: boolean, frase: string) => {
      const conGratis = gratis ? ' free' : ''
      if (nombreCategoria === null) return `No${conGratis} events for kids ${frase}.`
      if (esInfantil) return `No${conGratis} ${nombreCategoria} events ${frase}.`
      const base = `No${conGratis} ${nombreCategoria} events for kids ${frase}.`
      if (!esCine) return base
      if (gratis) return `${base} Films now showing are not free.`
      return `${base} Films now showing have no age rating, so they do not appear under “For kids”.`
    },
    salidaGrilla: { hoy: 'No filters: all events today', 'esta-noche': 'No filters: all events tonight', finde: 'No filters: all events this weekend', semana: 'No filters: all events this week' },
  },
  vacios: {
    hoySinConexion: 'You are offline, so we cannot see today’s events. See what is coming up in the next few days.',
    nocheEnFilas: 'Tonight’s events are further down, by category.',
    nocheSinConexion: 'You are offline, so we cannot see tonight’s events. Check what is on during the day.',
    nocheVacia: 'No events tonight. Check what is on during the day.',
    findeEnFilas: 'This weekend’s events are further down, by category.',
    findeSinConexion: 'You are offline, so we cannot see the weekend’s events. See what is on during the week.',
    findeVacio: 'No events this weekend. See what is on during the week.',
    semanaEnFilas: 'Nothing today, but there are events this week: they are further down, by category.',
    semanaSinConexion: 'You are offline, so we cannot see this week’s events.',
    semanaVacia: 'No events this week. Search all dates.',
    cineSinConexion: 'You are offline, so we cannot show the cinema listings.',
    categoriaSinConexion: (nombre: string, frase: string) => `You are offline, so we cannot see ${nombre} events ${frase}.`,
    cineVacio: (nombre: string, frase: string) => `No films showing and no ${nombre} events ${frase}.`,
    categoriaVacia: (nombre: string, frase: string) => `No ${nombre} events ${frase}.`,
    buscarConTexto: (texto: string, gratis: boolean, nombreCategoria: string | null, frase: string | null) =>
      `We found no${gratis ? ' free' : ''} events matching "${texto}"${nombreCategoria ? ` in ${nombreCategoria}` : ''}${frase ? ` ${frase}` : ''}.`,
    buscarSinTexto: (gratis: boolean, nombreCategoria: string | null, frase: string | null) =>
      `No${gratis ? ' free' : ''} events${nombreCategoria ? ` in ${nombreCategoria}` : ''}${frase ? ` ${frase}` : ' for now'}.`,
    limpiarBusqueda: 'Clear search',
    verTodasLasFechas: 'See all dates',
    sacarSoloGratis: 'Turn off “Free only”',
    todasLasCategorias: 'All categories',
    categoriasBuscar: 'There are no categories to show for now. Tap Try again or search by name above.',
    cinesSinResultados: (busqueda: string) => `No results for "${busqueda}". Try another title.`,
    cinesVacio: 'No films showing for now. Meanwhile, see what other events are on today.',
    verEventosDeHoy: 'See today’s events',
    favoritos: 'You have not saved any events in My events yet. Tap the heart or “Going” on an event and it shows up here.',
    favoritosSinConexion: 'No upcoming events in My events.',
    verLaAgenda: 'See what’s on',
    favoritosPasados: 'Events that already happened are not shown.',
    radarSinSesion: 'With your account you choose which events reach your inbox.',
    radarSinCategorias: 'There are no categories to choose yet. Meanwhile, you can follow venues and Instagram accounts below.',
    radarYaSeguis: (buscado: string) => `You already follow everything that matches "${buscado}".`,
    radarSinCoincidencias: (buscado: string) => `We found no venues or accounts matching "${buscado}". Try another name.`,
  },
  mensajes: {
    sinConfiguracion: ERRORES_EN[M.MENSAJE_SIN_CONFIGURACION],
    sinConexion: {
      inicio: ERRORES_EN[M.MENSAJE_SIN_CONEXION_INICIO],
      favoritos: ERRORES_EN[M.MENSAJE_SIN_CONEXION_FAVORITOS],
      buscar: ERRORES_EN[M.MENSAJE_SIN_CONEXION_BUSCAR],
      cines: ERRORES_EN[M.MENSAJE_SIN_CONEXION_CINES],
      radar: ERRORES_EN[M.MENSAJE_SIN_CONEXION_RADAR],
    },
    servidor: {
      inicio: ERRORES_EN[M.MENSAJE_ERROR_SERVIDOR_EVENTOS],
      buscar: ERRORES_EN[M.MENSAJE_ERROR_SERVIDOR_EVENTOS],
      cines: ERRORES_EN[M.MENSAJE_ERROR_SERVIDOR_CINES],
      favoritos: ERRORES_EN[M.MENSAJE_ERROR_SERVIDOR_FAVORITOS],
      radar: ERRORES_EN[M.MENSAJE_ERROR_SERVIDOR_RADAR],
    },
    seguimosSinConexion: ERRORES_EN[M.MENSAJE_SEGUIMOS_SIN_CONEXION],
    volvioLaConexion: ERRORES_EN[M.MENSAJE_VOLVIO_LA_CONEXION],
    actualizado: ERRORES_EN[M.MENSAJE_ACTUALIZADO],
    noSeActualizoSinConexion: ERRORES_EN[M.MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION],
    noSeActualizo: ERRORES_EN[M.MENSAJE_NO_SE_ACTUALIZO],
    tituloSinConexion: ERRORES_EN['Sin conexión, mostrando lo último guardado'],
    guardadoInvalido: 'Saved a while ago',
    guardadoHoy: (hora: string) => `Saved today at ${hora}`,
    guardadoAyer: (hora: string) => `Saved yesterday at ${hora}`,
    guardadoEl: (diaYMes: string, hora: string) => `Saved on ${diaYMes} at ${hora}`,
  },
  errores: {
    // Un renglón por vez: Cuenta junta dos mensajes con un salto de línea.
    traducir: (mensaje: string) => mensaje.split('\n').map((renglon) => ERRORES_EN[renglon] ?? renglon).join('\n'),
  },
  anuncios: {
    explorar: 'No filters: browse by category',
    soloGratis: 'free only',
    paraChicos: 'for kids',
    peliculas: (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'film' : 'films'}`,
    peliculasPara: (conteo: string, busqueda: string) => `${conteo} for ${busqueda}`,
    ningunaPelicula: (busqueda: string) => `No films for ${busqueda}`,
    enCartel: (conteo: string) => `${conteo} now showing`,
  },
  buscar: {
    etiqueta: 'Search',
    placeholder: 'Search by event, venue or description...',
    limpiarBusqueda: 'Clear search',
    cualquierFecha: 'Any date',
    soloGratis: 'Free only',
    explorar: 'Browse by category',
    resultados: (cantidad: number, f: { texto: string; gratis: boolean; paraChicos: boolean; nombreCategoria: string | null; frase: string | null }) => {
      const plural = cantidad !== 1 ? 's' : ''
      const enCategoria = f.nombreCategoria ? ` in ${f.nombreCategoria}` : ''
      const sufijoFecha = f.frase ? ` · ${f.frase}` : ''
      if (f.texto) return `${cantidad} result${plural} for "${f.texto}"${enCategoria}${sufijoFecha}`
      return `${cantidad}${f.gratis ? ' free' : ''} event${plural}${f.paraChicos ? ' for kids' : ''}${enCategoria}${sufijoFecha}`
    },
    sinResultados: (f: { texto: string; gratis: boolean; paraChicos: boolean; nombreCategoria: string | null; frase: string | null }) => {
      const enCategoria = f.nombreCategoria ? ` in ${f.nombreCategoria}` : ''
      if (f.texto) return `No events found for "${f.texto}"${enCategoria}${f.frase ? ` · ${f.frase}` : ''}`
      const gratis = f.gratis ? ' free' : ''
      if (f.paraChicos) return `No${gratis} events for kids${enCategoria}${f.frase ? ` ${f.frase}` : ' for now'}.`
      return `No${gratis} events${enCategoria}${f.frase ? ` ${f.frase}` : ' for now'}.`
    },
  },
  misEventos: {
    titulo: 'My events',
    entraParaGuardar: 'Sign in to save your favourites',
    ingresar: 'Sign in',
    guardados: (n: number) => `You have ${n} ${n === 1 ? 'saved item' : 'saved items'} lined up for your plans.`,
    compartirWhatsApp: 'Share my plans on WhatsApp',
    flexibles: (n: number) => `Flexible plans / No set date (${n})`,
    voy: (n: number) => `Going (${n})`,
    lugaresQueSeguis: 'Venues you follow',
    sinLugares: 'You do not follow any venues yet. Tap “Follow” on an event page and we will let you know when it announces something new.',
    verFichaDelLugar: (nombre: string) => `${nombre}: see the venue page`,
  },
  cuenta: {
    iniciarSesion: 'Sign in',
    email: 'Email',
    contrasena: 'Password',
    olvidaste: 'Forgot your password?',
    entrar: 'Sign in',
    crearCuenta: 'Create account',
    oContinuarCon: 'Or continue with',
    verBienvenida: 'See the welcome screen',
    cerrarSesion: 'Sign out',
    eliminarCuenta: 'Delete my account',
    miRadar: 'My Salta Radar',
    filaContrasena: (tituloDeCore: string) => (tituloDeCore === 'Cambiar contraseña' ? 'Change password' : 'Password'),
    version: (textoDeVersion: string) => textoDeVersion.replace(/^Versión\b/, 'Version').replace(/\bdesconocida\b/, 'unknown'),
    continuarConGoogle: 'Continue with Google',
    google: 'Google',
    mostrarContrasena: 'Show password',
    ocultarContrasena: 'Hide password',
    privacidad: 'Privacy policy (in Spanish)',
    terminos: 'Terms and conditions (in Spanish)',
    aceptacion: 'By creating your account or continuing with Google you accept the Terms and conditions and the Privacy policy (in Spanish).',
    aceptacionSoloPrivacidad: 'By creating your account or continuing with Google you accept the Privacy policy (in Spanish).',
    privacidadAnuncios: 'Ad privacy',
    seguis: {
      vacio: 'You do not follow anything yet. Follow a venue from an event page, or pick categories in the Radar.',
      errorCarga: 'We could not load what you follow. Please try again.',
      errorCambio: 'We could not update what you follow. Please try again.',
    },
  },
  radar: {
    titulo: 'My Salta Radar',
    bajada:
      'You decide which events to see and receive. Subscribe to your favourite categories, venues or Instagram organisers and get alerts in your inbox, no spam.',
    frecuencias: {
      weekly: 'Weekly (every Thursday, 18:00)',
      biweekly: 'Every 2 weeks (fortnightly)',
      monthly: 'Monthly',
      disabled: 'Off (pause alerts)',
    },
    resumenPausado: 'Your Radar is paused',
    resumenActivo: { weekly: (email: string) => `Your Radar is on: it reaches ${email} every week`, biweekly: (email: string) => `Your Radar is on: it reaches ${email} every 2 weeks`, monthly: (email: string) => `Your Radar is on: it reaches ${email} every month` },
    ingresar: 'Sign in to set up your Radar',
    frecuenciaTitulo: 'Frequency and recipient',
    cadaCuanto: 'How often do you want to get updates?',
    emailEtiqueta: 'Email address',
    emailNota: 'We send it to your account email.',
    categoriasTitulo: 'Categories you like',
    categoriasNota: 'You will get alerts for every event filed under the categories you pick.',
    lugaresTitulo: 'Favourite venues and organisers',
    lugaresNota:
      'Follow venues or Instagram organisers and clubs directly (e.g. La Metro, Sex Us Machina) to hear about what they have coming up.',
    buscar: 'Search',
    placeholder: 'Search venues or Instagram accounts (e.g. Usina, Metro, Sex Us...)',
    instagram: 'Instagram',
    lugar: 'Venue',
    dejarDeSeguir: (nombre: string) => `Unfollow ${nombre}`,
    sinSeguidos: 'You are not following any venues or Instagram accounts yet. Type above to find and add them.',
    cambiosSinGuardar: 'You have unsaved changes',
    guardadoOk: 'You are on the Radar! 📧',
    guardadoOkDetalle: 'You will get the best events in your inbox.',
    sinConexion: 'Offline',
    errorGuardar: 'Could not save',
    anuncioSinConexion: (detalle: string) => `Offline. ${detalle}`,
    pruebaEnviada: 'Test sent',
    pruebaFallo: 'The test could not be sent',
    enviandoPrueba: 'Sending test...',
    enviarPrueba: 'Send a test email',
    guardando: 'Saving...',
    guardar: 'Save Radar preferences',
  },
  notificaciones: {
    titulo: 'Notifications',
    recordatoriosFavoritos: 'Reminders for favourites',
    novedadesSeguis: 'News from what you follow',
    patrocinados: 'Sponsored notifications',
    patrocinadosDescripcion: 'Up to 1 a week, about events in Salta. They are labelled “Sponsored”.',
    equipo: 'Qué Pinta Salta notifications',
    equipoDescripcion: 'News and notices from the Qué Pinta Salta team.',
    canalRadar: 'Radar channel',
    canales: { email: 'Email', push: 'Push', ambos: 'Both' },
    radarPorEmail: 'For now, the Radar still reaches you by email.',
    silencio: 'Quiet hours',
    desde: 'From',
    hasta: 'Until',
    guardar: 'Save notifications',
    guardadas: 'Your notifications are saved.',
    estadosPush: {
      'sin-sesion': 'Sign in to turn on notifications.',
      'sin-pedir': 'Turn on notifications to hear about what’s new.',
      pidiendo: 'Asking for permission...',
      denegado: 'You did not turn on notifications. You can try again whenever you like.',
      bloqueado: 'Notifications are blocked for this app. Turn them on in your phone settings.',
      'no-disponible': 'For now, this phone cannot receive notifications from the app.',
      'error-registro': 'We could not turn on notifications. Please try again.',
      activo: 'Notifications are on for this phone.',
    },
    activar: 'Turn on notifications',
    abrirAjustes: 'Open settings',
    reintentar: 'Try again',
    explicacionCuenta:
      'We remind you before your favourites and let you know when there is something new from what you follow in your Radar. You can choose what you get and your quiet hours.',
    preguntaFavoritos: 'Shall we remind you before your favourites?',
    sinSesionTitulo: 'Notifications',
    sinSesionTexto:
      'Without an account we can send you notices from the team and, if you turn them on, sponsored ones. For reminders of what you save and your Radar, sign in.',
    noSePudoCambiar: 'We could not change the notifications. Please try again in a while.',
    patrocinadosSinSesion: 'Paid ads: up to 1 a week, about events in Salta. They are labelled “Sponsored”.',
    patrocinadosPista: 'Paid ads: up to 1 a week.',
    sinPermiso: 'Not turned on: the phone did not give Qué Pinta Salta permission to send notifications.',
    pidePermiso: 'When you turn it on, the phone asks for permission to send you notifications.',
    recordatorios: 'Reminders for what you saved',
    recordatoriosDescripcion: 'The evening before (18:00) we remind you of what you saved or marked “Going”.',
    finde: 'What’s on this weekend',
    findeDescripcion: 'On Thursdays at 18:00, how many plans there are for the weekend.',
  },
  avisos: {
    recordatorio: (titulo: string, hora: string | null) => (hora ? `Tomorrow: ${titulo} at ${hora}` : `Tomorrow: ${titulo}`),
    recordatorioCuerpo: 'Tap to see the event.',
    finde: (planes: number, gratis: number) => {
      const p = planes === 1 ? '1 plan' : `${planes} plans`
      return gratis > 0 ? `What’s on this weekend: ${p}, ${gratis} free` : `What’s on this weekend: ${p}`
    },
    findeCuerpo: 'See what’s on for Friday, Saturday and Sunday.',
  },
  tarjeta: {
    marca: 'QUÉ PINTA SALTA',
    enCartel: 'Now showing',
    masFechas: (n: number) => (n === 1 ? '+1 date' : `+${n} dates`),
    destacado: '★ Featured',
    eventoDestacado: 'Featured event',
    etiquetaEvento: (e: { titulo: string; fecha: string; hora: string; lugar: string; destacado: boolean; precio: string | null; otrasFechas: number }) =>
      `${e.titulo}, ${e.fecha}${e.hora ? ` ${e.hora}` : ''}, at ${e.lugar}` +
      (e.destacado ? ', featured' : '') +
      (e.precio ? `, ${e.precio}` : '') +
      (e.otrasFechas > 0 ? `, ${e.otrasFechas} more ${e.otrasFechas === 1 ? 'date' : 'dates'}` : ''),
    etiquetaPelicula: (e: { titulo: string; destacado: boolean; precio: string | null }) =>
      `${e.titulo}, now showing${e.destacado ? ', featured' : ''}${e.precio ? `, ${e.precio}` : ''}`,
    gratis: 'Free',
    cantidadEventos: (n: number) => `${n} ${n === 1 ? 'event' : 'events'}`,
    agregarFavorito: (nombre?: string) => (nombre ? `Add ${nombre} to favourites` : 'Add to favourites'),
    quitarFavorito: (nombre?: string) => (nombre ? `Remove ${nombre} from favourites` : 'Remove from favourites'),
    compartir: (titulo: string) => `Share ${titulo}`,
    verTodos: 'See all',
    cines: (n: number) => `${n} ${n === 1 ? 'cinema' : 'cinemas'}`,
    comprarEntradas: 'Buy tickets',
    compartirImagen: 'Share image',
    compartirLink: 'Share link',
    cerrar: 'Close',
    noSePudoCompartir: 'We could not share. Please try again.',
    compartimosElLink: 'We could not build the image, so we shared the link.',
  },
  hero: {
    irAlEvento: (n: number) => `Go to event ${n}`,
    verDetalles: 'See details',
    entradaGratuita: 'Free entry',
    siguiente: 'Next event',
    anterior: 'Previous event',
    diapositiva: (titulo: string, indice: number, total: number) =>
      total === 1 ? `${titulo}, see details` : `${titulo}, see details, ${indice + 1} of ${total}`,
  },
  banners: {
    radarTitulo: 'Don’t miss a thing!',
    radarTexto: 'Pick your favourite categories and get the weekend’s events straight to your inbox.',
    radarBoton: 'Set up my Radar 📡',
    publicidad: 'Advertisement',
  },
  encabezado: {
    irAInicio: 'Go to Home',
    irACuenta: 'Go to Account',
    ingresar: 'Sign in',
  },
  chipsCategorias: {
    todas: 'All',
    todasLasCategorias: 'All categories',
  },
  esqueleto: {
    cargando: 'Loading',
  },
  eliminarCuenta: {
    titulo: 'Delete my account',
    paraSiempre: 'This is permanent and cannot be undone.',
    cuenta: (email: string) => `Account: ${email}`,
    queSeBorraTitulo: 'What gets deleted:',
    // Q6-1b: la traducción de la lista de la web (que solo existe en castellano):
    // mismos ítems, en el mismo orden (lo fija tests/i18n-cuenta-ficha.test.ts).
    queSeBorra: [
      'Your favourites.',
      'Your “Going” marks.',
      'Your My Radar and notification preferences.',
      'The notifications you have turned on.',
      'The history of the notifications we sent you.',
      'Your phone’s notification tokens.',
      'The account itself, with your email and password.',
    ],
    queNoSeBorraTitulo: 'What does not get deleted:',
    queNoSeBorra: 'The events you added stay published, but without your name: they show up with no author.',
    escribinos: 'If you cannot delete it from here, email us at',
    correoContacto: (email: string) => `Contact email: ${email}`,
    comoCopiar: 'Press and hold to copy it',
    confirmar: 'Type ELIMINAR (Spanish for “delete”) to confirm',
    palabra: 'ELIMINAR',
    boton: 'Delete my account permanently',
  },
  contrasena: {
    // Los mismos textos que la web en inglés (`cambioContrasena.modos`).
    modos: {
      google: {
        titulo: 'Password',
        descripcion:
          'You signed in with Google. You can create a password to also sign in with your email. If you already created one, this replaces it.',
        boton: 'Save password',
      },
      email: { titulo: 'Change password', descripcion: 'Choose a new password.', boton: 'Save password' },
      mixta: { titulo: 'Change password', descripcion: 'Choose a new password.', boton: 'Save password' },
      desconocida: {
        titulo: 'Password',
        descripcion: 'You can choose a new password to sign in with your email. If you already had one, this replaces it.',
        boton: 'Save password',
      },
    },
    contrasenaNueva: 'New password',
    repetila: 'Repeat it',
    guardada: 'Password saved. You can now sign in with your email and this password.',
    volver: 'Back',
  },
  errorGeneral: {
    titulo: 'Something went wrong.',
    texto: 'Please try again in a moment.',
    reintentar: 'Try again',
  },
  fila: {
    guardar: '♥ Save',
    guardado: '♥ Saved',
    // Mismo umbral que el castellano (`cantidadVisible` de core).
    voy: (cantidad: number) => {
      const visible = cantidadVisible(cantidad)
      return visible === null ? '✓ Going' : `✓ Going · ${visible}`
    },
    compartir: 'Share',
    etiquetaGuardar: 'Save this event to your favourites',
    etiquetaQuitarGuardado: 'Remove this event from your saved events',
    etiquetaVoy: 'Mark that you are going to this event',
    etiquetaNoVoy: 'Stop marking that you are going to this event',
    noDisponible: 'Soon you will be able to save events or mark that you are going.',
    entrarParaGuardar: 'Sign in to save events or mark that you are going.',
  },
  calendario: {
    agregar: 'Add to calendar',
    enTuCalendario: 'In your calendar',
    agregado: 'Done, we added it to your calendar.',
    sinPermiso: 'No permission to use the calendar.',
    sinCalendario: 'We could not find a calendar to save it in.',
    error: 'We could not add it to the calendar. Please try again.',
    abrirAjustes: 'Open Settings',
  },
  seguir: {
    lugar: (siguiendo: boolean) => (siguiendo ? '✓ Following' : '+ Follow'),
    cuenta: (usuario: string, siguiendo: boolean) => (siguiendo ? `Following @${usuario}` : `Follow @${usuario}`),
    seguirA: (nombre: string) => `Follow ${nombre}`,
    dejarDeSeguirA: (nombre: string) => `Unfollow ${nombre}`,
  },
  patrocinado: {
    franja: 'You came here from a sponsored notification',
    boton: 'Stop sponsored notifications',
    listo: 'Done, you will not get any more. You can turn them back on in Account.',
    bajaPush: 'Done: we will not send you any more sponsored notifications. You can turn them back on in Account.',
    bajaPushError: 'We could not turn off sponsored notifications. Try from Account.',
  },
} satisfies Diccionario
