/**
 * Q5-11 · Diccionario de la app en castellano (rioplatense, con voseo).
 * `en.ts` lo replica con `satisfies Diccionario`: si falta o sobra una clave,
 * el typecheck falla. Las pantallas migradas (lista en
 * tests/i18n-detector.test.ts) no pueden tener texto visible fuera de acá.
 *
 * Q6-1: `mensajes` reusa las constantes de `lib/mensajes.ts` (una sola
 * definición de cada texto, QPS-131) y `notificaciones` las de
 * `lib/push/textos-interruptores.ts`.
 */
import {
  MENSAJE_ACTUALIZADO,
  MENSAJE_ERROR_SERVIDOR_CINES,
  MENSAJE_ERROR_SERVIDOR_EVENTOS,
  MENSAJE_ERROR_SERVIDOR_FAVORITOS,
  MENSAJE_ERROR_SERVIDOR_RADAR,
  MENSAJE_NO_SE_ACTUALIZO,
  MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION,
  MENSAJE_SEGUIMOS_SIN_CONEXION,
  MENSAJE_SIN_CONEXION_BUSCAR,
  MENSAJE_SIN_CONEXION_CINES,
  MENSAJE_SIN_CONEXION_FAVORITOS,
  MENSAJE_SIN_CONEXION_INICIO,
  MENSAJE_SIN_CONEXION_RADAR,
  MENSAJE_SIN_CONFIGURACION,
  MENSAJE_VOLVIO_LA_CONEXION,
} from '../../mensajes'
import { AVISO_SIN_PERMISO, PISTA_PIDE_PERMISO } from '../../push/textos-interruptores'
// Q6-1b: lo que ya vivía en core (una sola definición, compartida con la web).
import { textoBotonVoy } from '@qps/core/asistencia'
import { textosContrasena } from '@qps/core/auth/cuenta'
import { textoSeguir, textoSeguirCuenta } from '@qps/core/radar/seguimiento'
import { vibeLabels } from '@qps/core/types'

export const es = {
  comun: {
    reintentar: 'Reintentar',
    cargando: 'Cargando…',
    quitarFiltros: 'Quitar filtros',
    enCastellano: '(en castellano)',
  },
  pestanas: {
    inicio: 'Inicio',
    buscar: 'Buscar',
    radar: 'Radar',
    misEventos: 'Mis eventos',
    cuenta: 'Cuenta',
  },
  estados: {
    reintentar: 'Reintentar',
    reintentando: 'Reintentando…',
  },
  bienvenida: {
    marca: 'Qué Pinta Salta',
    bajada: 'Todo lo que pasa en Salta, en un solo lugar.',
    empezar: 'Empezar',
    entrar: 'Entrar',
    avisosTitulo: '¿Te avisamos de lo que pinta?',
    avisosTexto: 'Te avisamos antes de lo que guardes y te mandamos novedades de Qué Pinta Salta. Lo cambiás cuando quieras en Cuenta.',
    siAvisame: 'Sí, avisame',
    ahoraNo: 'Ahora no',
  },
  ficha: {
    titulo: 'Evento',
    contenidoEnCastellano: '',
    precioDeEntrada: 'Precio de entrada',
    entradaGratuita: 'Entrada gratuita',
    lugarPorConfirmar: 'Lugar por confirmar',
    sinCategorizar: 'Sin categorizar',
    horaSufijo: ' hs',
    comoLlegar: 'Cómo llegar',
    comprarTickets: 'Comprar tickets',
    mapaDeEventos: 'Ver en el mapa de eventos',
    // Q6-1b: lo que quedaba suelto en la ficha.
    yaNoEsta: 'Este evento ya no está disponible.',
    volverAInicio: 'Volver a Inicio',
    /** La única «vibe» que muestra la ficha (`age_restriction >= 18`); el texto es el de core. */
    soloAdultos: vibeLabels.adultos,
  },
  pelicula: {
    titulo: 'Película',
    yaNoEsta: 'Esta película ya no está en cartelera.',
    sinFunciones: 'Sin funciones para hoy',
    errorCarga: 'No pudimos cargar la cartelera. Revisá tu conexión.',
  },
  flyer: {
    titulo: 'Flyer',
    yaNoEsta: 'Este flyer ya no está disponible.',
    verEnInstagram: 'Ver en Instagram',
    deCuenta: (cuenta: string) => `el flyer de ${cuenta}`,
    errorCarga: 'No pudimos cargar el flyer. Revisá tu conexión.',
  },
  navegacion: {
    volver: 'Volver',
  },
  filtros: {
    gratis: 'Gratis',
    soloGratis: 'Solo eventos gratis',
    paraChicos: 'Para chicos',
    soloParaChicos: 'Solo eventos para chicos',
    titulo: 'Filtros',
    categorias: 'Categorías',
    cerrar: 'Cerrar',
    limpiar: 'Limpiar',
    limpiarFiltros: 'Limpiar filtros',
    // Q6-1: el botón «Filtros», los chips removibles y «Ver N eventos» (lib/portada-filtros.ts).
    boton: (activos: number) => (activos > 0 ? `Filtros · ${activos}` : 'Filtros'),
    botonEtiqueta: (activos: number) => (activos <= 0 ? 'Filtros' : `Filtros, ${activos} ${activos === 1 ? 'activo' : 'activos'}`),
    quitar: (nombre: string) => `Quitar ${nombre}`,
    verEventos: (cantidad: number) => `Ver ${cantidad} ${cantidad === 1 ? 'evento' : 'eventos'}`,
  },
  recientes: {
    titulo: 'Búsquedas recientes',
    borrar: 'Borrar historial',
    borrarEtiqueta: 'Borrar historial de búsquedas',
    // Q6-1: el diálogo de confirmación, el anuncio y la etiqueta de cada chip.
    borrado: 'Listo, borraste tus búsquedas recientes.',
    buscarDeNuevo: (busqueda: string) => `Buscar de nuevo: ${busqueda}`,
    confirmarTitulo: '¿Borrar el historial?',
    confirmarTexto: 'Se borran tus búsquedas recientes de este teléfono.',
    cancelar: 'Cancelar',
    confirmarBorrar: 'Borrar',
  },
  invitacion: {
    ahoraNo: 'Ahora no',
    cerrar: 'Cerrar',
  },
  loQueSeguis: {
    titulo: 'Lo que seguís',
    irAlRadar: 'Ir al Radar',
    lugares: 'Lugares',
    cuentas: 'Cuentas de Instagram',
    categorias: 'Categorías',
    dejarDeSeguir: 'Dejar de seguir',
    dejandoDeSeguir: 'Dejando de seguir…',
    dejarDeSeguirA: (nombre: string) => `Dejar de seguir ${nombre}`,
  },
  cines: {
    titulo: 'Cines',
    buscar: 'Buscar película por nombre...',
    limpiarBusqueda: 'Limpiar búsqueda',
  },
  idioma: {
    titulo: 'Idioma',
    descripcion: 'El idioma de la app. «Automático» usa el del teléfono.',
    automatico: 'Automático',
    castellano: 'Español',
    ingles: 'English',
    cambiadoA: (nombre: string) => `Idioma: ${nombre}`,
  },
  lugaresChicos: {
    titulo: 'Lugares para chicos',
    acceso: 'Plazas, peloteros, salones de juegos y espacios culturales',
    leyenda:
      'Los datos los carga y verifica el equipo de Qué Pinta Salta. No inspeccionamos los lugares: confirmá horarios antes de ir.',
    todos: 'Todos',
    todosLosTipos: 'Todos los tipos',
    gratis: 'Gratis',
    soloGratis: 'Solo lugares gratis',
    abiertoAhora: 'Abierto ahora',
    elegiTuBarrio: 'Elegí tu barrio',
    elegiTuBarrioEtiqueta: 'Elegí tu barrio para ordenar por cercanía',
    cercaDe: (barrio: string) => `Cerca de ${barrio}`,
    barrioCambiar: (barrio: string) => `Barrio: ${barrio}. Cambiar`,
    sinBarrio: 'Sin barrio',
    sinOrdenar: 'Sin ordenar por cercanía',
    ordenadosPorBarrio: (barrio: string) => `Ordenados por cercanía a ${barrio}`,
    ordenadosPorUbicacion: 'Ordenados por cercanía a tu ubicación aproximada.',
    barrioPrivacidad: 'El barrio se usa solo en el teléfono para ordenar la lista: no se guarda ni se manda.',
    conteo: (n: number) => (n === 0 ? 'Ningún lugar con estos filtros' : n === 1 ? '1 lugar' : `${n} lugares`),
    vacioSinDatos: 'Todavía no hay lugares verificados. Estamos cargando los primeros.',
    vacioConFiltros: 'No hay lugares con estos filtros.',
    abreLaFicha: 'Abre la ficha del lugar',
    tituloFicha: 'Lugar para chicos',
    yaNoEsta: 'Este lugar ya no está publicado.',
    comoLlegar: 'Cómo llegar',
    comoLlegarA: (nombre: string) => `Cómo llegar a ${nombre}`,
    horarios: 'Horarios',
    conReserva: 'Con reserva: escribiles o llamalos antes de ir.',
    espacioAbierto: 'Espacio abierto',
    verificadoEl: (fecha: string) => `Verificado el ${fecha}`,
    puedeHaberCambiado: 'Puede haber cambiado: confirmá antes de ir.',
    web: 'Web',
    webDe: (nombre: string) => `Web de ${nombre}`,
    instagram: 'Instagram',
    instagramDe: (nombre: string) => `Instagram de ${nombre}`,
    llamar: 'Llamar',
    llamarA: (nombre: string) => `Llamar a ${nombre}`,
    errorCarga: 'No pudimos cargar los lugares para chicos. Revisá tu conexión.',
  },
  // ── Q6-1: Inicio, Buscar, Mis eventos, Radar, Cuenta y sus componentes ──
  // Las frases con datos (conteos, nombres de categoría) son funciones: cada
  // idioma arma la oración a su manera, no se traduce palabra por palabra.
  portada: {
    atajos: { hoy: 'Hoy', 'esta-noche': 'Esta noche', finde: 'Finde', semana: 'Semana' },
    /** «para ___»: lo que completa «No hay eventos de Música para ___.». */
    frases: { hoy: 'hoy', 'esta-noche': 'esta noche', finde: 'el finde', semana: 'esta semana' },
    hoyEnSalta: 'Hoy en Salta',
    vacioHoy: 'Hoy no hay eventos cargados. Mirá qué viene en los próximos días.',
    verEstaSemana: 'Ver esta semana',
    verLoDeHoy: 'Ver lo de hoy',
    verElFinde: 'Ver el finde',
    buscarEnTodasLasFechas: 'Buscar en todas las fechas',
    verCartelera: 'Ver cartelera',
    verCategoriaEnTodasLasFechas: (nombre: string) => `Ver ${nombre} en todas las fechas`,
    todasLasCategorias: 'Todas las categorías',
    verTodosLosPrecios: 'Ver todos los precios',
    verTodasLasEdades: 'Ver todas las edades',
    enCartel: 'En cartel',
    conteo: (peliculas: number, eventos: number) => {
      const textoEventos = `${eventos} ${eventos === 1 ? 'evento' : 'eventos'}`
      if (peliculas === 0) return textoEventos
      const textoPeliculas = `${peliculas} ${peliculas === 1 ? 'película' : 'películas'}`
      return eventos === 0 ? textoPeliculas : `${textoPeliculas} · ${textoEventos}`
    },
    /** «Gratis» / «Música gratis» (sin la fecha). */
    quienGratis: (nombreCategoria: string | null) => (nombreCategoria === null ? 'Gratis' : `${nombreCategoria} gratis`),
    vacioGratis: (nombreCategoria: string | null, frase: string, esCine: boolean) => {
      if (nombreCategoria === null) return `No hay eventos gratis para ${frase}.`
      const base = `No hay eventos gratis de ${nombreCategoria} para ${frase}.`
      return esCine ? `${base} Las películas en cartel no son gratis.` : base
    },
    vacioCategoriaSimple: (nombreCategoria: string, frase: string) => `No hay eventos de ${nombreCategoria} para ${frase}.`,
    /** «Para chicos» / «Música gratis para chicos» / «Infantil» (sin la fecha). */
    quienParaChicos: (nombreCategoria: string | null, esInfantil: boolean, gratis: boolean) => {
      const conGratis = gratis ? ' gratis' : ''
      if (nombreCategoria === null) return gratis ? 'Gratis para chicos' : 'Para chicos'
      if (esInfantil) return `${nombreCategoria}${conGratis}`
      return `${nombreCategoria}${conGratis} para chicos`
    },
    vacioParaChicos: (nombreCategoria: string | null, esInfantil: boolean, esCine: boolean, gratis: boolean, frase: string) => {
      const conGratis = gratis ? ' gratis' : ''
      if (nombreCategoria === null) return `No hay eventos${conGratis} para chicos ${frase}.`
      if (esInfantil) return `No hay eventos${conGratis} de ${nombreCategoria} para ${frase}.`
      const base = `No hay eventos${conGratis} de ${nombreCategoria} para chicos ${frase}.`
      if (!esCine) return base
      if (gratis) return `${base} Las películas en cartel no son gratis.`
      return `${base} Las películas en cartel no tienen la edad cargada, así que no aparecen con «Para chicos».`
    },
    /** Lo que se anuncia al salir del modo grilla: «Sin filtros: todos los eventos de hoy». */
    salidaGrilla: { hoy: 'Sin filtros: todos los eventos de hoy', 'esta-noche': 'Sin filtros: todos los eventos de esta noche', finde: 'Sin filtros: todos los eventos del finde', semana: 'Sin filtros: todos los eventos de esta semana' },
  },
  vacios: {
    hoySinConexion: 'Sin conexión no vemos eventos para hoy. Mirá qué viene en los próximos días.',
    nocheEnFilas: 'Lo de esta noche está más abajo, por categoría.',
    nocheSinConexion: 'Sin conexión no vemos eventos para esta noche. Fijate qué hay durante el día.',
    nocheVacia: 'No hay eventos para esta noche. Fijate qué hay durante el día.',
    findeEnFilas: 'Lo del finde no es para hoy: está más abajo, por categoría.',
    findeSinConexion: 'Sin conexión no vemos eventos para el finde. Mirá qué viene en la semana.',
    findeVacio: 'No hay eventos para el finde. Mirá qué viene en la semana.',
    semanaEnFilas: 'Hoy no hay nada, pero esta semana sí: está más abajo, por categoría.',
    semanaSinConexion: 'Sin conexión no vemos eventos para esta semana.',
    semanaVacia: 'No hay eventos para esta semana. Buscá entre todas las fechas.',
    cineSinConexion: 'Sin conexión no podemos mostrarte la cartelera.',
    categoriaSinConexion: (nombre: string, frase: string) => `Sin conexión no vemos eventos de ${nombre} para ${frase}.`,
    cineVacio: (nombre: string, frase: string) => `No hay películas en cartel ni eventos de ${nombre} para ${frase}.`,
    categoriaVacia: (nombre: string, frase: string) => `No hay eventos de ${nombre} para ${frase}.`,
    /** Buscar sin resultados (A6): `frase` es «hoy», «el finde»… o `null` sin fecha. */
    buscarConTexto: (texto: string, gratis: boolean, nombreCategoria: string | null, frase: string | null) =>
      `No encontramos eventos${gratis ? ' gratis' : ''} con "${texto}"${nombreCategoria ? ` en ${nombreCategoria}` : ''}${frase ? ` para ${frase}` : ''}.`,
    buscarSinTexto: (gratis: boolean, nombreCategoria: string | null, frase: string | null) =>
      `No hay eventos${gratis ? ' gratis' : ''}${nombreCategoria ? ` en ${nombreCategoria}` : ''}${frase ? ` para ${frase}` : ' por ahora'}.`,
    limpiarBusqueda: 'Limpiar búsqueda',
    verTodasLasFechas: 'Ver todas las fechas',
    sacarSoloGratis: 'Sacar «Solo gratis»',
    todasLasCategorias: 'Todas las categorías',
    categoriasBuscar: 'Por ahora no hay categorías para mostrar. Tocá Reintentar o buscá por nombre arriba.',
    cinesSinResultados: (busqueda: string) => `No hay resultados para "${busqueda}". Probá buscando con otro título.`,
    cinesVacio: 'Por ahora no hay películas en cartel. Mientras tanto, mirá qué otros eventos hay hoy.',
    verEventosDeHoy: 'Ver eventos de hoy',
    favoritos: 'Todavía no guardaste ningún evento en Mis eventos. Tocá el corazón o «Voy» en un evento y aparece acá.',
    favoritosSinConexion: 'No hay eventos por venir en Mis eventos.',
    verLaAgenda: 'Ver la agenda',
    favoritosPasados: 'Los eventos que ya pasaron no se muestran.',
    radarSinSesion: 'Con tu cuenta elegís qué eventos te llegan por correo.',
    radarSinCategorias: 'Todavía no hay categorías para elegir. Mientras tanto, podés seguir lugares y cuentas de Instagram acá abajo.',
    radarYaSeguis: (buscado: string) => `Ya seguís todo lo que coincide con "${buscado}".`,
    radarSinCoincidencias: (buscado: string) => `No encontramos lugares ni cuentas con "${buscado}". Probá con otro nombre.`,
  },
  mensajes: {
    sinConfiguracion: MENSAJE_SIN_CONFIGURACION,
    sinConexion: {
      inicio: MENSAJE_SIN_CONEXION_INICIO,
      favoritos: MENSAJE_SIN_CONEXION_FAVORITOS,
      buscar: MENSAJE_SIN_CONEXION_BUSCAR,
      cines: MENSAJE_SIN_CONEXION_CINES,
      radar: MENSAJE_SIN_CONEXION_RADAR,
    },
    servidor: {
      inicio: MENSAJE_ERROR_SERVIDOR_EVENTOS,
      buscar: MENSAJE_ERROR_SERVIDOR_EVENTOS,
      cines: MENSAJE_ERROR_SERVIDOR_CINES,
      favoritos: MENSAJE_ERROR_SERVIDOR_FAVORITOS,
      radar: MENSAJE_ERROR_SERVIDOR_RADAR,
    },
    seguimosSinConexion: MENSAJE_SEGUIMOS_SIN_CONEXION,
    volvioLaConexion: MENSAJE_VOLVIO_LA_CONEXION,
    actualizado: MENSAJE_ACTUALIZADO,
    noSeActualizoSinConexion: MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION,
    noSeActualizo: MENSAJE_NO_SE_ACTUALIZO,
    tituloSinConexion: 'Sin conexión, mostrando lo último guardado',
    guardadoInvalido: 'Guardado hace un tiempo',
    guardadoHoy: (hora: string) => `Guardado hoy a las ${hora}`,
    guardadoAyer: (hora: string) => `Guardado ayer a las ${hora}`,
    guardadoEl: (diaYMes: string, hora: string) => `Guardado el ${diaYMes} a las ${hora}`,
  },
  /**
   * Los mensajes que llegan ya armados de `lib/` (errores de carga y de
   * guardado de la capa de datos) o de `@qps/core`: en castellano se muestran
   * tal cual; `en.errores.traducir` los busca por su texto (mismo patrón que
   * `apps/web/lib/i18n/diccionarios/en.ts`, `MENSAJES_AUTH`).
   */
  errores: {
    traducir: (mensaje: string) => mensaje,
  },
  anuncios: {
    explorar: 'Sin filtros: explorar por categoría',
    soloGratis: 'solo gratis',
    paraChicos: 'para chicos',
    peliculas: (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'película' : 'películas'}`,
    peliculasPara: (conteo: string, busqueda: string) => `${conteo} para ${busqueda}`,
    ningunaPelicula: (busqueda: string) => `Ninguna película para ${busqueda}`,
    enCartel: (conteo: string) => `${conteo} en cartel`,
  },
  buscar: {
    etiqueta: 'Buscar',
    placeholder: 'Buscar por evento, lugar o descripción...',
    limpiarBusqueda: 'Limpiar búsqueda',
    cualquierFecha: 'Cualquier fecha',
    soloGratis: 'Solo gratis',
    explorar: 'Explorar por categoría',
    resultados: (cantidad: number, f: { texto: string; gratis: boolean; paraChicos: boolean; nombreCategoria: string | null; frase: string | null }) => {
      const plural = cantidad !== 1 ? 's' : ''
      const enCategoria = f.nombreCategoria ? ` en ${f.nombreCategoria}` : ''
      const sufijoFecha = f.frase ? ` · ${f.frase}` : ''
      if (f.texto) return `${cantidad} resultado${plural} para "${f.texto}"${enCategoria}${sufijoFecha}`
      return `${cantidad} evento${plural}${f.gratis ? ' gratis' : ''}${f.paraChicos ? ' para chicos' : ''}${enCategoria}${sufijoFecha}`
    },
    sinResultados: (f: { texto: string; gratis: boolean; paraChicos: boolean; nombreCategoria: string | null; frase: string | null }) => {
      const enCategoria = f.nombreCategoria ? ` en ${f.nombreCategoria}` : ''
      if (f.texto) return `No se encontraron eventos para "${f.texto}"${enCategoria}${f.frase ? ` · ${f.frase}` : ''}`
      const gratis = f.gratis ? ' gratis' : ''
      if (f.paraChicos) return `No hay eventos${gratis} para chicos${enCategoria}${f.frase ? ` ${f.frase}` : ' por ahora'}.`
      return `No hay eventos${gratis}${enCategoria}${f.frase ? ` para ${f.frase}` : ' por ahora'}.`
    },
  },
  misEventos: {
    titulo: 'Mis eventos',
    entraParaGuardar: 'Entrá para guardar tus favoritos',
    ingresar: 'Ingresar',
    guardados: (n: number) => `Tenés ${n} ${n === 1 ? 'elemento guardado' : 'elementos guardados'} organizados para tu salida.`,
    compartirWhatsApp: 'Compartir agenda por WhatsApp',
    flexibles: (n: number) => `Plan flexible / sin fecha definida (${n})`,
    voy: (n: number) => `Voy (${n})`,
    lugaresQueSeguis: 'Lugares que seguís',
    sinLugares: 'Todavía no seguís ningún lugar. Tocá «Seguir» en la ficha de un evento y te avisamos cuando anuncie algo nuevo.',
    verFichaDelLugar: (nombre: string) => `${nombre}: ver la ficha del lugar`,
  },
  cuenta: {
    iniciarSesion: 'Iniciar sesión',
    email: 'Email',
    contrasena: 'Contraseña',
    olvidaste: '¿Olvidaste tu contraseña?',
    entrar: 'Entrar',
    crearCuenta: 'Crear cuenta',
    oContinuarCon: 'O continuar con',
    verBienvenida: 'Ver la bienvenida',
    cerrarSesion: 'Cerrar sesión',
    eliminarCuenta: 'Eliminar mi cuenta',
    miRadar: 'Mi Radar Salteño',
    /** El título de la fila de la contraseña («Contraseña» / «Cambiar contraseña», de core). */
    filaContrasena: (tituloDeCore: string) => tituloDeCore,
    version: (textoDeVersion: string) => textoDeVersion,
    continuarConGoogle: 'Continuar con Google',
    google: 'Google',
    mostrarContrasena: 'Mostrar contraseña',
    ocultarContrasena: 'Ocultar contraseña',
    privacidad: 'Política de privacidad',
    terminos: 'Términos y condiciones',
    aceptacion: 'Al crear tu cuenta o continuar con Google aceptás los Términos y condiciones y la Política de privacidad.',
    aceptacionSoloPrivacidad: 'Al crear tu cuenta o continuar con Google aceptás la Política de privacidad.',
    privacidadAnuncios: 'Privacidad de los anuncios',
    seguis: {
      vacio: 'Todavía no seguís nada. Seguí un lugar desde la ficha de un evento, o elegí categorías en el Radar.',
      errorCarga: 'No pudimos cargar lo que seguís. Probá de nuevo.',
      errorCambio: 'No pudimos actualizar el seguimiento. Probá de nuevo.',
    },
  },
  radar: {
    titulo: 'Mi Radar Salteño',
    bajada:
      'Vos decidís qué eventos ver y recibir. Suscribite a tus categorías, locales u organizadores favoritos de Instagram y recibí alertas a tu correo sin spam.',
    frecuencias: {
      weekly: 'Semanalmente (todos los jueves a las 18:00)',
      biweekly: 'Cada 2 semanas (quincenal)',
      monthly: 'Mensualmente',
      disabled: 'Desactivado (pausar alertas)',
    },
    resumenPausado: 'Tu Radar está pausado',
    resumenActivo: { weekly: (email: string) => `Tu Radar está activo: te llega cada semana a ${email}`, biweekly: (email: string) => `Tu Radar está activo: te llega cada 2 semanas a ${email}`, monthly: (email: string) => `Tu Radar está activo: te llega cada mes a ${email}` },
    ingresar: 'Ingresar para armar tu Radar',
    frecuenciaTitulo: 'Frecuencia y destinatario',
    cadaCuanto: '¿Cada cuánto querés recibir novedades?',
    emailEtiqueta: 'Dirección de correo electrónico',
    emailNota: 'Te lo mandamos al email de tu cuenta.',
    categoriasTitulo: 'Categorías que te interesan',
    categoriasNota: 'Vas a recibir alertas de todos los eventos que se clasifiquen en las categorías que elijas.',
    lugaresTitulo: 'Lugares y organizadores preferidos',
    lugaresNota:
      'Seguí locales físicos o directamente a organizadores/boliches de Instagram (ej: La Metro, Sex Us Machina) para enterarte de sus novedades.',
    buscar: 'Buscar',
    placeholder: 'Buscá locales físicos o cuentas de Instagram (ej: Usina, Metro, Sex Us...)',
    instagram: 'Instagram',
    lugar: 'Lugar',
    dejarDeSeguir: (nombre: string) => `Dejar de seguir ${nombre}`,
    sinSeguidos: 'No estás siguiendo ningún local ni cuenta de Instagram aún. Escribí arriba para buscarlos y agregarlos.',
    cambiosSinGuardar: 'Tenés cambios sin guardar',
    guardadoOk: '¡Ya estás en el Radar! 📧',
    guardadoOkDetalle: 'Vas a recibir los mejores eventos en tu correo.',
    sinConexion: 'Sin conexión',
    errorGuardar: 'Error al guardar',
    anuncioSinConexion: (detalle: string) => `Sin conexión. ${detalle}`,
    pruebaEnviada: 'Prueba enviada',
    pruebaFallo: 'No se pudo enviar la prueba',
    enviandoPrueba: 'Enviando prueba...',
    enviarPrueba: 'Enviar un email de prueba',
    guardando: 'Guardando...',
    guardar: 'Guardar preferencias del Radar',
  },
  notificaciones: {
    titulo: 'Notificaciones',
    recordatoriosFavoritos: 'Recordatorios de favoritos',
    novedadesSeguis: 'Novedades de lo que seguís',
    patrocinados: 'Avisos patrocinados',
    patrocinadosDescripcion: 'Hasta 1 por semana, de eventos de Salta. Llevan la etiqueta «Patrocinado».',
    equipo: 'Avisos de Qué Pinta Salta',
    equipoDescripcion: 'Novedades y avisos del equipo de Qué Pinta Salta.',
    canalRadar: 'Canal del Radar',
    canales: { email: 'Email', push: 'Push', ambos: 'Ambos' },
    radarPorEmail: 'Por ahora el Radar te sigue llegando por email.',
    silencio: 'Horario de silencio',
    desde: 'Desde',
    hasta: 'Hasta',
    guardar: 'Guardar notificaciones',
    guardadas: 'Guardamos tus notificaciones.',
    estadosPush: {
      'sin-sesion': 'Iniciá sesión para activar las notificaciones.',
      'sin-pedir': 'Activá las notificaciones para enterarte de las novedades.',
      pidiendo: 'Pidiendo el permiso...',
      denegado: 'No activaste las notificaciones. Podés intentarlo de nuevo cuando quieras.',
      bloqueado: 'Tenés las notificaciones bloqueadas para esta app. Activalas desde los ajustes del teléfono.',
      'no-disponible': 'Por ahora este teléfono no puede recibir notificaciones de la app.',
      'error-registro': 'No pudimos activar las notificaciones. Probá de nuevo.',
      activo: 'Las notificaciones están activas en este teléfono.',
    },
    activar: 'Activar notificaciones',
    abrirAjustes: 'Abrir ajustes',
    reintentar: 'Reintentar',
    explicacionCuenta:
      'Te avisamos antes de tus favoritos y cuando haya algo nuevo de lo que seguís en tu Radar. Podés elegir qué te llega y el horario de silencio.',
    preguntaFavoritos: '¿Querés que te avisemos antes de tus favoritos?',
    sinSesionTitulo: 'Avisos',
    sinSesionTexto:
      'Sin cuenta te podemos mandar avisos del equipo y, si los activás, patrocinados. Para recordatorios de lo que guardás y tu Radar, entrá a tu cuenta.',
    noSePudoCambiar: 'No pudimos cambiar los avisos. Probá de nuevo en un rato.',
    patrocinadosSinSesion: 'Anuncios pagos: hasta 1 por semana, de eventos de Salta. Llevan la etiqueta «Patrocinado».',
    patrocinadosPista: 'Anuncios pagos: hasta 1 por semana.',
    sinPermiso: AVISO_SIN_PERMISO,
    pidePermiso: PISTA_PIDE_PERMISO,
    recordatorios: 'Recordatorios de lo que guardaste',
    recordatoriosDescripcion: 'La tarde anterior (18:00) te recordamos lo que guardaste o marcaste «Voy».',
    finde: 'Este finde pinta',
    findeDescripcion: 'Los jueves a las 18:00, cuántos planes hay para el fin de semana.',
  },
  /** Q6-1: las notificaciones locales (se programan fuera de React, con el idioma guardado). */
  avisos: {
    recordatorio: (titulo: string, hora: string | null) => (hora ? `Mañana: ${titulo} a las ${hora}` : `Mañana: ${titulo}`),
    recordatorioCuerpo: 'Tocá para ver el evento.',
    finde: (planes: number, gratis: number) => {
      const p = planes === 1 ? '1 plan' : `${planes} planes`
      return gratis > 0 ? `Este finde pinta: ${p}, ${gratis} gratis` : `Este finde pinta: ${p}`
    },
    findeCuerpo: 'Mirá qué hay para el viernes, el sábado y el domingo.',
  },
  tarjeta: {
    marca: 'QUÉ PINTA SALTA',
    enCartel: 'En cartel',
    masFechas: (n: number) => `+${n} fechas`,
    destacado: '★ Destacado',
    eventoDestacado: 'Evento destacado',
    etiquetaEvento: (e: { titulo: string; fecha: string; hora: string; lugar: string; destacado: boolean; precio: string | null; otrasFechas: number }) =>
      `${e.titulo}, ${e.fecha}${e.hora ? ` ${e.hora}` : ''}, en ${e.lugar}` +
      (e.destacado ? ', destacado' : '') +
      (e.precio ? `, ${e.precio}` : '') +
      (e.otrasFechas > 0 ? `, ${e.otrasFechas} ${e.otrasFechas === 1 ? 'fecha más' : 'fechas más'}` : ''),
    etiquetaPelicula: (e: { titulo: string; destacado: boolean; precio: string | null }) =>
      `${e.titulo}, en cartel${e.destacado ? ', destacado' : ''}${e.precio ? `, ${e.precio}` : ''}`,
    gratis: 'Gratis',
    cantidadEventos: (n: number) => `${n} ${n === 1 ? 'evento' : 'eventos'}`,
    agregarFavorito: (nombre?: string) => (nombre ? `Agregar ${nombre} a favoritos` : 'Agregar a favoritos'),
    quitarFavorito: (nombre?: string) => (nombre ? `Quitar ${nombre} de favoritos` : 'Quitar de favoritos'),
    compartir: (titulo: string) => `Compartir ${titulo}`,
    verTodos: 'Ver todos',
    cines: (n: number) => `${n} ${n === 1 ? 'cine' : 'cines'}`,
    comprarEntradas: 'Comprar entradas',
    compartirImagen: 'Compartir imagen',
    compartirLink: 'Compartir link',
    cerrar: 'Cerrar',
    noSePudoCompartir: 'No pudimos compartir. Probá de nuevo.',
    compartimosElLink: 'No pudimos armar la imagen; compartimos el link.',
  },
  hero: {
    irAlEvento: (n: number) => `Ir al evento ${n}`,
    verDetalles: 'Ver detalles',
    entradaGratuita: 'Entrada gratuita',
    siguiente: 'Siguiente evento',
    anterior: 'Evento anterior',
    diapositiva: (titulo: string, indice: number, total: number) =>
      total === 1 ? `${titulo}, ver detalles` : `${titulo}, ver detalles, ${indice + 1} de ${total}`,
  },
  banners: {
    radarTitulo: '¡No te pierdas ningún evento!',
    radarTexto: 'Elegí tus categorías favoritas y recibí la agenda del fin de semana directamente en tu correo.',
    radarBoton: 'Configurar mi Radar 📡',
    publicidad: 'Publicidad',
  },
  encabezado: {
    irAInicio: 'Ir a Inicio',
    irACuenta: 'Ir a Cuenta',
    ingresar: 'Ingresar',
  },
  chipsCategorias: {
    todas: 'Todas',
    todasLasCategorias: 'Todas las categorías',
  },
  esqueleto: {
    cargando: 'Cargando',
  },
  // ── Q6-1b: Eliminar mi cuenta, Contraseña, la pantalla de error general y
  // los componentes de la ficha (fila de acciones, calendario, seguir, aviso
  // patrocinado) ──
  eliminarCuenta: {
    titulo: 'Eliminar mi cuenta',
    paraSiempre: 'Esta acción es para siempre y no se puede deshacer.',
    cuenta: (email: string) => `Cuenta: ${email}`,
    queSeBorraTitulo: 'Qué se borra:',
    /**
     * PARIDAD: la MISMA lista, en el mismo orden, que la web (`/eliminar-cuenta`
     * y `/perfil/eliminar-cuenta`). La compara, en castellano,
     * `apps/web/tests/cuenta/play-pendientes.test.ts` (lee este bloque).
     */
    queSeBorra: [
      'Tus favoritos.',
      'Tus marcas de "Voy".',
      'Las preferencias de Mi Radar y de notificaciones.',
      'Los avisos que tenés activados.',
      'El historial de los avisos que te mandamos.',
      'Los tokens de aviso de tu celular.',
      'La cuenta misma, con tu email y tu contraseña.',
    ],
    queNoSeBorraTitulo: 'Qué no se borra:',
    queNoSeBorra: 'Los eventos que cargaste siguen publicados, pero quedan sin tu nombre: pasan a figurar sin autor.',
    escribinos: 'Si no podés eliminarla desde acá, escribinos a',
    correoContacto: (email: string) => `Correo de contacto: ${email}`,
    comoCopiar: 'Mantené presionado para copiarlo',
    /** La palabra que se escribe es siempre ELIMINAR (la exige el servidor, `lib/cuenta.ts`). */
    confirmar: 'Escribí ELIMINAR para confirmar',
    palabra: 'ELIMINAR',
    boton: 'Eliminar mi cuenta para siempre',
  },
  contrasena: {
    /** Los textos de core (`textosContrasena`), por tipo de cuenta: en inglés, los de la web (`cambioContrasena.modos`). */
    modos: {
      google: textosContrasena('google'),
      email: textosContrasena('email'),
      mixta: textosContrasena('mixta'),
      desconocida: textosContrasena('desconocida'),
    },
    contrasenaNueva: 'Contraseña nueva',
    repetila: 'Repetila',
    guardada: 'Contraseña guardada. Ya podés entrar con tu email y esta contraseña.',
    volver: 'Volver',
  },
  /** La pantalla de error de todo el árbol (`ErrorBoundary` de `app/_layout.tsx`). */
  errorGeneral: {
    titulo: 'Algo salió mal.',
    texto: 'Volvé a intentar en un momento.',
    reintentar: 'Reintentar',
  },
  /** ♥ Guardar · ✓ Voy · Compartir, de la ficha (`FilaAccionesEvento`). */
  fila: {
    guardar: '♥ Guardar',
    guardado: '♥ Guardado',
    /** El texto de core («Voy» / «Voy · 5 van») con el ✓ de la interfaz. */
    voy: (cantidad: number) => `✓ ${textoBotonVoy(cantidad)}`,
    compartir: 'Compartir',
    etiquetaGuardar: 'Guardar este evento en tus favoritos',
    etiquetaQuitarGuardado: 'Quitar este evento de tus guardados',
    etiquetaVoy: 'Marcar que vas a este evento',
    etiquetaNoVoy: 'Dejar de marcar que vas a este evento',
    noDisponible: 'Pronto vas a poder guardar o marcar si vas.',
    entrarParaGuardar: 'Entrá para guardar o marcar si vas.',
  },
  calendario: {
    agregar: 'Agregar al calendario',
    enTuCalendario: 'En tu calendario',
    agregado: 'Listo, lo agregamos a tu calendario.',
    sinPermiso: 'Sin permiso para usar el calendario.',
    sinCalendario: 'No encontramos un calendario donde guardarlo.',
    error: 'No pudimos agregarlo al calendario. Probá de nuevo.',
    abrirAjustes: 'Abrir Ajustes',
  },
  /** «+ Seguir» de un lugar o una cuenta, en la ficha (`BotonSeguir`): el texto visible es el de core. */
  seguir: {
    lugar: (siguiendo: boolean) => textoSeguir(siguiendo),
    cuenta: (usuario: string, siguiendo: boolean) => textoSeguirCuenta(usuario, siguiendo),
    seguirA: (nombre: string) => `Seguir ${nombre}`,
    dejarDeSeguirA: (nombre: string) => `Dejar de seguir ${nombre}`,
  },
  /** La franja de la ficha que llega por un push patrocinado y la baja rápida del push. */
  patrocinado: {
    franja: 'Llegaste por un aviso patrocinado',
    boton: 'No recibir más avisos patrocinados',
    listo: 'Listo, no vas a recibir más. Podés volver a prenderlos en Cuenta.',
    bajaPush: 'Listo: no te vamos a mandar más avisos patrocinados. Podés volver a prenderlos en Cuenta.',
    bajaPushError: 'No pudimos apagar los avisos patrocinados. Probá desde Cuenta.',
  },
}

export type Diccionario = typeof es
